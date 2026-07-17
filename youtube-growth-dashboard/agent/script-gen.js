const Anthropic = require("@anthropic-ai/sdk");

const MODEL = "claude-opus-4-8";

const CATEGORY_PROMPTS = {
  islamic: {
    label: "Islamic morning reminder",
    system: `You write short, warm Islamic reminders for a YouTube Shorts channel's morning upload.

Hard rules — these are non-negotiable:
- Never quote or cite a specific Quran ayah, Surah, or Hadith by number or claimed wording. Do not write phrases like "Surah X verse Y", "the Prophet said", "it is narrated that", or any text that reads as a direct religious citation.
- Only speak in general terms about Islamic values: gratitude, patience, kindness, honesty, charity, family, humility, trust in Allah, prayer as a practice.
- Keep the tone warm and reflective, not preachy or definitive about religious rulings.
- If you cannot say something without implying a specific citation, say something more general instead.`,
    userPrompt:
      "Write a 45-60 second spoken script for a morning Islamic reminder short. General values only, no specific citations.",
  },
  funny: {
    label: "Funny / childish short",
    system: `You write short, silly, family-friendly comedy scripts for a YouTube Shorts channel's evening upload. Think lighthearted jokes, silly everyday scenarios, wordplay, and childlike humor. Nothing offensive, no innuendo, nothing scary. Suitable for all ages including young kids.`,
    userPrompt:
      "Write a 30-45 second spoken script for a funny, childish, family-friendly short. Make it genuinely funny and silly.",
  },
  motivational: {
    label: "Motivational short",
    system: `You write short, energetic motivational scripts for a YouTube Shorts channel's night upload. Focus on perseverance, self-improvement, discipline, and encouragement. Avoid generic clichés where possible — be specific and vivid. No fabricated quotes attributed to real people.`,
    userPrompt:
      "Write a 30-45 second spoken script for a motivational short about pushing through a hard day and showing up again tomorrow.",
  },
};

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "YouTube title, under 90 characters" },
    narration_script: {
      type: "string",
      description: "Plain spoken text only, no stage directions, no markdown, no emoji",
    },
    description: { type: "string", description: "YouTube video description, 1-3 sentences" },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "5-8 short YouTube tags",
    },
  },
  required: ["title", "narration_script", "description", "tags"],
  additionalProperties: false,
};

const CITATION_PATTERN =
  /\b(surah|hadith|ayah|ayat|verse\s+\d|chapter\s+\d.{0,10}verse|sahih\s+(bukhari|muslim)|quran\s+\d+:\d+)\b/i;

async function generateScript(category, apiKey) {
  const preset = CATEGORY_PROMPTS[category];
  if (!preset) {
    throw new Error(`Unknown category "${category}". Expected one of: ${Object.keys(CATEGORY_PROMPTS).join(", ")}`);
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: preset.system,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    messages: [{ role: "user", content: preset.userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) {
    throw new Error("Claude API returned no text content.");
  }
  const result = JSON.parse(textBlock.text);

  if (category === "islamic" && CITATION_PATTERN.test(result.narration_script)) {
    throw new Error(
      "Generated Islamic script appears to include a specific religious citation, which is not allowed. Aborting rather than publishing unverified content."
    );
  }

  return result;
}

module.exports = { generateScript, CATEGORY_PROMPTS };
