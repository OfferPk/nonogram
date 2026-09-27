"""Generates Quillpix's original launcher icons, adaptive foreground, splash images and store icons.
Art: a calm paper tile with a faint 9x9 nonogram grid, a pixel heart revealed in colour and one crossed-out square.
Pure Pillow. Run: python3 assets/make_icon.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter

S = 1024
BG_TOP, BG_BOT = (251, 249, 244), (236, 230, 218)
SPLASH = (246, 243, 236)   # #F6F3EC
LINE = (205, 196, 180)
RED, PINK, INK, CROSS = (209, 73, 91), (243, 177, 194), (51, 71, 95), (170, 160, 144)
HEART = ['.rr.rr.', 'rrrrPrr', 'rrrrrPr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...']


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def background(size):
    im = Image.new('RGB', (size, size))
    d = ImageDraw.Draw(im)
    for y in range(size):
        d.line([(0, y), (size, y)], fill=lerp(BG_TOP, BG_BOT, y / (size - 1)))
    return im


def draw_art(canvas, scale, grid=True):
    """Grid + pixel heart centred on an RGBA canvas; scale = grid width / canvas width."""
    W = canvas.size[0]
    g = W * scale
    x0 = y0 = (W - g) / 2
    n = 9
    cs = g / n
    d = ImageDraw.Draw(canvas)
    if grid:
        for i in range(1, n):
            w = max(1, int(g * (0.008 if i in (1, 8) else 0.004)))
            p = x0 + cs * i
            d.line([(p, y0 + cs * 0.15), (p, y0 + g - cs * 0.15)], fill=LINE, width=w)
            p = y0 + cs * i
            d.line([(x0 + cs * 0.15, p), (x0 + g - cs * 0.15, p)], fill=LINE, width=w)
    # soft shadow under the heart
    sh = Image.new('L', canvas.size, 0)
    sd = ImageDraw.Draw(sh)
    for r, row in enumerate(HEART):
        for c, ch in enumerate(row):
            if ch != '.':
                sd.rectangle([x0 + (c + 1) * cs, y0 + (r + 1) * cs, x0 + (c + 2) * cs, y0 + (r + 2) * cs], fill=255)
    sh = sh.filter(ImageFilter.GaussianBlur(g * 0.025))
    canvas.paste(Image.new('RGBA', canvas.size, (90, 40, 40, 38)), (int(g * 0.01), int(g * 0.025)), sh)
    gap = cs * 0.07
    for r, row in enumerate(HEART):
        for c, ch in enumerate(row):
            if ch == '.':
                continue
            col = RED if ch == 'r' else PINK
            d.rounded_rectangle([x0 + (c + 1) * cs + gap, y0 + (r + 1) * cs + gap, x0 + (c + 2) * cs - gap, y0 + (r + 2) * cs - gap], radius=cs * 0.12, fill=col)
    # one crossed-out square (bottom-left) as a nonogram hint
    cx, cy = x0 + 1.5 * cs, y0 + 7.5 * cs
    k = cs * 0.24
    wd = max(2, int(cs * 0.09))
    d.line([(cx - k, cy - k), (cx + k, cy + k)], fill=CROSS, width=wd)
    d.line([(cx - k, cy + k), (cx + k, cy - k)], fill=CROSS, width=wd)


def rounded_mask(size, r):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], r, fill=255)
    return m


def main():
    root = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(root)
    res = os.path.join(repo, 'android/app/src/main/res')
    big = 2048
    full = background(big).convert('RGBA')
    draw_art(full, 0.86)
    full = full.convert('RGB').resize((S, S), Image.LANCZOS)
    full.save(os.path.join(root, 'icon-full.png'))
    for out in [os.path.join(root, 'play-store-icon-512.png'), os.path.join(repo, 'www/icon.png'), os.path.join(repo, 'store/icon-512.png')]:
        os.makedirs(os.path.dirname(out), exist_ok=True)
        full.resize((512, 512), Image.LANCZOS).save(out)
    fg = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw_art(fg, 0.60, grid=False)
    fg = fg.resize((432, 432), Image.LANCZOS)
    sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    fsizes = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
    for dens, px in sizes.items():
        d = os.path.join(res, 'mipmap-' + dens)
        sq = full.resize((px, px), Image.LANCZOS)
        out = Image.new('RGBA', (px, px), (0, 0, 0, 0))
        out.paste(sq, (0, 0), rounded_mask(px, int(px * 0.18)))
        out.save(os.path.join(d, 'ic_launcher.png'))
        rnd = Image.new('RGBA', (px, px), (0, 0, 0, 0))
        cm = Image.new('L', (px, px), 0)
        ImageDraw.Draw(cm).ellipse([0, 0, px - 1, px - 1], fill=255)
        rnd.paste(sq, (0, 0), cm)
        rnd.save(os.path.join(d, 'ic_launcher_round.png'))
        fg.resize((fsizes[dens], fsizes[dens]), Image.LANCZOS).save(os.path.join(d, 'ic_launcher_foreground.png'))
    splash_sizes = {
        'drawable': (480, 320),
        'drawable-land-mdpi': (480, 320), 'drawable-land-hdpi': (800, 480), 'drawable-land-xhdpi': (1280, 720),
        'drawable-land-xxhdpi': (1600, 960), 'drawable-land-xxxhdpi': (1920, 1280),
        'drawable-port-mdpi': (320, 480), 'drawable-port-hdpi': (480, 800), 'drawable-port-xhdpi': (720, 1280),
        'drawable-port-xxhdpi': (960, 1600), 'drawable-port-xxxhdpi': (1280, 1920),
    }
    logo = Image.new('RGBA', (big, big), SPLASH + (255,))
    draw_art(logo, 0.62)
    logo = logo.convert('RGB')
    for folder, (w, h) in splash_sizes.items():
        im = Image.new('RGB', (w, h), SPLASH)
        side = int(min(w, h) * 0.5)
        im.paste(logo.resize((side, side), Image.LANCZOS), ((w - side) // 2, (h - side) // 2))
        im.save(os.path.join(res, folder, 'splash.png'))
    print('icons + splash written')


if __name__ == '__main__':
    main()
