# YouTube Growth Agent (unattended, cron-driven)

This is the "runs by itself" version of the dashboard's upload + share
pipeline: no browser, no buttons. Drop a video into a folder, and a script
you run on your own schedule (via `cron`) uploads it to YouTube and,
optionally, posts it to your own Facebook Page / Instagram.

It is **not** a hosted background service — it only runs when you (or your
crontab) invoke `node agent.js`. There is no persistent process to keep
alive, and no third party (including Claude) holds your credentials; they
live only in `config.json` on whatever machine you run this on.

## What it does

1. Watches a folder (`inbox/` by default) for new video files.
2. For each new file, optionally reads a metadata sidecar (`same-name.json`)
   for title/description/tags/captions.
3. Uploads the video to your channel via the YouTube Data API.
4. Depending on `autoPublish` in `config.json`:
   - `false` (default, recommended): uploads as **unlisted** and queues it
     in `pending.json`. Nothing is posted to Facebook/Instagram yet. You
     review with `node publish.js` (lists pending videos) and
     `node publish.js <videoId>` (makes it public and posts it).
   - `true`: uploads as **public** and immediately posts to your configured
     Facebook Page / Instagram, no review step.
5. Moves the processed file (and its sidecar) into `done/` and records it
   in `processed.json` so it's never re-processed.

## One-time setup

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an OAuth 2.0 Client ID of type **"Desktop app"** (not "Web
   application" — desktop apps are meant for exactly this kind of
   refresh-token flow). Enable the "YouTube Data API v3" for the project.
2. Copy the config template:
   ```
   cp config.example.json config.json
   ```
3. Get a refresh token (one-time interactive sign-in):
   ```
   node auth.js <clientId> <clientSecret>
   ```
   This prints a Google sign-in URL — open it in a browser on the same
   machine, sign in with the account for your channel, and approve. The
   script captures the result on `http://127.0.0.1:53682` and saves your
   refresh token into `config.json` automatically.
4. (Optional, for social posting) Fill in `facebook.pageId`,
   `facebook.pageAccessToken`, and `instagram.businessAccountId` in
   `config.json` — see the main dashboard's README for how to generate a
   Page Access Token via the Graph API Explorer. These only let the script
   post to a Page/account **you** administer.
5. Decide on `autoPublish`: leave it `false` to keep a review step, or set
   `true` for fully unattended publishing (only do this once you trust the
   pipeline — start with `false`).

## Running it

Manually, for a single pass:
```
node agent.js
```

Drop a video in `inbox/` first (with an optional `inbox/myvideo.json`
sidecar), then run the above — it uploads whatever's new and exits.

### Unattended via cron

Add a crontab entry to run it, say, every 15 minutes:
```
*/15 * * * * cd /path/to/agent && /usr/bin/node agent.js >> agent.log 2>&1
```

That's the actual "runs by itself" part: put a finished video + sidecar
JSON into `inbox/`, and within 15 minutes it's uploaded (and, depending on
`autoPublish`, posted) with zero manual steps beyond the initial file drop.

## Metadata sidecar format

`inbox/myvideo.json` (all fields optional — filename is used as the title
if omitted):
```json
{
  "title": "My Video Title",
  "description": "Video description",
  "tags": ["tag1", "tag2"],
  "privacyStatus": "public",
  "facebookMessage": "Custom Facebook post text",
  "instagramCaption": "Custom Instagram caption",
  "instagramVideoUrl": "https://example.com/hosted/myvideo.mp4"
}
```
Setting `"privacyStatus": "public"` on an individual video makes it skip the
review queue even if `autoPublish` is `false` globally — useful when you
trust that one video but still want the default safety net for everything
else. `instagramVideoUrl` is required for Instagram since its API fetches
the file from a public URL rather than accepting an upload.

## Why this still isn't fully "zero infrastructure"

- Credentials live in `config.json` on whatever machine runs this. Treat
  that machine like you'd treat a password vault — the `.gitignore` here
  keeps `config.json`, `processed.json`, `pending.json`, `inbox/`, and
  `done/` out of version control, but you're responsible for the machine's
  own security (disk encryption, access control, backups).
- If the machine is off, nothing runs. There's no cloud component — that
  was a deliberate choice to avoid needing to hand long-lived tokens to a
  server neither of us controls.
- This still only touches accounts you own. It does not, and will not,
  fake engagement or post into groups/Pages you don't administer.
