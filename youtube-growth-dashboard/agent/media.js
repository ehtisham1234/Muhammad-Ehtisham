const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const FONT_FILE = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const BACKGROUND_COLORS = {
  islamic: "0x0f3d2e",
  funny: "0xff6b35",
  motivational: "0x1a1a2e",
};

function escapeForDrawtext(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "’")
    .replace(/%/g, "\\%");
}

async function textToSpeech(text, outputWavPath) {
  const txtPath = outputWavPath.replace(/\.wav$/, ".txt");
  fs.writeFileSync(txtPath, text, "utf8");
  try {
    await execFileAsync("espeak-ng", ["-v", "en-us", "-s", "150", "-f", txtPath, "-w", outputWavPath]);
  } finally {
    fs.unlinkSync(txtPath);
  }
}

async function getAudioDuration(wavPath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    wavPath,
  ]);
  return parseFloat(stdout.trim());
}

async function assembleVideo({ audioPath, title, category, outputPath }) {
  const duration = await getAudioDuration(audioPath);
  const bgColor = BACKGROUND_COLORS[category] || "0x1a1a2e";
  const safeTitle = escapeForDrawtext(wrapText(title, 22));

  const drawtext = [
    `drawtext=fontfile='${FONT_FILE}'`,
    `text='${safeTitle}'`,
    "fontsize=64",
    "fontcolor=white",
    "line_spacing=16",
    "x=(w-text_w)/2",
    "y=(h-text_h)/2",
    "box=1",
    "boxcolor=black@0.35",
    "boxborderw=30",
  ].join(":");

  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${bgColor}:s=1080x1920:d=${(duration + 1).toFixed(2)}`,
    "-i",
    audioPath,
    "-vf",
    drawtext,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    outputPath,
  ]);

  return { duration, outputPath };
}

function wrapText(text, maxLineLength) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxLineLength) {
      lines.push(current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

module.exports = { textToSpeech, assembleVideo, getAudioDuration };
