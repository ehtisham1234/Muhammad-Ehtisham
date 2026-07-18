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
     review with `node publish.js` (lists pending videos), `node publish.js
     <videoId>` (makes it public and posts it), or — if email is
     configured — click "Approve & Publish" in the email you get (see
     below).
   - `true`: uploads as **public** and immediately posts to your configured
     Facebook Page / Instagram, no review step.
5. Moves the processed file (and its sidecar) into `done/` and records it
   in `processed.json` so it's never re-processed.

### Optional: `generate-video.js` — full content, not just upload

`node generate-video.js <islamic|funny|motivational>` writes a complete,
ready-to-upload video into `inbox/` from nothing: it asks Claude for a short
script, converts it to speech (`espeak-ng`), lays it over a title card
(`ffmpeg`), and drops the result — video + sidecar — where `agent.js` will
pick it up. Combine the two in cron and you get three unattended uploads a
day with zero manual steps (see the cron block below).

**The `islamic` category is hard-coded to always require review.** Its
sidecar always sets `privacyStatus: "unlisted"`, which overrides
`autoPublish` — even in fully unattended mode, a religious-themed video
never goes public or gets shared without a human looking at it first. This
isn't configurable, on purpose: the script generator is explicitly
instructed never to invent a specific Quran ayah or Hadith citation, and the
output is scanned for citation-shaped text before it's even written to
disk, but AI-generated text can still be wrong in ways that matter more for
religious content than for a joke or a pep talk — so it always gets a human
check. `funny` and `motivational` follow the normal `autoPublish` rule.

Requires `anthropic.apiKey` in `config.json` (from
[console.anthropic.com](https://console.anthropic.com)) — this is billed
per request, at Claude's standard API rates, separately from anything else
in this repo.

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
   pipeline — start with `false`). Note that `generate-video.js` overrides
   this for the `islamic` category regardless (see above).
6. `npm install` (installs the Anthropic SDK and `nodemailer` used by the
   optional pieces below).

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

### Full cycle: auto-generated motivational video

Combine `generate-video.js` with `agent.js` to go from nothing to an
uploaded video with no file to drop in yourself. This channel only wants
**motivational** content, so `generate-video.js` defaults to that category —
you don't even pass an argument:

```
# One motivational video a day at 9am, uploaded 15 min later
0 9  * * * cd /path/to/agent && /usr/bin/node generate-video.js >> generate.log 2>&1
15 9 * * * cd /path/to/agent && /usr/bin/node agent.js          >> agent.log 2>&1
```

Want more than one a day? Add more `generate-video.js` lines at different
hours (each run makes a fresh video). Adjust the hours to your own timezone —
these are just examples.

> The `islamic` and `funny` categories still exist in the code, but you'd
> have to ask for them explicitly (`node generate-video.js funny`). Left as
> the default, every generated video is motivational.

## Optional: email review with a one-click approve link

Instead of SSH-ing in to run `node publish.js <id>`, get an email for every
video that lands in the review queue with an **Approve & Publish** button.
Clicking it makes the video public and posts it to your configured
Facebook/Instagram — the same thing `publish.js` does, just reachable from
your phone.

1. Fill in `email` in `config.json` — for Gmail, use an
   [App Password](https://myaccount.google.com/apppasswords) as
   `smtpPass`, not your real password.
2. Set `publicBaseUrl` to wherever `approve-server.js` will be reachable
   from — see below.
3. Run the approve server as a **persistent process** (not cron — it needs
   to be listening whenever you might click the link):
   ```
   node approve-server.js
   ```
   In production, run it under something that restarts it on crash/reboot
   — `pm2 start approve-server.js`, a `systemd` unit, or a Docker
   restart policy all work.

**On `publicBaseUrl`:** the click has to reach this machine over the
network.
- Running on a VPS/server with a public IP or domain already? Point
  `publicBaseUrl` at that (put it behind a reverse proxy with HTTPS if you
  can — e.g. Caddy or nginx with Let's Encrypt).
- Running on a laptop with no public address? Use a tunnel like
  [ngrok](https://ngrok.com) (`ngrok http 8934`, free tier is enough) and
  set `publicBaseUrl` to the `https://...ngrok...` URL it gives you. Note
  free ngrok URLs change on restart — update `publicBaseUrl` if you restart
  the tunnel.

**Security note on the approve link:** each pending video gets its own
random 48-character token (`approveToken` in `pending.json`), and the link
is only ever sent to the email address you configured. The token is
single-use — once a video is approved, its pending entry is deleted, so the
same link can't be replayed. Anyone who gets hold of the link before you
approve it could publish that one video early, so treat it like you would
any other unsubscribe/magic-sign-in link in your inbox — don't forward it.

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
