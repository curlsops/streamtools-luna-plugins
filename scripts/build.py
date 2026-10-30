#!/usr/bin/env python3
"""Build the files Luna installs from a release: dist/store.json, dist/<name>.json and dist/<name>.mjs for every plugin in plugins/.
A plugin "@curls/streamtools-queue" is published as "curls.streamtools-queue" (the name without the @, / replaced by a dot).
The manifest's "hash" is a hash of the code, so Luna reloads a plugin whenever its code changes."""
import base64, hashlib, json, os, shutil, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DIST = os.path.join(ROOT, "dist")
shutil.rmtree(DIST, ignore_errors=True)
os.makedirs(DIST)
names = []
for folder in sorted(os.listdir(os.path.join(ROOT, "plugins"))):
    base = os.path.join(ROOT, "plugins", folder)
    manifest = json.load(open(os.path.join(base, "manifest.json"), encoding="utf-8"))
    code = open(os.path.join(base, "index.mjs"), "rb").read()
    manifest["hash"] = base64.b64encode(hashlib.sha256(code).digest())[:11].decode()
    published = manifest["name"].lstrip("@").replace("/", ".")
    json.dump(manifest, open(os.path.join(DIST, published + ".json"), "w", encoding="utf-8"), indent=2)
    open(os.path.join(DIST, published + ".mjs"), "wb").write(code)
    names.append(published)
store = {"name": "Stream Tools plugins", "description": "TidaLunar plugins for the Stream Tools stream setup",
         "author": {"name": "curls", "url": "https://github.com/curlsops", "avatarUrl": ""}, "plugins": names}
json.dump(store, open(os.path.join(DIST, "store.json"), "w", encoding="utf-8"), indent=2)
print("built", ", ".join(names), "->", os.path.relpath(DIST))
