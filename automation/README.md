# Sukhan-e-Dil video pipeline

Generates a vertical (1080x1920) poetry-short: a text card + offline voiceover,
assembled into an MP4. Runs entirely offline — no paid API calls.

## Requirements

System packages: `ffmpeg`, `espeak-ng` (both installed via `apt-get` on this
box; on a fresh machine run `apt-get install -y --no-install-recommends ffmpeg
espeak-ng`).

Python packages: `pip install -r requirements.txt`

## Usage

```bash
python3 generate_video.py \
  --text "Poem line(s) to show on screen" \
  --attribution "Poet name" \
  --outdir output --name my_video
```

Add `--narration` if the spoken text should differ from the on-screen text
(e.g. an English narration alongside an Urdu/Persian on-screen line).

## Status / what's real vs. not yet

- **Video generation**: working, offline, free (Pillow + ffmpeg + espeak-ng).
- **Voice quality**: espeak-ng is robotic. For production-quality narration,
  either wait for vidIQ credits to renew (`vidiq_voiceover_generate`, higher
  quality neural voices) or wire up a different TTS provider.
- **Poem content**: the pipeline takes any text — it does not ship with a
  poem database. Real verses (Rumi, Iqbal, Ghalib, Mir, Hasrat) need to be
  sourced and verified for accuracy/attribution before use; nothing here
  should go out with placeholder or unverified text.
- **Publishing**: this script only produces a local MP4. It does not upload
  or schedule anything. The connected accounts (YouTube channel
  `UCSNsTJhW9mFqGix2brSh3og`, Facebook Page, TikTok `sukhanedil001`) are
  registered in Metricool (brand "Motivation by Ehtisham", id 7058504) — use
  Metricool's scheduling to actually post, after human review of each video.
