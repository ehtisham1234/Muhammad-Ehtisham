const fs = require("fs");
const path = require("path");
const { loadConfig, log } = require("./lib");
const { textToSpeech, assembleVideo } = require("./media");

// Free, no-API path: you drop a plain-text script into scripts/, this turns
// it into an AI-voiced motivational video (espeak-ng + ffmpeg) and puts it in
// inbox/ for agent.js to upload. No Anthropic API key, no cost.
//
// Script file format (a .txt file in scripts/):
//   - The FIRST non-empty line is the video TITLE.
//   - Everything after it is the narration that gets spoken.
// Optionally, you can put "Tags: word1, word2" as its own line anywhere in
// the first few lines to set custom tags; otherwise tags are derived from the
// title.

const SCRIPTS_FOLDERNAME = "scripts";
const DONE_SCRIPTS_FOLDERNAME = "scripts-done";
const CATEGORY = "motivational";

function parseScriptFile(raw) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let title = "";
  let tags = null;
  const bodyLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!title && trimmed) {
      title = trimmed;
      continue;
    }
    const tagMatch = trimmed.match(/^tags:\s*(.+)$/i);
    if (tagMatch && !tags) {
      tags = tagMatch[1].split(",").map((t) => t.trim()).filter(Boolean);
      continue;
    }
    bodyLines.push(line);
  }

  const narration = bodyLines.join("\n").trim();
  return { title, narration, tags };
}

function deriveTags(title) {
  const stop = new Set(["the", "and", "for", "with", "your", "you", "this", "that", "from", "into"]);
  const words = title
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w.toLowerCase()));
  const seen = new Set();
  const tags = ["motivation"];
  for (const w of words) {
    const t = w.toLowerCase();
    if (!seen.has(t)) {
      seen.add(t);
      tags.push(t);
    }
    if (tags.length >= 6) break;
  }
  return tags;
}

async function main() {
  const config = loadConfig();
  const scriptsFolder = path.resolve(__dirname, SCRIPTS_FOLDERNAME);
  const doneScriptsFolder = path.resolve(__dirname, DONE_SCRIPTS_FOLDERNAME);
  const watchFolder = path.resolve(__dirname, config.watchFolder || "./inbox");
  fs.mkdirSync(scriptsFolder, { recursive: true });
  fs.mkdirSync(doneScriptsFolder, { recursive: true });
  fs.mkdirSync(watchFolder, { recursive: true });

  const files = fs.readdirSync(scriptsFolder).filter((f) => f.toLowerCase().endsWith(".txt"));

  if (files.length === 0) {
    log(`No .txt scripts in ${scriptsFolder}. Drop a script there and run again.`);
    return;
  }

  for (const file of files) {
    const scriptPath = path.join(scriptsFolder, file);
    log("Processing script:", file);
    try {
      const raw = fs.readFileSync(scriptPath, "utf8");
      const { title, narration, tags } = parseScriptFile(raw);

      if (!title || !narration) {
        log("SKIPPED (needs a title on line 1 and narration below it):", file);
        continue;
      }

      const base = `motivational-${Date.now()}`;
      const wavPath = path.join(watchFolder, `${base}.wav`);
      const mp4Path = path.join(watchFolder, `${base}.mp4`);
      const sidecarPath = path.join(watchFolder, `${base}.json`);

      log("Generating voiceover...");
      await textToSpeech(narration, wavPath);

      log("Assembling video...");
      await assembleVideo({ audioPath: wavPath, title, category: CATEGORY, outputPath: mp4Path });
      fs.unlinkSync(wavPath);

      const sidecar = {
        title,
        description: narration.slice(0, 150).replace(/\s+\S*$/, ""),
        tags: tags && tags.length ? tags : deriveTags(title),
      };
      fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));

      // Move the used script out of the way so it isn't reprocessed.
      fs.renameSync(scriptPath, path.join(doneScriptsFolder, file));

      log("Video ready in inbox:", mp4Path);
    } catch (err) {
      log("FAILED:", file, "-", err.message || err);
    }
  }

  log("Done. Run 'node agent.js' to upload (or let cron do it).");
}

if (require.main === module) {
  main().catch((err) => {
    log("FATAL:", err.message || err);
    process.exit(1);
  });
}

module.exports = { main, parseScriptFile, deriveTags };
