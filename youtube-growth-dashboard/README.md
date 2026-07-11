# YouTube Channel Growth Dashboard

A static, client-side dashboard that pulls your real channel stats via the
official [YouTube Data API v3](https://developers.google.com/youtube/v3) and
turns them into concrete, honest suggestions for earning more likes and
subscribers — no bots, no purchased engagement, nothing that risks your
channel's standing with YouTube.

## What it does

- Pulls subscriber count, total views, and video count for your channel.
- Fetches your most recent uploads and their view/like/comment counts.
- Flags videos performing below your own channel average and gives a
  specific, actionable suggestion for each (thumbnail/title, call-to-action,
  retention).
- Tracks your upload cadence and warns when you've gone quiet longer than
  your usual gap.
- Optionally, after you sign in with your Google account, shows your real
  **watch hours** (last 28 days), average view duration, and subscribers
  gained/lost, plus which of your popular videos has the weakest retention.
- Generates ready-to-paste **share captions** for your recent videos —
  tailored per platform (X/Twitter, Instagram, Facebook, LinkedIn, WhatsApp,
  Reddit) — that you copy and post yourself. Nothing is auto-posted.
- Includes a static checklist of proven, ToS-compliant growth tactics.

## Setup

1. Enable the "YouTube Data API v3" for a project in the
   [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com)
   and create an API key (restrict it to that API).
2. Open `index.html` in a browser (double-click it, or serve the folder with
   any static file server, e.g. `python3 -m http.server` from this
   directory).
3. Enter your API key and your channel's handle (`@yourhandle`) or channel
   ID (`UC...`), then click **Load My Channel**.

Your API key is stored only in your browser's `localStorage` and is sent
directly to Google's API — this project has no backend and no analytics of
its own.

### Optional: watch hours (requires Google sign-in)

View/like/comment counts are public, but watch time is private to the
channel owner. To see it:

1. In the same Google Cloud project, enable the "YouTube Analytics API".
2. Under "APIs & Services > Credentials", create an **OAuth 2.0 Client ID**
   of type "Web application", and add the URL you're serving this page from
   (e.g. `http://localhost:8000`) to "Authorized JavaScript origins".
3. Paste that Client ID into the "Connect Google account" section and click
   **Connect Google Account**. You'll get a Google consent screen asking to
   share read-only YouTube Analytics access with this page, in your browser
   only.

## Notes

- The YouTube Data API has a free daily quota; this dashboard's calls are
  lightweight (a handful of requests per load) and comfortably fit within it
  for personal use.
- This tool intentionally does **not** offer any way to purchase, automate,
  or otherwise fake likes/subscribers/views — that violates YouTube's Terms
  of Service and typically gets engagement suppressed or accounts
  terminated. Everything here is read-only analysis of your real data, and
  the share captions are copy-paste only — you decide what gets posted and
  where.
- Before posting on Reddit, check each subreddit's self-promotion rules —
  most communities expect you to participate genuinely, not just drop links.
