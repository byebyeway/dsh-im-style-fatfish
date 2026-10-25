"""List archive entry paths containing <needle>. Usage: python list-asar.py <asar> <needle> [limit]"""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

asar, needle = sys.argv[1], sys.argv[2]
limit = int(sys.argv[3]) if len(sys.argv) > 3 else 40
data = open(asar, "rb").read()
hsize = int.from_bytes(data[4:8], "little")
start = 8 + hsize
i = data.find(b'{"files"', 0, 4096)
header, _ = json.JSONDecoder().raw_decode(data[i:start].decode("utf-8", "replace"))


def walk(node, prefix=""):
    for name, meta in node.items():
        path = prefix + "/" + name
        if "files" in meta:
            yield from walk(meta["files"], path)
        else:
            yield path


hits = [path for path in walk(header["files"]) if needle in path]
print(len(hits), "matches")
for path in hits[:limit]:
    print(path)
