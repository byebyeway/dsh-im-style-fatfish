"""Peek at a file inside DSH's app.asar without Electron.

Usage: python peek-asar.py <asar-path> <needle-in-path> <out-file>
Extracts the first archive entry whose path contains <needle-in-path>.
"""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

asar, needle, out = sys.argv[1], sys.argv[2], sys.argv[3]
data = open(asar, "rb").read()
hsize = int.from_bytes(data[4:8], "little")
start = 8 + hsize
i = data.find(b'{"files"', 0, 4096)
header, _ = json.JSONDecoder().raw_decode(data[i:start].decode("utf-8", "replace"))

hits = []


def walk(node, prefix=""):
    for name, meta in node.items():
        path = prefix + "/" + name
        if "files" in meta:
            yield from walk(meta["files"], path)
        else:
            yield path, meta


for path, meta in walk(header["files"]):
    if needle in path:
        hits.append((path, meta))

if not hits:
    print("no match for", needle)
    raise SystemExit(1)

hits.sort(key=lambda item: len(item[0]))
path, meta = hits[0]
offset = start + int(meta["offset"])
blob = data[offset:offset + int(meta["size"])]
open(out, "wb").write(blob)
print("extracted", path, len(blob), "bytes ->", out)
print("candidates:", len(hits))
for other, _ in hits[1:6]:
    print("  other:", other)
