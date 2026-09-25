"""Scripted demo-GIF: ссылка Instagram -> вставка -> скачивание. Мокап, не запись экрана."""
import os
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, DUR = 720, 460, 10, 6.0
N = int(FPS * DUR)
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "demo.gif")

BG = (23, 23, 26)
CARD = (38, 38, 43)
LINE = (70, 70, 76)
INK = (245, 245, 247)
DIM = (161, 161, 166)
ACC = (10, 132, 255)
ACC_D = (0, 100, 220)
GRN = (48, 209, 88)
WHITE = (255, 255, 255)

FDIR = "C:/Windows/Fonts"
F_TITLE = ImageFont.truetype(f"{FDIR}/segoeui.ttf", 22)
F_TXT = ImageFont.truetype(f"{FDIR}/segoeui.ttf", 17)
F_SMALL = ImageFont.truetype(f"{FDIR}/segoeui.ttf", 14)
F_URL = ImageFont.truetype(f"{FDIR}/consola.ttf", 15)

FULL_URL = "https://www.instagram.com/reel/DdG42sKzOlz/"
STAGES = ["Открываю страницу…", "Ищу video_url…", "Проверяю API Instagram…", "Качаю…"]


def frame(t: float) -> Image.Image:
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)

    # --- адресная строка ---
    d.rounded_rectangle([30, 18, 690, 62], 12, fill=CARD)
    for cx, col in ((50, (255, 95, 87)), (68, (254, 188, 46)), (86, (40, 200, 64))):
        d.ellipse([cx - 6, 26, cx + 6, 38], fill=col)
    if t < 1.2:  # подсветка копирования бежит по URL
        k = min(1.0, t / 1.2)
        tw = d.textlength(FULL_URL, font=F_URL)
        d.rectangle([110, 28, 110 + tw * k, 52], fill=(10, 132, 255, 90) if False else (30, 80, 160))
    d.text((110, 30), FULL_URL, font=F_URL, fill=INK)
    d.text((30, 66), "1. Копирую ссылку", font=F_SMALL, fill=DIM)

    # --- карточка рилса ---
    d.rounded_rectangle([30, 90, 310, 340], 14, fill=CARD)
    d.polygon([(150, 170), (190, 195), (150, 220)], fill=DIM)
    d.text((48, 250), "code.xr • Navigation Tabs V4", font=F_SMALL, fill=DIM)
    d.text((48, 272), "863  •  139", font=F_TXT, fill=INK)
    if 3.0 <= t < 4.6:
        d.text((48, 300), "играет…", font=F_SMALL, fill=GRN)

    # --- popup ---
    px, pw = 340, 350
    d.rounded_rectangle([px, 90, px + pw, 340], 16, fill=CARD)
    d.text((px + 115, 100), "VideoLoader", font=F_TITLE, fill=INK)
    d.rectangle([px + 16, 140, px + pw - 16, 174], outline=LINE, width=1)
    typed = ""
    if t >= 1.2:
        n = int(len(FULL_URL) * min(1.0, (t - 1.2) / 1.2))
        typed = FULL_URL[:n]
    if typed:
        d.text((px + 22, 147), typed, font=F_URL, fill=INK)
    press = 2.4 <= t < 2.7
    d.rounded_rectangle([px + 16, 184, px + pw - 16, 220], 10, fill=ACC_D if press else ACC)
    d.text((px + 135, 190), "Скачать", font=F_TXT, fill=WHITE)
    status, ok = "Вставьте ссылку и нажмите «Скачать».", False
    if 2.7 <= t < 4.6:
        si = min(3, int((t - 2.7) / 0.475))
        status = STAGES[si]
    elif t >= 4.6:
        status, ok = "Готово: reel-DdG42sKzOlz.mp4", True
    d.text((px + 16, 228), status, font=F_SMALL, fill=GRN if ok else DIM)
    if 3.0 <= t < 4.6:
        k = (t - 3.0) / 1.6
        d.rectangle([px + 16, 254, px + pw - 16, 266], outline=LINE, width=1)
        d.rectangle([px + 18, 256, px + 18 + (pw - 36) * k, 264], fill=ACC)
    d.text((px + 16, 286), "2. Вставляю → 3. Скачать → 4. Готово", font=F_SMALL, fill=DIM)

    # --- загрузки ---
    if t >= 4.6:
        d.rounded_rectangle([30, 352, 690, 412], 12, fill=CARD)
        d.ellipse([48, 370, 62, 384], fill=GRN)
        d.text((72, 368), "reel-DdG42sKzOlz.mp4   8,4 МБ   Открыть", font=F_TXT, fill=INK)
    d.text((30, 424), "VideoLoader — scripted demo", font=F_SMALL, fill=DIM)
    return im


def main() -> None:
    import hashlib
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    # Группируем дубликаты подряд, длительность накапливаем — тайминги не плывут
    films, durs, last_h = [], [], None
    for i in range(N):
        im = frame(i / FPS)
        h = hashlib.md5(im.tobytes()).digest()
        if h == last_h:
            durs[-1] += 100
        else:
            films.append(im)
            durs.append(100)
            last_h = h
    films[0].save(OUT, save_all=True, append_images=films[1:], duration=durs, loop=0)
    check = Image.open(OUT)
    print(f"GIF_OK {OUT} {os.path.getsize(OUT)} bytes, {check.n_frames} frames")


if __name__ == "__main__":
    main()
