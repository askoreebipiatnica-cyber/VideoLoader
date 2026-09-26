"""Demo-Гифки VideoLoader: scripted-мокап, RU + EN версии. Не запись экрана."""
import hashlib
import os
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, DUR = 720, 470, 12, 6.0
N = int(FPS * DUR)
HERE = os.path.dirname(__file__)
OUT_RU = os.path.join(HERE, "..", "docs", "demo.gif")
OUT_EN = os.path.join(HERE, "..", "docs", "demo-en.gif")

BG_TOP = (16, 20, 38)
BG_BOT = (10, 10, 14)
CARD = (34, 34, 42)
FIELD = (18, 18, 24)
LINE = (72, 72, 80)
INK = (245, 245, 247)
DIM = (165, 165, 178)
ACC = (10, 132, 255)
ACC_D = (0, 100, 220)
GRN = (48, 209, 88)
WHITE = (255, 255, 255)

FDIR = "C:/Windows/Fonts"
F_TITLE = ImageFont.truetype(f"{FDIR}/segoeui.ttf", 20)
F_TXT = ImageFont.truetype(f"{FDIR}/segoeui.ttf", 16)
F_SMALL = ImageFont.truetype(f"{FDIR}/segoeui.ttf", 13)
F_URL = ImageFont.truetype(f"{FDIR}/consola.ttf", 14)
F_CAP = ImageFont.truetype(f"{FDIR}/segoeui.ttf", 12)

FULL_URL = "https://www.instagram.com/reel/DdG42sKzOlz/"

S = {
    "ru": {
        "copy": "1. Копирую ссылку",
        "cap": "code.xr • Navigation Tabs V4",
        "playing": "играет…",
        "link": "Ссылка на видео или страницу",
        "dl": "Скачать",
        "stages": ["Открываю страницу…", "Ищу video_url…", "Проверяю API Instagram…", "Качаю…"],
        "idle": "Вставьте ссылку и нажмите «Скачать».",
        "done": "Готово: reel-DdG42sKzOlz.mp4",
        "auto": "Авто-сохранение при просмотре видео",
        "file": "reel-DdG42sKzOlz.mp4   8,4 МБ   Открыть",
        "steps": ["1 Копирую", "2 Вставляю", "3 Скачать", "4 Готово"],
        "foot": "VideoLoader — scripted demo",
        "ver": "VideoLoader 4.0.2  ♥",
    },
    "en": {
        "copy": "1. Copy the link",
        "cap": "code.xr • Navigation Tabs V4",
        "playing": "playing…",
        "link": "Video or page link",
        "dl": "Download",
        "stages": ["Opening page…", "Looking for video_url…", "Checking Instagram API…", "Downloading…"],
        "idle": "Paste a link and press “Download”.",
        "done": "Done: reel-DdG42sKzOlz.mp4",
        "auto": "Auto-save while watching",
        "file": "reel-DdG42sKzOlz.mp4   8.4 MB   Open",
        "steps": ["1 Copy", "2 Paste", "3 Download", "4 Done"],
        "foot": "VideoLoader — scripted demo",
        "ver": "VideoLoader 4.0.2  ♥",
    },
}


def fit_tail(d, text, font, max_w):
    if d.textlength(text, font=font) <= max_w:
        return text
    s = "…" + text
    while len(s) > 2 and d.textlength(s, font=font) > max_w:
        s = "…" + s[2:]
    return s


def frame(t, L):
    im = Image.new("RGB", (W, H), BG_BOT)
    d = ImageDraw.Draw(im)
    # фон-градиент
    for y in range(H):
        k = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * k) for i in range(3)))
    # сетка
    for x in range(0, W, 46):
        d.line([(x, 0), (x, H)], fill=(255, 255, 255, 8))
    for y in range(0, H, 46):
        d.line([(0, y), (W, y)], fill=(255, 255, 255, 8))

    def card(box, r=14):
        x0, y0, x1, y1 = box
        d.rounded_rectangle([x0 + 3, y0 + 5, x1 + 3, y1 + 5], r, fill=(0, 0, 0, 110))
        d.rounded_rectangle(box, r, fill=CARD, outline=(95, 95, 108), width=1)

    # --- адресная строка ---
    card([30, 18, 690, 62], 12)
    for cx, col in ((50, (255, 95, 87)), (68, (254, 188, 46)), (86, (40, 200, 64))):
        d.ellipse([cx - 6, 26, cx + 6, 38], fill=col)
    if t < 1.2:
        k = min(1.0, t / 1.2)
        tw = d.textlength(FULL_URL, font=F_URL)
        d.rectangle([110, 28, 110 + tw * k, 52], fill=(30, 80, 160))
    d.text((110, 30), FULL_URL, font=F_URL, fill=INK)
    d.text((30, 66), L["copy"], font=F_SMALL, fill=DIM)

    # --- карточка рилса ---
    card([30, 90, 310, 340])
    d.polygon([(150, 170), (190, 195), (150, 220)], fill=DIM)
    d.ellipse([168, 188, 176, 196], fill=CARD)
    d.text((48, 250), L["cap"], font=F_SMALL, fill=DIM)
    d.text((48, 272), "863  •  139", font=F_TXT, fill=INK)
    if 3.0 <= t < 4.6:
        d.text((48, 300), L["playing"], font=F_SMALL, fill=GRN)

    # --- popup ---
    px, pw = 340, 350
    card([px, 90, px + pw, 392], 16)
    for cx, col in ((px + 16, (255, 95, 87)), (px + 34, (254, 188, 46)), (px + 52, (40, 200, 64))):
        d.ellipse([cx - 6, 102, cx + 6, 114], fill=col)
    d.text((px + 138, 97), "VideoLoader", font=F_TITLE, fill=INK)
    d.rounded_rectangle([px + pw - 92, 98, px + pw - 14, 122], 8, fill=FIELD, outline=LINE)
    d.text((px + pw - 84, 100), "☀", font=F_SMALL, fill=DIM)
    d.rounded_rectangle([px + pw - 64, 98, px + pw - 40, 122], 8, fill=ACC)
    d.text((px + pw - 58, 100), "◐", font=F_SMALL, fill=WHITE)
    d.text((px + pw - 34, 100), "☾", font=F_SMALL, fill=DIM)
    d.text((px + 16, 128), L["link"], font=F_SMALL, fill=DIM)
    d.rounded_rectangle([px + 16, 148, px + 218, 184], 10, fill=FIELD, outline=LINE)
    typed = ""
    if t >= 1.2:
        n = int(len(FULL_URL) * min(1.0, (t - 1.2) / 1.2))
        typed = fit_tail(d, FULL_URL[:n], F_URL, 218 - 16 - 12)
    if typed:
        d.text((px + 22, 155), typed, font=F_URL, fill=INK)
    press = 2.4 <= t < 2.7
    if press:
        d.rounded_rectangle([px + 222, 144, px + pw - 12, 188], 12, fill=(10, 132, 255, 70))
    d.rounded_rectangle([px + 226, 148, px + pw - 16, 184], 10, fill=ACC_D if press else ACC)
    lbl = L["dl"]
    tw = d.textlength(lbl, font=F_TXT)
    d.text((px + 226 + (pw - 16 - 226 - tw) / 2, 155), lbl, font=F_TXT, fill=WHITE)
    status, ok = L["idle"], False
    if 2.7 <= t < 4.6:
        si = min(3, int((t - 2.7) / 0.475))
        status = L["stages"][si]
    elif t >= 4.6:
        status, ok = L["done"], True
    d.text((px + 16, 192), status, font=F_SMALL, fill=GRN if ok else DIM)
    if 3.0 <= t < 4.6:
        k = min(1.0, ((t - 3.0) / 1.6) ** 0.8)
        d.rectangle([px + 16, 216, px + pw - 16, 228], outline=LINE, width=1)
        d.rectangle([px + 17, 217, px + 17 + (pw - 36) * k, 227], fill=ACC)
    d.rectangle([px + 16, 242, px + 30, 256], outline=DIM, width=1)
    if t >= 1.0:
        d.text((px + 17, 240), "✓", font=F_SMALL, fill=GRN)
    d.text((px + 38, 242), L["auto"], font=F_SMALL, fill=DIM)
    d.text((px + 110, 266), L["ver"], font=F_SMALL, fill=DIM)
    # шаги снизу popup
    sx = px + 16
    for i, s in enumerate(L["steps"]):
        on = (t >= [0, 1.2, 2.4, 4.6][i])
        d.text((sx, 292), s, font=F_CAP, fill=GRN if on else (70, 70, 80))
        sx += d.textlength(s, font=F_CAP) + 18

    # --- загрузки ---
    if t >= 4.6:
        card([30, 352, 690, 412], 12)
        d.ellipse([48, 370, 62, 384], fill=GRN)
        d.text((72, 368), L["file"], font=F_TXT, fill=INK)
    d.text((30, 424), L["foot"], font=F_SMALL, fill=DIM)
    return im


def render(lang, out):
    films, durs, last_h = [], [], None
    for i in range(N):
        im = frame(i / FPS, S[lang])
        h = hashlib.md5(im.tobytes()).digest()
        if h == last_h:
            durs[-1] += int(1000 / FPS)
        else:
            films.append(im)
            durs.append(int(1000 / FPS))
            last_h = h
    films[0].save(out, save_all=True, append_images=films[1:], duration=durs, loop=0)
    check = Image.open(out)
    print(f"GIF_OK {lang} {out} {os.path.getsize(out)} bytes, {check.n_frames} frames")


def main():
    os.makedirs(os.path.join(HERE, "..", "docs"), exist_ok=True)
    render("ru", OUT_RU)
    render("en", OUT_EN)


if __name__ == "__main__":
    main()
