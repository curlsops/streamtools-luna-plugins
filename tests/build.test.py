#!/usr/bin/env python3
"""The build produces what Luna installs: a store that lists every plugin, and a manifest + code file for each."""
import json, os, subprocess, sys, unittest

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


class Build(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "build.py")], check=True, capture_output=True)
        cls.dist = os.path.join(ROOT, "dist")

    def test_store_lists_every_plugin_with_files(self):
        store = json.load(open(os.path.join(self.dist, "store.json")))
        self.assertTrue(store["plugins"])
        for name in store["plugins"]:
            manifest = json.load(open(os.path.join(self.dist, name + ".json")))
            self.assertEqual(manifest["name"].lstrip("@").replace("/", "."), name)
            self.assertTrue(manifest["hash"])
            self.assertEqual(manifest["type"], "module")
            code = open(os.path.join(self.dist, name + ".mjs"), encoding="utf-8").read()
            self.assertIn("export const unloads", code)      # Luna calls these to clean up a plugin

    def test_hash_changes_with_the_code(self):
        a = json.load(open(os.path.join(self.dist, "curls.streamtools-queue.json")))["hash"]
        path = os.path.join(ROOT, "plugins", "streamtools-queue", "index.mjs")
        original = open(path, "rb").read()
        try:
            open(path, "ab").write(b"\n// changed\n")
            subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "build.py")], check=True, capture_output=True)
            b = json.load(open(os.path.join(self.dist, "curls.streamtools-queue.json")))["hash"]
        finally:
            open(path, "wb").write(original)
            subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "build.py")], check=True, capture_output=True)
        self.assertNotEqual(a, b)


if __name__ == "__main__":
    unittest.main()
