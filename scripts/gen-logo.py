"""Логотип VideoLoader: стекло + стрелка загрузки. PNG 512 для сайта."""
import os
from PIL import Image, ImageDraw

S = 512
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "logo.png")

im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(im)

# Фон: скруглённый квадрат с вертикальным градиентом синий -> фиолет
r = int(S * 0.24)
top = (10, 100, 255)
bot = (150, 70, 220)
for y in range(S):
    k = y / S
    col = tuple(int(top[i] + (bot[i] - top[i]) * k) for i in range(3)) + (255,)
    d.line([(0, y), (S, y)], fill=col)
mask = Image.new("L", (S, S), 0)
dm = ImageDraw.Draw(mask)
dm.rounded_rectangle([0, 0, S, S], radius=r, fill=255)
im.putalpha(mask)

# Стеклянный блик сверху
gl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
dg = ImageDraw.Draw(gl)
dg.rounded_rectangle([int(S * 0.1), int(S * 0.06), int(S * 0.9), int(S * 0.42)], radius=int(r * 0.7), fill=(255, 255, 255, 38))
im = Image.alpha_composite(im, gl)
d = ImageDraw.Draw(im)

# Стрелка вниз: стержень + наконечник
cx, wt = S / 2, S * 0.11
top_y, mid_y, bot_y = S * 0.22, S * 0.56, S * 0.78
half = S * 0.25
# мягкая тень
sh = [(cx - wt, top_y + 6), (cx + wt, top_y + 6), (cx + wt, mid_y + 6), (cx + half, mid_y + 6),
      (cx, bot_y + 6), (cx - half, mid_y + 6), (cx - wt, mid_y + 6)]
d.polygon(sh, fill=(0, 0, 0, 70))
arr = [(cx - wt, top_y), (cx + wt, top_y), (cx + wt, mid_y), (cx + half, mid_y),
       (cx, bot_y), (cx - half, mid_y), (cx - wt, mid_y)]
d.polygon(arr, fill=(255, 255, 255, 255))

im.save(OUT)
print("LOGO_OK", OUT, os.path.getsize(OUT))
