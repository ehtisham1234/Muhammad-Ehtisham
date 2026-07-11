const API_BASE = "https://www.googleapis.com/youtube/v3";
const UPLOAD_API_BASE = "https://www.googleapis.com/upload/youtube/v3/videos";
const ANALYTICS_API_BASE = "https://youtubeanalytics.googleapis.com/v2";
const GOOGLE_SCOPES =
  "https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.upload";
const MAX_VIDEOS = 25;

const form = document.getElementById("connect-form");
const apiKeyInput = document.getElementById("apiKey");
const channelInput = document.getElementById("channelInput");
const errorEl = document.getElementById("error-message");
const dashboard = document.getElementById("dashboard");
const oauthSetup = document.getElementById("oauth-setup");
const oauthForm = document.getElementById("oauth-form");
const oauthClientIdInput = document.getElementById("oauthClientId");
const oauthErrorEl = document.getElementById("oauth-error-message");
const oauthStatusEl = document.getElementById("oauth-status");
const publishSetup = document.getElementById("publish-setup");
const publishForm = document.getElementById("publish-form");
const videoPrivacySelect = document.getElementById("videoPrivacy");
const scheduleWrap = document.getElementById("scheduleWrap");
const publishErrorEl = document.getElementById("publish-error-message");
const publishProgressEl = document.getElementById("publish-progress");
const publishResultEl = document.getElementById("publish-result");
const metaSetup = document.getElementById("meta-setup");
const metaForm = document.getElementById("meta-form");
const metaErrorEl = document.getElementById("meta-error-message");
const metaStatusEl = document.getElementById("meta-status");
const metaPostPanel = document.getElementById("meta-post-panel");

let currentChannel = null;
let currentVideos = [];
let tokenClient = null;
let currentAccessToken = null;
let lastUploadedVideo = null;

restoreSavedInputs();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();

  const apiKey = apiKeyInput.value.trim();
  const channelRaw = channelInput.value.trim();
  if (!apiKey || !channelRaw) return;

  localStorage.setItem("yt_dashboard_apiKey", apiKey);
  localStorage.setItem("yt_dashboard_channel", channelRaw);

  const submitBtn = form.querySelector("button");
  submitBtn.disabled = true;
  submitBtn.textContent = "Loading...";

  try {
    const channel = await fetchChannel(apiKey, channelRaw);
    const videos = await fetchRecentVideos(apiKey, channel.uploadsPlaylistId);
    currentChannel = channel;
    currentVideos = videos;
    renderDashboard(channel, videos);
    renderPromoteList(videos, channel);
    oauthSetup.hidden = false;
    metaSetup.hidden = false;
    restoreMetaInputs();
  } catch (err) {
    showError(err.message || "Something went wrong. Check your API key and channel identifier.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Load My Channel";
  }
});

oauthForm.addEventListener("submit", (e) => {
  e.preventDefault();
  hideOauthError();

  const clientId = oauthClientIdInput.value.trim();
  if (!clientId) return;
  localStorage.setItem("yt_dashboard_oauth_client_id", clientId);

  if (typeof google === "undefined" || !google.accounts || !google.accounts.oauth2) {
    showOauthError("Google's sign-in script hasn't loaded yet (or is blocked). Check your connection and try again.");
    return;
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_SCOPES,
    callback: async (response) => {
      if (response.error) {
        showOauthError(`Google sign-in failed: ${response.error}`);
        return;
      }
      currentAccessToken = response.access_token;
      publishSetup.hidden = false;
      oauthStatusEl.hidden = false;
      oauthStatusEl.textContent = "Connected. Loading watch hours...";
      oauthStatusEl.classList.add("connected");
      try {
        await loadWatchHours(response.access_token);
        oauthStatusEl.textContent = "Connected — watch hours below reflect your last sign-in, and you can now upload videos below.";
      } catch (err) {
        showOauthError(err.message || "Could not load watch hours.");
      }
    },
  });

  tokenClient.requestAccessToken();
});

videoPrivacySelect.addEventListener("change", () => {
  scheduleWrap.hidden = videoPrivacySelect.value !== "private";
});

publishForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hidePublishError();
  publishResultEl.hidden = true;

  if (!currentAccessToken) {
    showPublishError("Connect your Google account above first.");
    return;
  }

  const file = document.getElementById("videoFile").files[0];
  if (!file) return;

  const title = document.getElementById("videoTitle").value.trim();
  const description = document.getElementById("videoDescription").value.trim();
  const tags = document
    .getElementById("videoTags")
    .value.split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const privacyStatus = videoPrivacySelect.value;
  const scheduleVal = document.getElementById("videoSchedule").value;

  const status = { privacyStatus, selfDeclaredMadeForKids: false };
  if (privacyStatus === "private" && scheduleVal) {
    status.publishAt = new Date(scheduleVal).toISOString();
  }

  const submitBtn = publishForm.querySelector("button");
  submitBtn.disabled = true;
  publishProgressEl.hidden = false;
  publishProgressEl.textContent = "Starting upload session...";

  try {
    const uploadUrl = await startResumableUpload(currentAccessToken, file, {
      snippet: { title, description, tags },
      status,
    });
    publishProgressEl.textContent = "Uploading 0%...";
    const result = await uploadFileToUrl(uploadUrl, file, (fraction) => {
      publishProgressEl.textContent = `Uploading ${Math.round(fraction * 100)}%...`;
    });
    publishProgressEl.textContent = "Upload complete.";
    lastUploadedVideo = {
      id: result.id,
      title,
      description,
      watchUrl: `https://youtu.be/${result.id}`,
    };
    renderPublishResult(lastUploadedVideo, status.privacyStatus);
    preparePostPanel(lastUploadedVideo);
  } catch (err) {
    showPublishError(err.message || "Upload failed.");
  } finally {
    submitBtn.disabled = false;
  }
});

metaForm.addEventListener("submit", (e) => {
  e.preventDefault();
  hideMetaError();

  const fbPageId = document.getElementById("fbPageId").value.trim();
  const fbPageToken = document.getElementById("fbPageToken").value.trim();
  const igAccountId = document.getElementById("igAccountId").value.trim();

  if (!fbPageId || !fbPageToken) {
    showMetaError("Page ID and Page Access Token are required.");
    return;
  }

  localStorage.setItem("yt_dashboard_fb_page_id", fbPageId);
  localStorage.setItem("yt_dashboard_fb_page_token", fbPageToken);
  localStorage.setItem("yt_dashboard_ig_account_id", igAccountId);

  metaStatusEl.hidden = false;
  metaStatusEl.textContent = "Saved. Ready to post your latest upload.";
  metaPostPanel.hidden = false;

  if (lastUploadedVideo) preparePostPanel(lastUploadedVideo);
});

document.getElementById("post-facebook-btn").addEventListener("click", async () => {
  const statusEl = document.getElementById("facebook-post-status");
  const fbPageId = document.getElementById("fbPageId").value.trim();
  const fbPageToken = document.getElementById("fbPageToken").value.trim();
  const message = document.getElementById("metaMessage").value.trim();
  const link = lastUploadedVideo ? lastUploadedVideo.watchUrl : "";

  statusEl.hidden = false;
  statusEl.textContent = "Posting...";
  try {
    await postToFacebookPage(fbPageId, fbPageToken, message, link);
    statusEl.textContent = "Posted to your Facebook Page.";
  } catch (err) {
    statusEl.textContent = `Failed: ${err.message}`;
  }
});

document.getElementById("post-instagram-btn").addEventListener("click", async () => {
  const statusEl = document.getElementById("instagram-post-status");
  const fbPageToken = document.getElementById("fbPageToken").value.trim();
  const igAccountId = document.getElementById("igAccountId").value.trim();
  const videoUrl = document.getElementById("igVideoUrl").value.trim();
  const caption = document.getElementById("igCaption").value.trim();

  if (!igAccountId || !videoUrl) {
    statusEl.hidden = false;
    statusEl.textContent = "Instagram Business Account ID and a public video URL are both required.";
    return;
  }

  statusEl.hidden = false;
  statusEl.textContent = "Creating media container...";
  try {
    await postReelToInstagram(igAccountId, fbPageToken, videoUrl, caption, (msg) => {
      statusEl.textContent = msg;
    });
    statusEl.textContent = "Posted to Instagram.";
  } catch (err) {
    statusEl.textContent = `Failed: ${err.message}`;
  }
});

function restoreSavedInputs() {
  const savedKey = localStorage.getItem("yt_dashboard_apiKey");
  const savedChannel = localStorage.getItem("yt_dashboard_channel");
  const savedClientId = localStorage.getItem("yt_dashboard_oauth_client_id");
  if (savedKey) apiKeyInput.value = savedKey;
  if (savedChannel) channelInput.value = savedChannel;
  if (savedClientId) oauthClientIdInput.value = savedClientId;
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

function hideError() {
  errorEl.hidden = true;
}

function showOauthError(msg) {
  oauthErrorEl.textContent = msg;
  oauthErrorEl.hidden = false;
}

function hideOauthError() {
  oauthErrorEl.hidden = true;
}

function showPublishError(msg) {
  publishErrorEl.textContent = msg;
  publishErrorEl.hidden = false;
}

function hidePublishError() {
  publishErrorEl.hidden = true;
}

function showMetaError(msg) {
  metaErrorEl.textContent = msg;
  metaErrorEl.hidden = false;
}

function hideMetaError() {
  metaErrorEl.hidden = true;
}

function restoreMetaInputs() {
  const pageId = localStorage.getItem("yt_dashboard_fb_page_id");
  const pageToken = localStorage.getItem("yt_dashboard_fb_page_token");
  const igAccountId = localStorage.getItem("yt_dashboard_ig_account_id");
  if (pageId) document.getElementById("fbPageId").value = pageId;
  if (pageToken) document.getElementById("fbPageToken").value = pageToken;
  if (igAccountId) document.getElementById("igAccountId").value = igAccountId;
  if (pageId && pageToken) metaPostPanel.hidden = false;
}

function renderPublishResult(video, privacyStatus) {
  publishResultEl.hidden = false;
  publishResultEl.innerHTML = `
    <p>Uploaded as <strong>${privacyStatus}</strong>: <a href="${video.watchUrl}" target="_blank" rel="noopener">${video.watchUrl}</a></p>
  `;
}

function preparePostPanel(video) {
  const messageEl = document.getElementById("metaMessage");
  const captionEl = document.getElementById("igCaption");
  if (!messageEl.value) {
    messageEl.value = `New video: "${video.title}"\n\nWatch it here: ${video.watchUrl}`;
  }
  if (!captionEl.value) {
    captionEl.value = `${video.title}\n\nFull video on my YouTube channel — link in bio.`;
  }
}

async function startResumableUpload(accessToken, file, metadata) {
  const res = await fetch(`${UPLOAD_API_BASE}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": file.type || "video/*",
      "X-Upload-Content-Length": String(file.size),
    },
    body: JSON.stringify(metadata),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `Could not start upload (${res.status})`);
  }
  const location = res.headers.get("Location") || res.headers.get("location");
  if (!location) {
    throw new Error("YouTube didn't return an upload URL. Your access token may have expired — reconnect your Google account and try again.");
  }
  return location;
}

function uploadFileToUrl(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "video/*");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Upload succeeded but the response couldn't be parsed."));
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(file);
  });
}

async function postToFacebookPage(pageId, pageToken, message, link) {
  const url = `https://graph.facebook.com/v19.0/${pageId}/feed`;
  const res = await fetch(url, {
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

async function postReelToInstagram(igAccountId, accessToken, videoUrl, caption, onStatus) {
  const createRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      access_token: accessToken,
    }),
  });
  const createData = await createRes.json();
  if (!createRes.ok || createData.error) {
    throw new Error(createData.error?.message || `Instagram API error (${createRes.status})`);
  }
  const containerId = createData.id;

  for (let attempt = 0; attempt < 15; attempt++) {
    onStatus(`Processing video (${attempt + 1}/15)...`);
    await sleep(3000);
    const statusRes = await fetch(
      `https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`
    );
    const statusData = await statusRes.json();
    if (statusData.status_code === "FINISHED") break;
    if (statusData.status_code === "ERROR") {
      throw new Error("Instagram failed to process the video.");
    }
    if (attempt === 14) {
      throw new Error("Instagram is still processing the video — try publishing again in a minute.");
    }
  }

  onStatus("Publishing...");
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiGet(path, params) {
  const url = new URL(`${API_BASE}/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message || `YouTube API error (${res.status})`;
    throw new Error(message);
  }
  return data;
}

async function fetchChannel(apiKey, channelRaw) {
  const isId = /^UC[\w-]{22}$/.test(channelRaw);
  const params = {
    part: "snippet,statistics,contentDetails",
    key: apiKey,
  };
  if (isId) {
    params.id = channelRaw;
  } else {
    params.forHandle = channelRaw.replace(/^@/, "");
  }

  const data = await apiGet("channels", params);
  if (!data.items || data.items.length === 0) {
    throw new Error("Channel not found. Double-check the handle or channel ID.");
  }
  const item = data.items[0];
  return {
    id: item.id,
    title: item.snippet.title,
    subscriberCount: Number(item.statistics.subscriberCount || 0),
    viewCount: Number(item.statistics.viewCount || 0),
    videoCount: Number(item.statistics.videoCount || 0),
    uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
  };
}

async function fetchRecentVideos(apiKey, uploadsPlaylistId) {
  const playlistData = await apiGet("playlistItems", {
    part: "contentDetails",
    playlistId: uploadsPlaylistId,
    maxResults: String(MAX_VIDEOS),
    key: apiKey,
  });

  const videoIds = playlistData.items.map((i) => i.contentDetails.videoId).join(",");
  if (!videoIds) return [];

  const videosData = await apiGet("videos", {
    part: "snippet,statistics",
    id: videoIds,
    key: apiKey,
  });

  return videosData.items.map((v) => {
    const views = Number(v.statistics.viewCount || 0);
    const likes = Number(v.statistics.likeCount || 0);
    const comments = Number(v.statistics.commentCount || 0);
    const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;
    return {
      id: v.id,
      title: v.snippet.title,
      description: v.snippet.description || "",
      publishedAt: new Date(v.snippet.publishedAt),
      views,
      likes,
      comments,
      engagementRate,
    };
  });
}

async function loadWatchHours(accessToken) {
  if (!currentChannel) throw new Error("Load your channel first.");

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 28);
  const startDate = toISODate(start);
  const endDate = toISODate(end);

  const totals = await analyticsGet(accessToken, {
    ids: `channel==${currentChannel.id}`,
    startDate,
    endDate,
    metrics: "estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,views",
  });

  const perVideo = await analyticsGet(accessToken, {
    ids: `channel==${currentChannel.id}`,
    startDate,
    endDate,
    metrics: "estimatedMinutesWatched,averageViewDuration,views",
    dimensions: "video",
    sort: "-views",
    maxResults: "10",
  });

  document.getElementById("watch-hours-section").hidden = false;
  renderWatchHours(totals, perVideo);
}

async function analyticsGet(accessToken, params) {
  const url = new URL(`${ANALYTICS_API_BASE}/reports`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `YouTube Analytics API error (${res.status})`);
  }
  return data;
}

function renderWatchHours(totals, perVideo) {
  const statsEl = document.getElementById("watch-hours-stats");
  const oppEl = document.getElementById("watch-hours-opportunities");
  statsEl.innerHTML = "";
  oppEl.innerHTML = "";

  const row = totals.rows && totals.rows[0];
  if (!row) {
    oppEl.textContent = "No analytics data returned for the last 28 days.";
    return;
  }

  const [minutesWatched, avgViewDurationSec, subsGained, subsLost, views] = row;
  const hoursWatched = minutesWatched / 60;

  const stats = [
    ["Watch Hours", hoursWatched.toFixed(1)],
    ["Avg. View Duration", formatDuration(avgViewDurationSec)],
    ["Subscribers Gained", formatNumber(subsGained)],
    ["Subscribers Lost", formatNumber(subsLost)],
  ];
  stats.forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<span class="stat-label">${label}</span><span class="stat-value">${value}</span>`;
    statsEl.appendChild(card);
  });

  const videoRows = (perVideo.rows || []).map((r) => {
    const [videoId, minutes, avgDurSec, videoViews] = r;
    const match = currentVideos.find((v) => v.id === videoId);
    return {
      title: match ? match.title : videoId,
      minutes,
      avgDurSec,
      views: videoViews,
    };
  });

  if (videoRows.length === 0) {
    oppEl.textContent = "";
    return;
  }

  const weakest = [...videoRows].sort((a, b) => a.avgDurSec - b.avgDurSec).slice(0, 3);
  const lines = weakest.map(
    (v) =>
      `<li><strong>${escapeHtml(truncate(v.title, 60))}</strong> — ${formatNumber(v.views)} views but only ${formatDuration(v.avgDurSec)} average view duration. Check the retention graph in YouTube Studio for the exact drop-off point and re-cut your next video's opening around it.</li>`
  );
  oppEl.innerHTML = `<p><strong>Weakest retention among your most-viewed videos (last 28 days):</strong></p><ul>${lines.join("")}</ul>`;
}

function formatDuration(totalSeconds) {
  const s = Math.round(totalSeconds || 0);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function renderDashboard(channel, videos) {
  dashboard.hidden = false;

  document.getElementById("stat-subs").textContent = formatNumber(channel.subscriberCount);
  document.getElementById("stat-views").textContent = formatNumber(channel.viewCount);
  document.getElementById("stat-videos").textContent = formatNumber(channel.videoCount);

  const avgEngagement =
    videos.length > 0
      ? videos.reduce((sum, v) => sum + v.engagementRate, 0) / videos.length
      : 0;
  document.getElementById("stat-engagement").textContent = `${avgEngagement.toFixed(2)}%`;

  renderChart(videos, avgEngagement);
  renderOpportunities(videos, avgEngagement);
  renderCadence(videos);
}

function renderChart(videos, avgEngagement) {
  const chart = document.getElementById("chart");
  chart.innerHTML = "";
  if (videos.length === 0) {
    chart.textContent = "No videos found.";
    return;
  }

  const maxViews = Math.max(...videos.map((v) => v.views), 1);
  const chronological = [...videos].sort((a, b) => a.publishedAt - b.publishedAt);
  const maxBarHeightPx = 140;

  chronological.forEach((v) => {
    const wrap = document.createElement("div");
    wrap.className = "chart-bar-wrap";

    const bar = document.createElement("div");
    bar.className = "chart-bar" + (v.engagementRate < avgEngagement ? " under-avg" : "");
    const heightPx = Math.max((v.views / maxViews) * maxBarHeightPx, 3);
    bar.style.height = `${heightPx}px`;
    bar.title = `${v.title}\n${formatNumber(v.views)} views · ${v.engagementRate.toFixed(2)}% engagement`;

    const label = document.createElement("span");
    label.className = "chart-label";
    label.textContent = truncate(v.title, 22);

    wrap.appendChild(bar);
    wrap.appendChild(label);
    chart.appendChild(wrap);
  });
}

function renderOpportunities(videos, avgEngagement) {
  const list = document.getElementById("opportunities");
  list.innerHTML = "";

  const underperforming = [...videos]
    .filter((v) => v.engagementRate < avgEngagement)
    .sort((a, b) => a.engagementRate - b.engagementRate)
    .slice(0, 5);

  if (underperforming.length === 0) {
    const li = document.createElement("li");
    li.textContent = "All recent videos are performing at or above your channel average. Nice work — keep the format consistent.";
    list.appendChild(li);
    return;
  }

  underperforming.forEach((v) => {
    const li = document.createElement("li");
    const likeRatio = v.views > 0 ? (v.likes / v.views) * 100 : 0;
    const commentRatio = v.views > 0 ? (v.comments / v.views) * 100 : 0;

    let suggestion;
    if (v.views > 0 && likeRatio < 2 && commentRatio < 0.1) {
      suggestion =
        "Views came in but likes and comments barely moved — the content may not be delivering on the title/thumbnail promise, or there's no clear ask. Add a specific, single call-to-action tied to a payoff moment.";
    } else if (v.views < avgEngagement) {
      suggestion =
        "Low reach relative to your other videos — check the thumbnail/title pairing and the first 15 seconds of retention data in YouTube Studio.";
    } else {
      suggestion =
        "Engagement is below your average — try pinning a question comment and pointing to a related video with an end screen.";
    }

    li.innerHTML = `
      <span class="video-title">${escapeHtml(v.title)}</span>
      <span class="video-meta">${formatNumber(v.views)} views · ${formatNumber(v.likes)} likes · ${formatNumber(v.comments)} comments · ${v.engagementRate.toFixed(2)}% engagement</span>
      <span class="suggestion">${suggestion}</span>
    `;
    list.appendChild(li);
  });
}

function renderCadence(videos) {
  const el = document.getElementById("cadence");
  if (videos.length < 2) {
    el.textContent = "Not enough recent videos to measure upload cadence.";
    return;
  }

  const sorted = [...videos].sort((a, b) => a.publishedAt - b.publishedAt);
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i].publishedAt - sorted[i - 1].publishedAt) / (1000 * 60 * 60 * 24));
  }
  const avgGapDays = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const daysSinceLast = (Date.now() - sorted[sorted.length - 1].publishedAt) / (1000 * 60 * 60 * 24);

  const cadenceCls = daysSinceLast > avgGapDays * 1.5 ? "warn" : "good";
  el.innerHTML = `
    <p>Average gap between uploads: <strong>${avgGapDays.toFixed(1)} days</strong></p>
    <p class="${cadenceCls}">Days since your last upload: <strong>${daysSinceLast.toFixed(1)} days</strong>
    ${daysSinceLast > avgGapDays * 1.5 ? " — you're overdue relative to your own pace. Subscribers lose the habit of checking your channel when uploads go quiet." : " — on pace."}</p>
  `;
}

function formatNumber(n) {
  return new Intl.NumberFormat().format(n);
}

function truncate(str, len) {
  return str.length > len ? str.slice(0, len - 1) + "…" : str;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

const PROMOTE_PLATFORMS = ["X / Twitter", "Instagram", "Facebook", "LinkedIn", "WhatsApp", "Reddit"];

function renderPromoteList(videos, channel) {
  const container = document.getElementById("promote-list");
  container.innerHTML = "";

  const recent = [...videos].sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 5);
  if (recent.length === 0) {
    container.textContent = "No videos to promote yet.";
    return;
  }

  recent.forEach((video) => {
    const item = document.createElement("div");
    item.className = "promote-item";

    const titleEl = document.createElement("span");
    titleEl.className = "promote-title";
    titleEl.textContent = video.title;
    item.appendChild(titleEl);

    const tabsEl = document.createElement("div");
    tabsEl.className = "promote-tabs";
    const captionEl = document.createElement("div");
    captionEl.className = "promote-caption";
    const copyBtn = document.createElement("button");
    copyBtn.className = "promote-copy-btn";
    copyBtn.type = "button";
    copyBtn.textContent = "Copy caption";

    function selectPlatform(platform, tabEl) {
      [...tabsEl.children].forEach((t) => t.classList.remove("active"));
      tabEl.classList.add("active");
      captionEl.textContent = generateCaption(platform, video, channel);
      copyBtn.textContent = "Copy caption";
      copyBtn.classList.remove("copied");
    }

    PROMOTE_PLATFORMS.forEach((platform, idx) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "promote-tab";
      tab.textContent = platform;
      tab.addEventListener("click", () => selectPlatform(platform, tab));
      tabsEl.appendChild(tab);
      if (idx === 0) selectPlatform(platform, tab);
    });

    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(captionEl.textContent);
        copyBtn.textContent = "Copied!";
        copyBtn.classList.add("copied");
      } catch {
        copyBtn.textContent = "Select the text above to copy";
      }
    });

    item.appendChild(tabsEl);
    item.appendChild(captionEl);
    item.appendChild(copyBtn);
    container.appendChild(item);
  });

  const note = document.createElement("p");
  note.className = "hint";
  note.textContent =
    "Note: subreddits generally require you to be an active, non-promotional community member (the common rule of thumb is roughly 9 helpful posts for every 1 self-promotional link) — check each subreddit's rules before posting.";
  container.appendChild(note);
}

function generateCaption(platform, video, channel) {
  const url = `https://youtu.be/${video.id}`;
  const hashtags = generateHashtags(video.title);

  switch (platform) {
    case "X / Twitter": {
      const tags = hashtags.slice(0, 2).map((h) => `#${h}`).join(" ");
      return truncate(`${video.title}\n\n${url}\n\n${tags}`, 280);
    }
    case "Instagram": {
      const tags = hashtags.slice(0, 8).map((h) => `#${h}`).join(" ");
      return `${video.title}\n\nFull video is live now — link in bio.\n\n${tags}`;
    }
    case "Facebook":
      return `New video: "${video.title}"\n\nWatch it here: ${url}\n\nWould love to hear what you think in the comments.`;
    case "LinkedIn": {
      const tags = hashtags.slice(0, 2).map((h) => `#${h}`).join(" ");
      return `Just published: "${video.title}"\n\n${url}\n\n${tags}`;
    }
    case "WhatsApp":
      return `Hey! Just posted a new video — "${video.title}". Check it out: ${url}`;
    case "Reddit":
      return `Title: ${video.title}\n\nLink: ${url}\n\n(Only post this where self-promotion is welcomed by the subreddit's rules, and prefer participating genuinely over just dropping links.)`;
    default:
      return `${video.title} ${url}`;
  }
}

function generateHashtags(title) {
  const stopwords = new Set([
    "the", "and", "for", "with", "this", "that", "your", "you", "are", "how",
    "what", "why", "from", "have", "just", "into", "over", "when", "who",
    "was", "were", "will", "can", "not", "but", "all", "new",
  ]);
  const words = title
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopwords.has(w.toLowerCase()));

  const seen = new Set();
  const tags = [];
  for (const w of words) {
    const tag = w.charAt(0).toUpperCase() + w.slice(1);
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
    if (tags.length >= 6) break;
  }
  return tags;
}
