const fs = require("fs");
const path = require("path");
const {
  loadConfig,
  readJsonSafe,
  writeJson,
  getAccessToken,
  uploadVideo,
  postToFacebookPage,
  postReelToInstagram,
  generateFacebookMessage,
  generateInstagramCaption,
  generateApproveToken,
  sendReviewEmail,
  log,
} = require("./lib");

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".avi", ".webm", ".mkv"];
const PROCESSED_PATH = path.join(__dirname, "processed.json");
const PENDING_PATH = path.join(__dirname, "pending.json");

async function main() {
  const config = loadConfig();
  const watchFolder = path.resolve(__dirname, config.watchFolder || "./inbox");
  const doneFolder = path.resolve(__dirname, config.doneFolder || "./done");
  fs.mkdirSync(watchFolder, { recursive: true });
  fs.mkdirSync(doneFolder, { recursive: true });

  const processed = readJsonSafe(PROCESSED_PATH, {});
  const pending = readJsonSafe(PENDING_PATH, {});

  const files = fs
    .readdirSync(watchFolder)
    .filter((f) => VIDEO_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .filter((f) => !processed[f]);

  if (files.length === 0) {
    log("No new videos in", watchFolder);
    return;
  }

  for (const file of files) {
    log("Processing", file);
    try {
      await processVideo(config, watchFolder, doneFolder, file, pending);
      processed[file] = { status: "done", processedAt: new Date().toISOString() };
    } catch (err) {
      log("FAILED:", file, "-", err.message || err);
      processed[file] = { status: "failed", error: err.message || String(err), processedAt: new Date().toISOString() };
    }
    writeJson(PROCESSED_PATH, processed);
    writeJson(PENDING_PATH, pending);
  }
}

async function processVideo(config, watchFolder, doneFolder, file, pending) {
  const filePath = path.join(watchFolder, file);
  const base = path.basename(file, path.extname(file));
  const sidecarPath = path.join(watchFolder, `${base}.json`);
  const sidecar = fs.existsSync(sidecarPath) ? JSON.parse(fs.readFileSync(sidecarPath, "utf8")) : {};

  const title = sidecar.title || base;
  const description = sidecar.description || "";
  const tags = sidecar.tags || [];
  const privacyStatus = sidecar.privacyStatus || (config.autoPublish ? "public" : "unlisted");

  const accessToken = await getAccessToken(config.youtube);
  const result = await uploadVideo(accessToken, filePath, {
    snippet: { title, description, tags },
    status: { privacyStatus, selfDeclaredMadeForKids: false },
  });

  const watchUrl = `https://youtu.be/${result.id}`;
  log("Uploaded as", privacyStatus, "-", watchUrl);

  // Social posting is tied to the video actually being public — a video
  // forced to "unlisted" (e.g. by generate-video.js for the Islamic
  // category) must never get promoted, regardless of the global
  // autoPublish setting.
  const shouldAutoPost = privacyStatus === "public";

  if (shouldAutoPost) {
    await runSocialPosts(config, sidecar, title, watchUrl);
  } else {
    const entry = {
      title,
      watchUrl,
      sourceFile: file,
      facebookMessage: sidecar.facebookMessage || generateFacebookMessage(title, watchUrl),
      instagramCaption: sidecar.instagramCaption || generateInstagramCaption(title),
      instagramVideoUrl: sidecar.instagramVideoUrl || "",
      addedAt: new Date().toISOString(),
      approveToken: generateApproveToken(),
    };
    pending[result.id] = entry;
    log("Uploaded unlisted, awaiting review. Run: node publish.js", result.id);

    if (config.email && config.email.smtpHost) {
      try {
        await sendReviewEmail(config, result.id, entry);
      } catch (err) {
        log("Could not send review email:", err.message || err);
      }
    }
  }

  fs.renameSync(filePath, path.join(doneFolder, file));
  if (fs.existsSync(sidecarPath)) {
    fs.renameSync(sidecarPath, path.join(doneFolder, `${base}.json`));
  }
}

async function runSocialPosts(config, sidecar, title, watchUrl) {
  const fb = config.facebook || {};
  const ig = config.instagram || {};

  if (fb.pageId && fb.pageAccessToken) {
    try {
      const message = sidecar.facebookMessage || generateFacebookMessage(title, watchUrl);
      await postToFacebookPage(fb.pageId, fb.pageAccessToken, message, watchUrl);
      log("Posted to Facebook Page.");
    } catch (err) {
      log("Facebook post failed:", err.message || err);
    }
  }

  if (ig.businessAccountId && fb.pageAccessToken && sidecar.instagramVideoUrl) {
    try {
      const caption = sidecar.instagramCaption || generateInstagramCaption(title);
      await postReelToInstagram(ig.businessAccountId, fb.pageAccessToken, sidecar.instagramVideoUrl, caption);
      log("Posted to Instagram.");
    } catch (err) {
      log("Instagram post failed:", err.message || err);
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    log("FATAL:", err.message || err);
    process.exit(1);
  });
}

module.exports = { main };
