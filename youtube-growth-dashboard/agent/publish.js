const path = require("path");
const {
  loadConfig,
  readJsonSafe,
  writeJson,
  getAccessToken,
  setVideoPrivacy,
  postToFacebookPage,
  postReelToInstagram,
  log,
} = require("./lib");

const PENDING_PATH = path.join(__dirname, "pending.json");

async function main() {
  const videoId = process.argv[2];
  if (!videoId) {
    const pending = readJsonSafe(PENDING_PATH, {});
    const entries = Object.entries(pending);
    if (entries.length === 0) {
      console.log("Nothing pending review.");
      return;
    }
    console.log("Pending videos awaiting review:\n");
    for (const [id, v] of entries) {
      console.log(`${id}  "${v.title}"  ${v.watchUrl}`);
    }
    console.log("\nRun: node publish.js <videoId> to make one public and post it.");
    return;
  }

  const pending = readJsonSafe(PENDING_PATH, {});
  const entry = pending[videoId];
  if (!entry) {
    console.error(`No pending entry for ${videoId}. Run 'node publish.js' with no arguments to list pending videos.`);
    process.exit(1);
  }

  const config = loadConfig();
  const accessToken = await getAccessToken(config.youtube);

  await setVideoPrivacy(accessToken, videoId, "public");
  log("Video is now public:", entry.watchUrl);

  const fb = config.facebook || {};
  const ig = config.instagram || {};

  if (fb.pageId && fb.pageAccessToken) {
    try {
      await postToFacebookPage(fb.pageId, fb.pageAccessToken, entry.facebookMessage, entry.watchUrl);
      log("Posted to Facebook Page.");
    } catch (err) {
      log("Facebook post failed:", err.message || err);
    }
  }

  if (ig.businessAccountId && fb.pageAccessToken && entry.instagramVideoUrl) {
    try {
      await postReelToInstagram(ig.businessAccountId, fb.pageAccessToken, entry.instagramVideoUrl, entry.instagramCaption);
      log("Posted to Instagram.");
    } catch (err) {
      log("Instagram post failed:", err.message || err);
    }
  }

  delete pending[videoId];
  writeJson(PENDING_PATH, pending);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { main };
