// Stream Tools Queue: lets the Stream Tools daemon (Twitch chat song requests) control TidaLunar.
// It connects out to the daemon over a WebSocket, reports what is playing once a second, and runs commands it gets:
//   {cmd:"playNext", ids:[trackId,...]}  {cmd:"next"}  {cmd:"play"}  {cmd:"pause"}   (each is answered with {event:"ack",cmd,ok,error})
//   {cmd:"superseded"}  another copy of this plugin connected after this one: stop (a reload can leave an old copy running)
// It never reads or sends your login; it only uses the player's own PlayState / MediaItem.
const core = luna.core.modules["@luna/core"];
const lib = luna.core.modules["@luna/lib"];
const ui = luna.core.modules["@luna/ui"];
const React = luna.core.modules.react;
const h = React.createElement;
const { trace } = core.Tracer("[StreamtoolsQueue]");

export const unloads = new Set();
export const settings = await core.ReactiveStore.getPluginStorage("StreamtoolsQueue", {
  enabled: true,
  address: "ws://127.0.0.1:18767",
  debug: false,
});

const instance = Math.random().toString(36).slice(2, 8); // which copy of the plugin this is (a reload can leave an old copy running)
let status = "off"; // off | connecting | connected | waiting | retired
let socket = null;
let timer = null;
let alive = true;
let retired = false; // another copy of this plugin took over: this one stays idle
let lastError = "";
const DEBUG = "http://127.0.0.1:18768/log";
const say = (m) => { if (settings.debug) fetch(DEBUG, { method: "POST", body: String(m) }).catch(() => {}); };

function send(obj) {
  if (socket && socket.readyState === 1) socket.send(JSON.stringify(obj));
}

async function snapshot() {
  const ps = lib.PlayState;
  let item = null;
  try { item = await lib.MediaItem.fromPlaybackContext(); } catch {}
  const t = item?.tidalItem ?? {};
  let nextId = null;
  try { nextId = (await ps.nextMediaItem())?.id ?? null; } catch {}
  return {
    event: "playback",
    id: item?.id ?? null,
    title: t.title ?? null,
    artist: t.artist?.name ?? (t.artists?.[0]?.name ?? null),
    duration: t.duration ?? null,
    progress: Math.max(0, Math.floor(Number(ps.currentTime ?? 0))),
    playing: !!ps.playing,
    nextId,
  };
}

function selfInfo() {
  try {
    const p = core.LunaPlugin.getByName?.("@curls/streamtools-queue");
    return { url: p?.url ?? null, hash: p?.package?.hash ?? null };
  } catch { return {}; }
}

function retire() {
  retired = true;
  clearInterval(tick);
  clearTimeout(timer);
  status = "retired";
  try { socket?.close(); } catch {}
  say("superseded by another copy of the plugin: retired");
}

async function run(msg) {
  if (msg.cmd === "superseded") return retire();
  if (retired) return;
  const ps = lib.PlayState;
  try {
    if (msg.cmd === "playNext") await ps.playNext(msg.ids.map(Number));
    else if (msg.cmd === "next") await ps.next();
    else if (msg.cmd === "play") await ps.play();
    else if (msg.cmd === "pause") await ps.pause();
    else throw new Error("unknown command " + msg.cmd);
    send({ event: "ack", cmd: msg.cmd, id: msg.id, ok: true });
    say("ran " + JSON.stringify(msg));
  } catch (e) {
    send({ event: "ack", cmd: msg.cmd, id: msg.id, ok: false, error: String(e?.message ?? e) });
    say("command failed " + JSON.stringify(msg) + " " + e);
  }
}

export function reconnect() {
  clearTimeout(timer);
  try { socket?.close(); } catch {}
  socket = null;
  if (!alive || retired) return;
  if (!settings.enabled) { status = "off"; return; }
  status = "connecting";
  let ws;
  try { ws = new WebSocket(settings.address); } catch (e) { status = "waiting"; lastError = String(e); timer = setTimeout(reconnect, 5000); return; }
  socket = ws;
  ws.onopen = () => { status = "connected"; lastError = ""; send({ event: "hello", plugin: "streamtools-queue", version: 2, instance, ...selfInfo() }); say("connected to " + settings.address); };
  ws.onmessage = (ev) => { try { run(JSON.parse(ev.data)); } catch (e) { say("bad message " + e); } };
  ws.onclose = () => { if (socket === ws) { socket = null; if (alive && !retired && settings.enabled) { status = "waiting"; timer = setTimeout(reconnect, 3000); } } };
  ws.onerror = () => { lastError = "cannot reach " + settings.address; };
}

const tick = setInterval(async () => {
  if (status === "connected" && !retired) send(await snapshot());
}, 1000);

unloads.add(() => { alive = false; clearInterval(tick); clearTimeout(timer); try { socket?.close(); } catch {} });
reconnect();
trace.msg.log("Stream Tools Queue loaded");
say("plugin loaded (settings enabled=" + settings.enabled + " address=" + settings.address + ")");

const STATUS_TEXT = {
  off: "Off",
  connecting: "Connecting...",
  connected: "Connected to the Stream Tools daemon",
  waiting: "Waiting for the Stream Tools daemon",
  retired: "Idle: another copy of this plugin is connected (reload Luna to clear it)",
};

export const Settings = () => {
  const [enabled, setEnabled] = React.useState(settings.enabled);
  const [address, setAddress] = React.useState(settings.address);
  const [debug, setDebug] = React.useState(settings.debug);
  const [, force] = React.useState(0);
  React.useEffect(() => { const i = setInterval(() => force((n) => n + 1), 1000); return () => clearInterval(i); }, []);
  return h(ui.LunaSettings, null,
    h(ui.LunaSetting, { title: "Status", desc: STATUS_TEXT[status] + (lastError && status !== "connected" ? " (" + lastError + ")" : "") }),
    h(ui.LunaSwitchSetting, {
      title: "Connect to Stream Tools",
      desc: "Lets Twitch chat song requests (!sr) queue tracks in this player.",
      checked: enabled,
      onChange: (_e, checked) => { setEnabled((settings.enabled = checked)); reconnect(); },
    }),
    h(ui.LunaTextSetting, {
      title: "Daemon address",
      desc: "WebSocket address of the Stream Tools daemon on this PC.",
      value: address,
      onChange: (e) => setAddress((settings.address = e.target.value)),
    }),
    h(ui.LunaButtonSetting, { title: "Reconnect", desc: "Connect again with the address above.", onClick: () => reconnect() }),
    h(ui.LunaSwitchSetting, {
      title: "Debug log",
      desc: "Developer option: send plugin log lines to a local test server.",
      checked: debug,
      onChange: (_e, checked) => setDebug((settings.debug = checked)),
    }),
  );
};
