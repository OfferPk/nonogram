"""Contact sheet of all bundled puzzles (coloured solution + monochrome), for art review. python3 tools/preview.py out_dir"""
import json, re, sys, os
from PIL import Image, ImageDraw
src = open(os.path.join(os.path.dirname(__file__), '..', 'www/js/puzzles.js')).read()
D = json.loads(re.search(r'var D = (\{.*\});\n', src).group(1))
pal = {k: tuple(int(v[i:i+2], 16) for i in (1, 3, 5)) for k, v in D['palette'].items()}
out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/preview'
os.makedirs(out, exist_ok=True)
for p in D['packs']:
    T = 120; cols = 8; n = len(p['puzzles']); rows = (n + cols - 1) // cols
    im = Image.new('RGB', (cols * (T + 10) + 10, rows * (T + 24) + 10), (250, 248, 243)); d = ImageDraw.Draw(im)
    for i, q in enumerate(p['puzzles']):
        x0 = 10 + (i % cols) * (T + 10); y0 = 10 + (i // cols) * (T + 24); cs = T / max(q['w'], q['h'])
        for r, row in enumerate(q['rows']):
            for c, ch in enumerate(row):
                col = pal[ch] if ch != '.' else (236, 231, 222)
                d.rectangle([x0 + c * cs, y0 + r * cs, x0 + (c + 1) * cs - 1, y0 + (r + 1) * cs - 1], fill=col)
        d.text((x0, y0 + T + 4), q['name'][:20], fill=(60, 60, 60))
    im.save(f"{out}/{p['id']}.png")
print('ok')
