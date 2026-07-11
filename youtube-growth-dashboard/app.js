const API_BASE = "https://www.googleapis.com/youtube/v3";
const MAX_VIDEOS = 25;

const form = document.getElementById("connect-form");
const apiKeyInput = document.getElementById("apiKey");
const channelInput = document.getElementById("channelInput");
const errorEl = document.getElementById("error-message");
const dashboard = document.getElementById("dashboard");

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
    renderDashboard(channel, videos);
  } catch (err) {
    showError(err.message || "Something went wrong. Check your API key and channel identifier.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Load My Channel";
  }
});

function restoreSavedInputs() {
  const savedKey = localStorage.getItem("yt_dashboard_apiKey");
  const savedChannel = localStorage.getItem("yt_dashboard_channel");
  if (savedKey) apiKeyInput.value = savedKey;
  if (savedChannel) channelInput.value = savedChannel;
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

function hideError() {
  errorEl.hidden = true;
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
      publishedAt: new Date(v.snippet.publishedAt),
      views,
      likes,
      comments,
      engagementRate,
    };
  });
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
