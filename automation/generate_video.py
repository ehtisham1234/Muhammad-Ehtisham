#!/usr/bin/env python3
"""Generate a vertical (1080x1920) poetry short: TTS voiceover + text-card
visuals (Ember Calligraphy background + Nastaliq Urdu) + assembly.

Pipeline: espeak-ng (offline TTS) -> Pillow/raqm (frame image) -> ffmpeg.
No paid API calls; runs entirely offline.
"""
import argparse
import json
import subprocess
import sys
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1080, 1920
TEXT_COLOR = (240, 232, 222)
ACCENT_COLOR = (201, 162, 107)
GLOSS_COLOR = (176, 164, 172)

HERE = Path(__file__).resolve().parent
BACKGROUND = HERE / "design" / "background.png"
FONT_URDU = "/usr/share/fonts/truetype/noto/NotoNastaliqUrdu-Regular.ttf"
FONT_LATIN = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
FONT_LATIN_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"


def load_font(path, size):
    return ImageFont.truetype(path, size, layout_engine=ImageFont.Layout.RAQM)


def fit_urdu_font(draw, lines, font_path, max_width, start_size, min_size=40):
    """Poetry has its own line breaks (misras) — never re-wrap them.
    Instead shrink the font until every provided line fits max_width."""
    size = start_size
    while size > min_size:
        font = load_font(font_path, size)
        widest = max(
            draw.textbbox((0, 0), line, font=font, direction="rtl")[2]
            for line in lines
        )
        if widest <= max_width:
            return font
        size -= 4
    return load_font(font_path, min_size)


def draw_centered_rtl(draw, lines, font, y_center, color, line_spacing=22):
    heights = []
    total = 0
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font, direction="rtl")
        h = bbox[3] - bbox[1]
        heights.append(h)
        total += h + line_spacing
    total -= line_spacing

    y = y_center - total / 2
    for line, h in zip(lines, heights):
        draw.text((WIDTH / 2, y + h / 2), line, font=font, fill=color,
                   anchor="mm", direction="rtl")
        y += h + line_spacing


def draw_centered_ltr(draw, lines, font, y_center, color, line_spacing=14):
    heights = []
    total = 0
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        h = bbox[3] - bbox[1]
        heights.append(h)
        total += h + line_spacing
    total -= line_spacing

    y = y_center - total / 2
    for line, h in zip(lines, heights):
        draw.text((WIDTH / 2, y + h / 2), line, font=font, fill=color, anchor="mm")
        y += h + line_spacing


def block_height(draw, lines, font, line_spacing, direction=None):
    total = 0
    for line in lines:
        kwargs = {"direction": direction} if direction else {}
        bbox = draw.textbbox((0, 0), line, font=font, **kwargs)
        total += (bbox[3] - bbox[1]) + line_spacing
    return total - line_spacing if lines else 0


def build_frame(urdu_text, gloss_text, attribution, out_path, main_script="urdu"):
    if BACKGROUND.exists():
        img = Image.open(BACKGROUND).convert("RGB")
        if img.size != (WIDTH, HEIGHT):
            img = img.resize((WIDTH, HEIGHT))
    else:
        img = Image.new("RGB", (WIDTH, HEIGHT), (24, 18, 28))
    draw = ImageDraw.Draw(img)

    max_text_width = WIDTH - 160
    is_rtl = main_script == "urdu"
    main_lines = [line for line in urdu_text.split("\n") if line.strip()]
    if is_rtl:
        main_font = fit_urdu_font(draw, main_lines, FONT_URDU, max_text_width, start_size=100)
    else:
        main_font = fit_urdu_font(draw, main_lines, FONT_LATIN, max_text_width, start_size=64, min_size=32)

    gloss_lines = textwrap.wrap(gloss_text, width=42) if gloss_text else []
    gloss_font = load_font(FONT_LATIN, 34)
    attr_font = load_font(FONT_LATIN_BOLD, 40)

    main_spacing, gloss_spacing = (24 if is_rtl else 16), 12
    section_gap = 46

    main_h = block_height(draw, main_lines, main_font, main_spacing, direction="rtl" if is_rtl else None)
    gloss_h = block_height(draw, gloss_lines, gloss_font, gloss_spacing) if gloss_lines else 0
    attr_h = block_height(draw, [f"— {attribution}"], attr_font, 0)

    total_h = main_h + (section_gap + gloss_h if gloss_lines else 0) + section_gap + attr_h
    region_top, region_bottom = HEIGHT * 0.24, HEIGHT * 0.86
    start_y = region_top + (region_bottom - region_top - total_h) / 2

    draw.line([(WIDTH // 2 - 50, int(region_top) - 30), (WIDTH // 2 + 50, int(region_top) - 30)],
               fill=ACCENT_COLOR, width=2)

    y = start_y + main_h / 2
    if is_rtl:
        draw_centered_rtl(draw, main_lines, main_font, y, TEXT_COLOR, main_spacing)
    else:
        draw_centered_ltr(draw, main_lines, main_font, y, TEXT_COLOR, main_spacing)
    y = start_y + main_h + section_gap

    if gloss_lines:
        y += gloss_h / 2
        draw_centered_ltr(draw, gloss_lines, gloss_font, y, GLOSS_COLOR, gloss_spacing)
        y += gloss_h / 2 + section_gap

    y += attr_h / 2
    draw_centered_ltr(draw, [f"— {attribution}"], attr_font, y, ACCENT_COLOR)

    brand_font = load_font(FONT_LATIN, 36)
    draw_centered_ltr(draw, ["Sukhan-e-Dil"], brand_font, HEIGHT - 130, TEXT_COLOR)

    img.save(out_path)


def synthesize_voiceover(text, out_wav, voice="ur", speed=140):
    subprocess.run(
        ["espeak-ng", "-v", voice, "-s", str(speed), "-w", str(out_wav), text],
        check=True,
    )


def get_duration(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


def assemble_video(frame_path, voiceover_wav, out_mp4, min_duration=8.0, pre_roll=1.5, post_roll=2.0):
    voice_duration = get_duration(voiceover_wav)
    video_duration = max(voice_duration + pre_roll + post_roll, min_duration)
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-loop", "1", "-i", str(frame_path),
            "-itsoffset", str(pre_roll), "-i", str(voiceover_wav),
            "-c:v", "libx264", "-t", str(video_duration),
            "-pix_fmt", "yuv420p",
            "-vf", "fps=30,format=yuv420p",
            "-c:a", "aac", "-shortest",
            str(out_mp4),
        ],
        check=True,
        capture_output=True,
    )
    return video_duration


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--urdu", required=True, help="Main poem line(s), on-screen and narrated")
    parser.add_argument("--gloss", default="", help="Short English gloss/translation (on-screen only)")
    parser.add_argument("--attribution", required=True, help="Poet name")
    parser.add_argument("--main-script", choices=["urdu", "latin"], default="urdu",
                         help="Script/direction for the main text (latin for English-language source text)")
    parser.add_argument("--voice", default="ur", help="espeak-ng voice for narration (e.g. ur, en-us)")
    parser.add_argument("--outdir", default="output", help="Output directory")
    parser.add_argument("--name", default="video", help="Base filename")
    args = parser.parse_args()

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    frame_path = outdir / f"{args.name}_frame.png"
    voice_path = outdir / f"{args.name}_voice.wav"
    video_path = outdir / f"{args.name}.mp4"

    print("Building frame...")
    build_frame(args.urdu, args.gloss, args.attribution, frame_path, main_script=args.main_script)

    print("Synthesizing voiceover...")
    synthesize_voiceover(args.urdu, voice_path, voice=args.voice)

    print("Assembling video...")
    duration = assemble_video(frame_path, voice_path, video_path)

    meta = {
        "video": str(video_path),
        "duration_seconds": round(duration, 2),
        "urdu": args.urdu,
        "gloss": args.gloss,
        "attribution": args.attribution,
    }
    print(json.dumps(meta, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    sys.exit(main())
