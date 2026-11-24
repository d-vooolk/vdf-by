import json
import os
import sys
import time
import urllib.request

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, "assets", "fonts", "Oswald-Variable.ttf")
LOGO = os.path.join(ROOT, "public", "brand", "logo-source.png")
API = "https://cloud.leonardo.ai/api/rest/v1"
MODEL = "7b592283-e8a7-4c5a-9ba6-d18c31f258b9"
NEGATIVE = "text, letters, words, watermark, logo, signature, caption, cartoon, illustration, blurry, deformed, people, hands"
STYLE = (
    "main subject placed on the right half of the frame, large empty very dark negative space on the left half, "
    "cinematic dark studio product photography, deep black background, dramatic low-key rim lighting, "
    "photorealistic, high detail, no text"
)
W, H = 1200, 686
MARGIN = 64
TEXT_WIDTH = 560
WHITE = (255, 255, 255)
ACCENT = (252, 120, 24)
MUTED = (190, 190, 190)


def leonardo_key():
    key = os.environ.get("LEONARDO_API_KEY", "").strip()
    if not key:
        sys.exit("нужна переменная LEONARDO_API_KEY")
    return key


def call(method, path, body=None):
    request = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body else None,
        headers={
            "authorization": f"Bearer {leonardo_key()}",
            "content-type": "application/json",
            "accept": "application/json",
            "user-agent": "vdf-covers/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def generate_background(out, scene):
    job = call(
        "POST",
        "/generations",
        {
            "modelId": MODEL,
            "prompt": f"{scene}, {STYLE}",
            "negative_prompt": NEGATIVE,
            "width": 1344,
            "height": 768,
            "num_images": 1,
            "contrast": 3.5,
        },
    )
    generation_id = job["sdGenerationJob"]["generationId"]
    for _ in range(90):
        time.sleep(4)
        generation = call("GET", f"/generations/{generation_id}")["generations_by_pk"]
        if generation["status"] == "COMPLETE":
            url = generation["generated_images"][0]["url"]
            request = urllib.request.Request(url, headers={"user-agent": "vdf-covers/1.0"})
            with urllib.request.urlopen(request, timeout=120) as response, open(out, "wb") as file:
                file.write(response.read())
            return out
        if generation["status"] == "FAILED":
            raise RuntimeError("Leonardo: генерация не удалась")
    raise TimeoutError(generation_id)


def font(weight, size):
    face = ImageFont.truetype(FONT, size)
    face.set_variation_by_name(weight)
    return face


def cap_height(face):
    box = face.getbbox("Н")
    return box[3] - box[1]


def fit_lines(draw, lines, weight, cap, width):
    size = int(cap * 1.4)
    while size > 20:
        face = font(weight, size)
        if cap_height(face) <= cap and all(draw.textlength(line, font=face) <= width for line in lines):
            return face
        size -= 1
    return font(weight, 20)


def shade(image):
    mask = Image.new("L", (W, 1))
    for x in range(W):
        t = x / W
        mask.putpixel((x, 0), int(245 * max(0.0, 1 - t / 0.6) ** 1.2))
    dark = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    dark.putalpha(mask.resize((W, H)))
    image.alpha_composite(dark)


def draw_text(image, xy, text, face, fill, spacing=0):
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    x, y = xy
    for char in text:
        draw.text((x + 2, y + 3), char, font=face, fill=(0, 0, 0, 200))
        x += draw.textlength(char, font=face) + spacing
    image.alpha_composite(layer.filter(ImageFilter.GaussianBlur(5)))
    draw = ImageDraw.Draw(image)
    x = xy[0]
    for char in text:
        draw.text((x, y), char, font=face, fill=fill)
        x += draw.textlength(char, font=face) + spacing


def white_logo(height):
    logo = Image.open(LOGO).convert("RGBA")
    alpha = logo.getchannel("A")
    white = Image.new("RGBA", logo.size, WHITE + (255,))
    white.putalpha(alpha)
    return white.resize((round(logo.width * height / logo.height), height), Image.LANCZOS)


def render(spec, out):
    background = spec.get("bg") or os.path.splitext(out)[0] + "-bg.png"
    if not os.path.exists(background):
        generate_background(background, spec["scene"])
    image = Image.open(background).convert("RGBA").resize((W, H), Image.LANCZOS)
    shade(image)
    draw = ImageDraw.Draw(image)

    title = [line.upper() for line in spec["title"]]
    accent = [line.upper() for line in spec.get("accent", [])]
    title_face = fit_lines(draw, title + accent, "Bold", spec.get("cap", 70), TEXT_WIDTH)
    pitch = round(cap_height(title_face) * 1.38)
    offset = title_face.getbbox("Н")[1]
    subtitle_face = font("Medium", 30)

    block = pitch * (len(title) + len(accent)) + (70 if spec.get("subtitle") else 0)
    y = max(56, (H - 150 - block) // 2 + 10)
    for line in title:
        draw_text(image, (MARGIN, y - offset), line, title_face, WHITE)
        y += pitch
    for line in accent:
        draw_text(image, (MARGIN, y - offset), line, title_face, ACCENT)
        y += pitch
    if spec.get("subtitle"):
        y += 12
        ImageDraw.Draw(image).rectangle([MARGIN, y, MARGIN + 80, y + 4], fill=ACCENT)
        y += 22
        draw_text(image, (MARGIN, y - subtitle_face.getbbox("Н")[1]), spec["subtitle"].upper(), subtitle_face, WHITE, 1.5)

    logo = white_logo(32)
    image.alpha_composite(logo, (MARGIN, H - 121))
    tagline = font("Regular", 15)
    draw_text(image, (MARGIN, H - 80), "ВСЁ ДЛЯ АВТОСВЕТА", tagline, MUTED, 2.5)

    image.convert("RGB").save(out, "JPEG", quality=90, optimize=True, progressive=True)
    return out


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit("python3 scripts/article-cover.py <spec.json> <обложка.jpg>")
    with open(sys.argv[1], encoding="utf8") as file:
        print(render(json.load(file), sys.argv[2]))
