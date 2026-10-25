#!/usr/bin/env python
"""Generate the promo images in docs/ from assets/faces/.

    python scripts/make-promo.py

Everything here is drawn from the bundled artwork and text; no screenshot of a
running app is involved, so nothing in docs/ claims to be one.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FACES = ROOT / "assets" / "faces"
DOCS = ROOT / "docs"
DOCS.mkdir(exist_ok=True)

FONT_BD = "C:/Windows/Fonts/msyhbd.ttc"
FONT_RG = "C:/Windows/Fonts/msyh.ttc"
FONT_MONO = "C:/Windows/Fonts/consola.ttf"

INK = (14, 34, 68)
DEEP = (30, 62, 112)
MUTED = (86, 112, 154)
ACCENT = (47, 110, 196)
PAPER = (247, 251, 255)
PAPER2 = (219, 233, 255)


def font(path, size):
    return ImageFont.truetype(path, size)


def rounded(size):
    """Circle mask drawn at 4x and downsampled, so the edge stays smooth."""
    big = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(big).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    return big.resize((size, size), Image.LANCZOS)


def avatar(face_id, size):
    src = Image.open(FACES / f"{face_id}.jpg").convert("RGB")
    side = min(src.size)
    left = (src.width - side) // 2
    top = (src.height - side) // 2
    src = src.crop((left, top, left + side, top + side)).resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size))
    out.paste(src, (0, 0))
    out.putalpha(rounded(size))
    return out


def backdrop(w, h):
    base = Image.new("RGBA", (w, h))
    top, bottom = PAPER, PAPER2
    strip = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        strip.putpixel((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    base.paste(strip.resize((w, h)), (0, 0))

    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((-180, -220, 520, 480), fill=(196, 218, 255, 150))
    gd.ellipse((w - 460, h - 420, w + 200, h + 260), fill=(206, 224, 255, 120))
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    return Image.alpha_composite(base, glow)


def with_shadow(img, blur=26, offset=(0, 14), alpha=70):
    pad = blur * 3
    canvas = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    solid = Image.new("RGBA", img.size, (20, 45, 90, alpha))
    solid.putalpha(img.getchannel("A"))
    shadow.paste(solid, (pad + offset[0], pad + offset[1]), solid)
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.paste(img, (pad, pad), img)
    return canvas


def chip(draw, x, y, text, fnt, pad_x=22, pad_y=12, radius=999):
    box = draw.textbbox((0, 0), text, font=fnt)
    w = box[2] - box[0] + pad_x * 2
    h = box[3] - box[1] + pad_y * 2
    draw.rounded_rectangle((x, y, x + w, y + h), radius=radius, fill=(255, 255, 255, 210),
                           outline=(178, 202, 236, 255), width=2)
    draw.text((x + pad_x, y + pad_y - box[1]), text, font=fnt, fill=DEEP)
    return w


def hero():
    w, h = 1280, 640
    img = backdrop(w, h)
    draw = ImageDraw.Draw(img)

    face = with_shadow(avatar("rice", 340), blur=30, offset=(0, 16), alpha=80)
    ring = Image.new("RGBA", (face.width, face.height), (0, 0, 0, 0))
    ImageDraw.Draw(ring).ellipse((0, 0, ring.width - 1, ring.height - 1), outline=(255, 255, 255, 255), width=14)
    ring.paste(face, (0, 0))
    img.alpha_composite(ring, (140 - 90, 320 - ring.height // 2))

    x = 560
    draw.text((x, 132), "DEEPSEEK HARNESS PLUGIN", font=font(FONT_MONO, 24), fill=MUTED)
    draw.text((x, 158), "大肥鱼头像", font=font(FONT_BD, 100), fill=INK)
    draw.text((x, 292), "dsh-im-style-fatfish", font=font(FONT_MONO, 34), fill=ACCENT)

    lines = ["头像挂在对话栏外侧，正文一点不让位", "干活时「思考」，轮次结束由模型挑一张表情"]
    for i, line in enumerate(lines):
        draw.text((x, 352 + i * 52), line, font=font(FONT_RG, 30), fill=DEEP)

    cx = x
    for label in ("离线可用", "12 种表情", "MIT"):
        cx += chip(draw, cx, 470, label, font(FONT_RG, 24)) + 14

    draw.text((w - 40, h - 46), "github.com/byebyeway/dsh-im-style-fatfish",
              font=font(FONT_MONO, 20), fill=MUTED, anchor="rs")
    img.convert("RGB").save(DOCS / "hero.png", optimize=True)


def faces_grid():
    cols, cell_w, cell_h = 4, 280, 250
    rows = 3
    w, h = cols * cell_w + 120, rows * cell_h + 210
    img = backdrop(w, h)
    draw = ImageDraw.Draw(img)

    draw.text((60, 52), "12 种表情", font=font(FONT_BD, 56), fill=INK)
    draw.text((60, 128), "素材来自 dsh-meme 的大肥鱼图库（MIT）",
              font=font(FONT_RG, 26), fill=MUTED)

    labels = [
        ("hello", "打招呼"), ("think", "思考"), ("work", "加班"), ("slack", "摸鱼"),
        ("talk", "说话"), ("rice", "干饭"), ("proud", "得意"), ("tsun", "傲娇"),
        ("fuzz", "生气"), ("boom", "爆炸"), ("dead", "装死"), ("broke", "讨钱"),
    ]
    for i, (face_id, name) in enumerate(labels):
        cx = 60 + (i % cols) * cell_w + cell_w // 2
        cy = 200 + (i // cols) * cell_h + 90
        art = with_shadow(avatar(face_id, 150), blur=18, offset=(0, 8), alpha=55)
        img.alpha_composite(art, (cx - art.width // 2, cy - art.height // 2))
        draw.text((cx, cy + 96), name, font=font(FONT_BD, 28), fill=INK, anchor="mm")
        draw.text((cx, cy + 130), face_id, font=font(FONT_MONO, 19), fill=MUTED, anchor="mm")

    img.convert("RGB").save(DOCS / "faces.png", optimize=True)


if __name__ == "__main__":
    hero()
    faces_grid()
    for name in ("hero.png", "faces.png"):
        path = DOCS / name
        print(name, Image.open(path).size, f"{path.stat().st_size / 1024:.0f} KB")
