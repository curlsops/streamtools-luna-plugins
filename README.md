# Stream Tools plugins for TidaLunar

Plugins for [TidaLuna / TidaLunar](https://github.com/Inrixia/TidaLuna) that belong to the Stream Tools stream setup.

## Install

In TidaLunar: **Luna Settings → Plugin Store**, paste this into the install-from-URL box (a URL ending in `/store.json` adds a whole store):

```
https://github.com/curlsops/streamtools-luna-plugins/releases/download/latest/store.json
```

Then press **Install** on the plugin you want.

## streamtools-queue

Lets the Stream Tools daemon (`streamtools`, Twitch chat song requests) control the player:

- It connects **out** to the daemon on this PC (default `ws://127.0.0.1:18767`, changeable in the plugin's settings page) and reports what is
  playing once a second.
- It runs three kinds of command: queue a track after the current one (`playNext`), skip, play/pause. Each is answered with an ack.
- It never reads or sends your Tidal login. It only uses the player's own `PlayState` and `MediaItem`.

Settings (Luna Settings → Plugins → Stream Tools Queue): on/off switch, daemon address, a Reconnect button and a status line.

## Develop

```sh
python3 scripts/build.py          # writes dist/store.json, dist/<name>.json, dist/<name>.mjs
cd dist && python3 -m http.server 3000   # Luna lists a store served on http://127.0.0.1:3000 as "[DEV]"
```

`npm test` (or the three commands in `package.json`) runs the checks. Pushing to `main` runs the tests in GitHub Actions and, only if they pass, publishes the files to the rolling `latest` release (see `.github/workflows/release.yml`). Pull requests run the tests only.
