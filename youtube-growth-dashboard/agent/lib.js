const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CONFIG_PATH = path.join(__dirname, "config.json");
const UPLOAD_API_BASE = "https://www.googleapis.com/upload/youtube/v3/videos";
const API_BASE = "https://www.googleapis.com/youtube/v3";

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Missing ${CONFIG_PATH}. Copy config.example.json to config.json and fill it in (see README.md).`
    );
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function readJsonSafe(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function getAccessToken(youtubeConfig) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: youtubeConfig.clientId,
      client_secret: youtubeConfig.clientSecret,
      refresh_token: youtubeConfig.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Could not refresh Google access token: ${data.error_description || data.error || res.status}`);
  }
  return data.access_token;
}

async function uploadVideo(accessToken, filePath, metadata) {
  const fileBuffer = fs.readFileSync(filePath);
  const contentType = guessVideoMimeType(filePath);

  const startRes = await fetch(`${UPLOAD_API_BASE}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": contentType,
      "X-Upload-Content-Length": String(fileBuffer.length),
    },
    body: JSON.stringify(metadata),
  });
  if (!startRes.ok) {
    const data = await startRes.json().catch(() => ({}));
    throw new Error(data?.error?.message || `Could not start upload (${startRes.status})`);
  }
  const uploadUrl = startRes.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube didn't return an upload URL.");

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: fileBuffer,
  });
  const result = await putRes.json();
  if (!putRes.ok) {
    throw new Error(result?.error?.message || `Upload failed (${putRes.status})`);
  }
  return result;
}

async function setVideoPrivacy(accessToken, videoId, privacyStatus) {
  const res = await fetch(`${API_BASE}/videos?part=status`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: videoId, status: { privacyStatus } }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Could not update video privacy (${res.status})`);
  }
  return data;
}

function guessVideoMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
  };
  return map[ext] || "video/*";
}

async function postToFacebookPage(pageId, pageToken, message, link) {
  const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ message, link, access_token: pageToken }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `Facebook API error (${res.status})`);
  }
  return data;
}

async function postReelToInstagram(igAccountId, accessToken, videoUrl, caption) {
  const createRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ media_type: "REELS", video_url: videoUrl, caption, access_token: accessToken }),
  });
  const createData = await createRes.json();
  if (!createRes.ok || createData.error) {
    throw new Error(createData.error?.message || `Instagram API error (${createRes.status})`);
  }
  const containerId = createData.id;

  for (let attempt = 0; attempt < 20; attempt++) {
    await sleep(3000);
    const statusRes = await fetch(
      `https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`
    );
    const statusData = await statusRes.json();
    if (statusData.status_code === "FINISHED") break;
    if (statusData.status_code === "ERROR") throw new Error("Instagram failed to process the video.");
    if (attempt === 19) throw new Error("Instagram is still processing the video after 60s — try again later.");
  }

  const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: containerId, access_token: accessToken }),
  });
  const publishData = await publishRes.json();
  if (!publishRes.ok || publishData.error) {
    throw new Error(publishData.error?.message || `Instagram publish error (${publishRes.status})`);
  }
  return publishData;
}

function generateFacebookMessage(title, watchUrl) {
  return `New video: "${title}"\n\nWatch it here: ${watchUrl}`;
}

function generateInstagramCaption(title) {
  return `${title}\n\nFull video on my YouTube channel — link in bio.`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function generateApproveToken() {
  return crypto.randomBytes(24).toString("hex");
}

async function sendReviewEmail(config, videoId, entry) {
  if (!config.email || !config.email.smtpHost) return;

  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: config.email.smtpHost,
    port: config.email.smtpPort || 587,
    secure: !!config.email.smtpSecure,
    auth: { user: config.email.smtpUser, pass: config.email.smtpPass },
  });

  const approveUrl = `${config.publicBaseUrl.replace(/\/$/, "")}/approve/${videoId}?token=${entry.approveToken}`;

  await transporter.sendMail({
    from: config.email.from || config.email.smtpUser,
    to: config.email.to,
    subject: `Review needed: "${entry.title}"`,
    text: `A new video is waiting for your review.\n\nTitle: ${entry.title}\nWatch (unlisted): ${entry.watchUrl}\n\nApprove and publish (makes it public + posts to Facebook/Instagram):\n${approveUrl}\n\nIf this wasn't you, ignore this email — the video stays unlisted until approved.`,
    html: `
      <p>A new video is waiting for your review.</p>
      <p><strong>Title:</strong> ${escapeHtml(entry.title)}<br/>
      <strong>Watch (unlisted):</strong> <a href="${entry.watchUrl}">${entry.watchUrl}</a></p>
      <p><a href="${approveUrl}" style="display:inline-block;padding:12px 20px;background:#ff4d4f;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">Approve &amp; Publish</a></p>
      <p style="color:#888;font-size:0.85em;">This makes the video public and posts it to your configured Facebook Page / Instagram. If this wasn't you, ignore this email — the video stays unlisted until approved.</p>
    `,
  });
  log("Sent review email for", videoId);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = {
  CONFIG_PATH,
  loadConfig,
  readJsonSafe,
  writeJson,
  getAccessToken,
  uploadVideo,
  setVideoPrivacy,
  postToFacebookPage,
  postReelToInstagram,
  generateFacebookMessage,
  generateInstagramCaption,
  generateApproveToken,
  sendReviewEmail,
  sleep,
  log,
};
