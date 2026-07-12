# YouTube Channel Growth Dashboard

A static, client-side dashboard that pulls your real channel stats via the
official [YouTube Data API v3](https://developers.google.com/youtube/v3) and
turns them into concrete, honest suggestions for earning more likes and
subscribers — no bots, no purchased engagement, nothing that risks your
channel's standing with YouTube.

Prefer no button-clicking at all? See [`agent/`](agent/) for an unattended,
cron-driven version of the upload + share pipeline — drop a video in a
folder and it handles the rest on your own schedule.

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
- Optionally, after Google sign-in, **uploads a video straight from your
  browser to your channel** (title/description/tags/visibility, with
  scheduled publishing) using YouTube's resumable upload protocol — the file
  goes directly to Google, never through any other server.
- Optionally, **posts to a Facebook Page or Instagram Business account you
  administer** when you click a button — not to groups or accounts you don't
  own, and never automatically/unattended.
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
   share read-only YouTube Analytics access, and permission to upload videos
   to your channel, with this page, in your browser only.

Once connected, the "Upload a video" section becomes usable — pick a file,
fill in the metadata, and choose Public, Unlisted, or Private/Scheduled (set
a publish time and YouTube will auto-publish it then).

### Optional: posting to your own Facebook Page / Instagram

This posts only to a Page or Instagram Business account **you administer** —
not to groups or other people's accounts. There's no OAuth flow built in
here (Meta's app review process for that is heavier); instead you generate
your own long-lived token:

1. Create an app at [Meta for Developers](https://developers.facebook.com/apps)
   and add the "Facebook Login" and "Instagram Graph API" products.
2. In the [Graph API Explorer](https://developers.facebook.com/tools/explorer/),
   select your app and a Page you administer, and generate a token with
   `pages_manage_posts` (add `instagram_content_publish` too if you'll post
   to Instagram).
3. Find your Page ID from the Page's "About" section, and your Instagram
   Business Account ID via `GET /{page-id}?fields=instagram_business_account`
   in the Explorer.
4. Paste the Page ID and token into the "Post to your own Facebook Page /
   Instagram" section and click **Save Meta credentials**.

Posting to Instagram additionally requires a **public URL to the video
file itself** (Instagram's API fetches the video from that URL — it can't
receive an uploaded file directly, and it can't repost a YouTube link as a
Reel). You'll need to host the export somewhere reachable (cloud storage,
your own site, etc.) and paste that URL in before posting.

### One-click pipeline: upload → Facebook → Instagram

Once steps 2 and 4 are set up, check "Also post to Facebook / Instagram
automatically once this upload finishes" in the upload form before clicking
**Upload to YouTube**. One click then runs the whole chain: upload the video,
post the pre-filled caption to your Facebook Page, and (if an Instagram
Business Account ID and public video URL are filled in) publish it as an
Instagram Reel too. Each step's status is shown live; a missing piece (e.g.
no Meta credentials saved, or no public video URL) is skipped with a message
rather than failing the whole run.

This is the practical ceiling for a page with no backend: it still needs
your browser tab open and a click to start. True unattended background
posting (e.g. "run every time I upload, even when I'm offline") would
require a server that stores your long-lived tokens — a different, higher-risk
trade-off this project deliberately doesn't make.

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
