"""Generate all application icons from a source PNG.
Usage: python scripts/generate-icons.py [source] [output-dir]
Default source: ../icon.png  Default output: ../src-tauri/icons
"""

import struct, io, os, sys
from PIL import Image

SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'icon.png')
DST = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'src-tauri', 'icons')

img = Image.open(SRC).convert('RGBA')
os.makedirs(DST, exist_ok=True)

PNG_SIZES = {
    '32x32.png': 32,
    '128x128.png': 128,
    '128x128@2x.png': 256,
    'icon.png': max(img.size),
}
for name, w in PNG_SIZES.items():
    (img if w >= img.size[0] else img.resize((w, w), Image.LANCZOS)).save(os.path.join(DST, name))
    print(f'{name}: {w}x{w}')

ICO_SIZES = [256, 64, 48, 32, 24, 16]
png_data_list = []
entries = []
offset = 6 + len(ICO_SIZES) * 16

for s in ICO_SIZES:
    resized = img.resize((s, s), Image.LANCZOS)
    buf = io.BytesIO()
    resized.save(buf, format='PNG')
    png = buf.getvalue()
    w_byte = s if s < 256 else 0
    h_byte = s if s < 256 else 0
    entries.append(struct.pack('<BBBBHHII', w_byte, h_byte, 0, 0, 1, 32, len(png), offset))
    png_data_list.append(png)
    offset += len(png)

ico_path = os.path.join(DST, 'icon.ico')
with open(ico_path, 'wb') as f:
    f.write(struct.pack('<HHH', 0, 1, len(ICO_SIZES)))
    for e in entries:
        f.write(e)
    for p in png_data_list:
        f.write(p)

with open(ico_path, 'rb') as f:
    h = f.read(6)
    reserved, type_, count = struct.unpack('<HHH', h)
    print(f'icon.ico: {count} entries, type={type_}, {offset} bytes — OK')
