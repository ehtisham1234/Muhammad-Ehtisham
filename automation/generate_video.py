#!/usr/bin/env python3
"""Generate a vertical (1080x1920) poetry short: TTS voiceover + text-card visuals + captions.

Pipeline: espeak-ng (offline TTS) -> Pillow (frame images) -> ffmpeg (assembly).
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
BG_TOP = (18, 18, 28)
BG_BOTTOM = (40, 24, 58)
TEXT_COLOR = (245, 240, 230)
ACCENT_COLOR = (201, 162, 107)


def vertical_gradient(width, height, top, bottom):
    img = Image.new("RGB", (width, height), top)
    draw = ImageDraw.Draw(img)
    for y in range(height):
        t = y / height
        color = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        draw.line([(0, y), (width, y)], fill=color)
    return img


def load_font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_centered_text(draw, text, font, y_center, color, max_width, line_spacing=18):
    lines = []
    for paragraph in text.split("\n"):
        wrapped = textwrap.wrap(paragraph, width=28) or [""]
        lines.extend(wrapped)

    line_heights = []
    total_height = 0
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        h = bbox[3] - bbox[1]
        line_heights.append(h)
        total_height += h + line_spacing
    total_height -= line_spacing

    y = y_center - total_height / 2
    for line, h in zip(lines, line_heights):
        bbox = draw.textbbox((0, 0), line, font=font)
        w = bbox[2] - bbox[0]
        x = (WIDTH - w) / 2
        draw.text((x, y), line, font=font, fill=color)
        y += h + line_spacing


def build_frame(poem_line, attribution, out_path):
    img = vertical_gradient(WIDTH, HEIGHT, BG_TOP, BG_BOTTOM)
    draw = ImageDraw.Draw(img)

    draw.line([(WIDTH // 2 - 60, 220), (WIDTH // 2 + 60, 220)], fill=ACCENT_COLOR, width=3)

    poem_font = load_font(72)
    draw_centered_text(draw, poem_line, poem_font, HEIGHT * 0.42, TEXT_COLOR, WIDTH - 160)

    attr_font = load_font(44, bold=True)
    draw_centered_text(draw, f"— {attribution}", attr_font, HEIGHT * 0.74, ACCENT_COLOR, WIDTH - 160)

    brand_font = load_font(38)
    draw_centered_text(draw, "Sukhan-e-Dil", brand_font, HEIGHT - 140, TEXT_COLOR, WIDTH - 160)

    img.save(out_path)


def synthesize_voiceover(text, out_wav, voice="en-us", speed=150):
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


def assemble_video(frame_path, voiceover_wav, out_mp4, min_duration=8.0):
    voice_duration = get_duration(voiceover_wav)
    video_duration = max(voice_duration + 1.5, min_duration)
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-loop", "1", "-i", str(frame_path),
            "-i", str(voiceover_wav),
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
    parser.add_argument("--text", required=True, help="Poem line(s) to display and narrate")
    parser.add_argument("--attribution", required=True, help="Poet name / attribution line")
    parser.add_argument("--narration", help="Text to speak (defaults to --text)")
    parser.add_argument("--outdir", default="output", help="Output directory")
    parser.add_argument("--name", default="test_video", help="Base filename")
    args = parser.parse_args()

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    frame_path = outdir / f"{args.name}_frame.png"
    voice_path = outdir / f"{args.name}_voice.wav"
    video_path = outdir / f"{args.name}.mp4"

    print("Building frame...")
    build_frame(args.text, args.attribution, frame_path)

    print("Synthesizing voiceover...")
    synthesize_voiceover(args.narration or args.text, voice_path)

    print("Assembling video...")
    duration = assemble_video(frame_path, voice_path, video_path)

    meta = {
        "video": str(video_path),
        "duration_seconds": round(duration, 2),
        "text": args.text,
        "attribution": args.attribution,
    }
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    sys.exit(main())
