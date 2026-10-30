// Runs the plugin against a fake Luna (the globals Luna gives a plugin), a fake WebSocket and a fake player.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const calls = [];
const sockets = [];
class FakeWebSocket {
  constructor(url) { this.url = url; this.sent = []; this.readyState = 0; sockets.push(this); setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 5); }
  send(m) { this.sent.push(JSON.parse(m)); }
  close() { this.readyState = 3; this.onclose?.(); }
}
globalThis.WebSocket = FakeWebSocket;
globalThis.fetch = () => Promise.reject(new Error("no network in tests"));

const ui = Object.fromEntries(["LunaSettings", "LunaSetting", "LunaSwitchSetting", "LunaTextSetting", "LunaButtonSetting"].map((n) => [n, n]));
const store = { enabled: true, address: "ws://127.0.0.1:18767", debug: false };
globalThis.luna = { core: { modules: {
  "@luna/core": { Tracer: () => ({ trace: { msg: { log() {} } } }), ReactiveStore: { getPluginStorage: async (_n, defaults) => Object.assign(store, { ...defaults, ...store }) } },
  "@luna/lib": {
    PlayState: {
      playing: true, currentTime: 41.7,
      nextMediaItem: async () => ({ id: 222 }),
      playNext: async (ids) => { if (ids.includes(666)) throw new Error("not streamable"); calls.push(["playNext", ids]); },
      next: async () => calls.push(["next"]), play: async () => calls.push(["play"]), pause: async () => calls.push(["pause"]),
    },
    MediaItem: { fromPlaybackContext: async () => ({ id: "111", tidalItem: { title: "Afterlife", artist: { name: "Holding Absence" }, duration: 227 } }) },
  },
  "@luna/ui": ui,
  react: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }), useState: (v) => [v, () => {}], useEffect() {} },
} } };

const plugin = await import(pathToFileURL(path.resolve("plugins/streamtools-queue/index.mjs")).href);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const flatten = (n) => (n && typeof n === "object" ? [n, ...(n.children ?? []).flatMap(flatten)] : []);

test("connects to the daemon address from its settings and says hello", async () => {
  await wait(30);
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].url, "ws://127.0.0.1:18767");
  assert.deepEqual(sockets[0].sent[0], { event: "hello", plugin: "streamtools-queue", version: 1 });
});

test("reports what is playing once a second", async () => {
  await wait(1200);
  const p = sockets[0].sent.find((m) => m.event === "playback");
  assert.ok(p, "no playback report");
  assert.equal(p.id, "111");
  assert.equal(p.title, "Afterlife");
  assert.equal(p.artist, "Holding Absence");
  assert.equal(p.duration, 227);
  assert.equal(p.progress, 41);
  assert.equal(p.playing, true);
  assert.equal(p.nextId, 222);
});

test("runs commands and acknowledges them", async () => {
  const ws = sockets[0];
  const send = (m) => ws.onmessage({ data: JSON.stringify(m) });
  send({ cmd: "playNext", ids: ["157009876"], id: 7 });
  send({ cmd: "next", id: 8 });
  send({ cmd: "pause", id: 9 });
  send({ cmd: "play", id: 10 });
  send({ cmd: "playNext", ids: [666], id: 11 });
  send({ cmd: "explode", id: 12 });
  await wait(50);
  assert.deepEqual(calls, [["playNext", [157009876]], ["next"], ["pause"], ["play"]]);
  const acks = Object.fromEntries(ws.sent.filter((m) => m.event === "ack").map((m) => [m.id, m]));
  for (const id of [7, 8, 9, 10]) assert.equal(acks[id].ok, true, "ack " + id);
  assert.equal(acks[11].ok, false);
  assert.match(acks[11].error, /not streamable/);
  assert.equal(acks[12].ok, false);
  assert.match(acks[12].error, /unknown command/);
});

test("the settings page has the status, switch, address and reconnect controls", () => {
  const titles = flatten(plugin.Settings()).filter((n) => n.props?.title).map((n) => n.props.title);
  assert.deepEqual(titles, ["Status", "Connect to Stream Tools", "Daemon address", "Reconnect", "Debug log"]);
});

test("unloading stops the connection and the timers", async () => {
  for (const unload of plugin.unloads) await unload();
  assert.equal(sockets[0].readyState, 3);
  const before = sockets[0].sent.length;
  await wait(1200);
  assert.equal(sockets[0].sent.length, before, "still reporting after unload");
});
