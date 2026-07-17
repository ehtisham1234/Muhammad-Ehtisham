const fs = require("fs");
const path = require("path");
const { loadConfig, log } = require("./lib");
const { generateScript } = require("./script-gen");
const { textToSpeech, assembleVideo } = require("./media");

const VALID_CATEGORIES = ["islamic", "funny", "motivational"];

async function main() {
  const category = process.argv[2];
  if (!VALID_CATEGORIES.includes(category)) {
    console.error(`Usage: node generate-video.js <${VALID_CATEGORIES.join("|")}>`);
    process.exit(1);
  }

  const config = loadConfig();
  if (!config.anthropic || !config.anthropic.apiKey) {
    throw new Error("Missing config.anthropic.apiKey — add your Anthropic API key to config.json.");
  }

  const watchFolder = path.resolve(__dirname, config.watchFolder || "./inbox");
  fs.mkdirSync(watchFolder, { recursive: true });

  log("Generating script for category:", category);
  const script = await generateScript(category, config.anthropic.apiKey);
  log("Title:", script.title);

  const base = `${category}-${Date.now()}`;
  const wavPath = path.join(watchFolder, `${base}.wav`);
  const mp4Path = path.join(watchFolder, `${base}.mp4`);
  const sidecarPath = path.join(watchFolder, `${base}.json`);

  log("Generating voiceover...");
  await textToSpeech(script.narration_script, wavPath);

  log("Assembling video...");
  await assembleVideo({ audioPath: wavPath, title: script.title, category, outputPath: mp4Path });
  fs.unlinkSync(wavPath);

  const sidecar = {
    title: script.title,
    description: script.description,
    tags: script.tags,
  };

  // Islamic content always goes through human review, no matter what
  // autoPublish is set to globally — never let religious content publish
  // or get promoted unattended.
  if (category === "islamic") {
    sidecar.privacyStatus = "unlisted";
  }

  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));
  log("Video ready in inbox:", mp4Path);
  log("Run 'node agent.js' to upload it (or let cron pick it up).");
}

if (require.main === module) {
  main().catch((err) => {
    log("FATAL:", err.message || err);
    process.exit(1);
  });
}

module.exports = { main };
