import express from "express";
import cors from "cors";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

function safeJsonParse(raw, fallback = {}) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function buildCharacterPromptCore(characterDNA, style) {
  const hair = characterDNA.hair || "soft child hair";
  const skin = characterDNA.skin || "natural skin tone";
  const eyes = characterDNA.eyes || "gentle expressive eyes";
  const face = characterDNA.face || "soft child face";
  const vibe = characterDNA.vibe || "warm curious child";
  const ageLook = characterDNA.ageLook || "young child";
  const outfit = characterDNA.outfit || "simple timeless child outfit";

  return `
Main character reference:
- ${ageLook}
- Hair: ${hair}
- Skin tone: ${skin}
- Eyes: ${eyes}
- Face: ${face}
- Outfit style: ${outfit}
- General vibe: ${vibe}

Keep this exact same child character consistent across all illustrations.
Do not change the child's identity, age appearance, hair color, skin tone, or facial structure.
Illustration style must be: ${style}.
`.trim();
}

/**
 * STEP 1
 * Generate character DNA + character sheet
 */
app.post("/generate-character-reference", async (req, res) => {
  try {
    const {
      child_photo,
      child_name,
      age,
      gender,
      illustration_style
    } = req.body;

    if (!child_photo) {
      return res.status(400).json({
        status: "error",
        message: "Missing child_photo"
      });
    }

    const style = illustration_style || "Soft Storybook";

    const dnaCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
Analyze the uploaded child photo and return ONLY JSON.

Goal:
Create a highly reusable character DNA for a personalized children's storybook.

Return this exact JSON structure:
{
  "hair": "string",
  "skin": "string",
  "eyes": "string",
  "face": "string",
  "ageLook": "string",
  "outfit": "string",
  "vibe": "string",
  "summary": "string"
}

Rules:
- Keep it concise
- Keep it visual
- Do not mention camera quality
- Do not mention background unless it affects the child
- Focus only on the child appearance
- outfit can be inferred as simple child outfit if unclear
              `.trim()
            },
            {
              type: "image_url",
              image_url: { url: child_photo }
            }
          ]
        }
      ],
      temperature: 0.2
    });

    const dnaRaw = dnaCompletion.choices?.[0]?.message?.content || "{}";
    const characterDNA = safeJsonParse(dnaRaw, {
      hair: "soft brown child hair",
      skin: "natural warm skin tone",
      eyes: "bright child eyes",
      face: "soft rounded child face",
      ageLook: "young child",
      outfit: "simple timeless child outfit",
      vibe: "warm curious child",
      summary: "A warm curious child hero for a magical storybook."
    });

    const promptCore = buildCharacterPromptCore(characterDNA, style);

    const characterSheetPrompt = `
Create a premium children's storybook character sheet.

Style: ${style}

${promptCore}

Create ONE clean composition showing the same child character in:
- front view
- slight side view
- full body storybook pose

Background:
- clean soft storybook background
- minimal and elegant
- no text
- no watermark

This is a character reference sheet for a premium children's personalized book.
`.trim();

    const imageResp = await openai.images.generate({
      model: "gpt-image-1",
      prompt: characterSheetPrompt,
      size: "1024x1024"
    });

    const imageItem = imageResp?.data?.[0];
    let characterSheetBase64 = null;

    if (imageItem?.b64_json) {
      characterSheetBase64 = imageItem.b64_json;
    } else if (imageItem?.url) {
      const r = await fetch(imageItem.url);
      const arr = await r.arrayBuffer();
      characterSheetBase64 = Buffer.from(arr).toString("base64");
    }

    return res.json({
      status: "ok",
      characterDNA,
      characterPromptCore: promptCore,
      characterSummary: characterDNA.summary || "",
      characterSheetBase64
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Character reference generation failed",
      details: err?.message || "unknown_error"
    });
  }
});

/**
 * STEP 2
 * Generate story structure using the character reference
 */
app.post("/create-book", async (req, res) => {
  try {
    const {
      child_name,
      age,
      gender,
      story_type,
      illustration_style,
      character_reference
    } = req.body;

    if (!child_name || !age || !story_type) {
      return res.status(400).json({
        status: "error",
        message: "Missing required fields: child_name, age, story_type"
      });
    }

    const style = illustration_style || "Soft Storybook";
    const characterSummary = character_reference?.characterSummary || "A warm curious child hero";
    const characterPromptCore = character_reference?.characterPromptCore || "";

    const prompt = `
You are a premium personalized children's book writer.

Create a magical storybook for a child.

Child name: ${child_name}
Child age: ${age}
Child gender: ${gender || "not specified"}
Story direction: ${story_type}
Illustration style: ${style}

Character summary:
${characterSummary}

Character consistency instructions:
${characterPromptCore}

Return ONLY JSON in this exact structure:
{
  "title": "string",
  "subtitle": "string",
  "pages": [
    {
      "text": "string",
      "imagePrompt": "string"
    }
  ]
}

Rules:
- Exactly 10 story pages
- Each page text must be 35-70 words
- The child must clearly be the hero
- Keep story warm, magical, premium, emotional
- imagePrompt must describe the same child consistently
- Do not include page numbers inside text
- No brand names
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    const book = safeJsonParse(raw, {});

    const title = book.title || `The Magical Adventure of ${child_name}`;
    const subtitle = book.subtitle || "A story where you are the hero";
    const pages = Array.isArray(book.pages) ? book.pages.slice(0, 10) : [];

    if (pages.length !== 10) {
      return res.status(500).json({
        status: "error",
        message: "AI returned invalid page count",
        debug: { returned: pages.length }
      });
    }

    return res.json({
      status: "ok",
      title,
      subtitle,
      illustration_style: style,
      pages: pages.map((p) => ({
        text: String(p.text || "").trim(),
        imagePrompt: String(p.imagePrompt || "").trim()
      }))
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Book generation failed",
      details: err?.message || "unknown_error"
    });
  }
});

/**
 * STEP 3
 * Generate final page image with character consistency
 */
app.post("/generate-image", async (req, res) => {
  try {
    const {
      prompt,
      illustration_style,
      characterPromptCore
    } = req.body;

    if (!prompt) {
      return res.status(400).json({
        status: "error",
        message: "Missing required field: prompt"
      });
    }

    const style = illustration_style || "Soft Storybook";

    const finalPrompt = `
Create a premium children's storybook illustration.

Illustration style: ${style}

Character consistency:
${characterPromptCore || "Keep the same main child character consistent."}

Scene:
${prompt}

Rules:
- same child identity
- same face structure
- same hair and skin tone
- warm magical storybook aesthetic
- no text
- no watermark
- elegant composition
`.trim();

    const imgResp = await openai.images.generate({
      model: "gpt-image-1",
      prompt: finalPrompt,
      size: "1024x1024"
    });

    const item = imgResp?.data?.[0];

    if (item?.b64_json) {
      return res.json({ status: "ok", imageBase64: item.b64_json });
    }

    if (item?.url) {
      const r = await fetch(item.url);
      const arr = await r.arrayBuffer();
      const base64 = Buffer.from(arr).toString("base64");
      return res.json({ status: "ok", imageBase64: base64 });
    }

    return res.status(500).json({
      status: "error",
      message: "Image generation failed",
      code: "no_image_returned"
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Image generation failed",
      details: err?.message || "unknown_error"
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
