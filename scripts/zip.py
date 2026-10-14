import os
import stat
import sys
import zipfile

src, out = sys.argv[1], sys.argv[2]

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for root, _dirs, files in os.walk(src):
        for name in files:
            path = os.path.join(root, name)
            if os.path.islink(path):
                continue
            arcname = os.path.relpath(path, src)
            info = zipfile.ZipInfo(arcname)
            mode = os.stat(path).st_mode
            info.external_attr = (mode & 0xFFFF) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            with open(path, "rb") as f:
                z.writestr(info, f.read())

print(f"{out} <- {src}")
