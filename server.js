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
  const signature = characterDNA.signature || "gentle smile and warm childlike presence";

  return `
MAIN CHILD CHARACTER - LOCKED VISUAL IDENTITY

This is the exact same child in every illustration.
Do not redesign or reinterpret the child.

Locked identity:
- Age appearance: ${ageLook}
- Hair: ${hair}
- Skin tone: ${skin}
- Eyes: ${eyes}
- Face structure: ${face}
- Outfit style: ${outfit}
- General vibe: ${vibe}
- Signature visual trait: ${signature}

Hard consistency rules:
- same child identity in every image
- same face shape
- same hair look and color
- same skin tone
- same eye look
- same child age appearance
- same overall proportions
- do not make the child look like a different person
- do not randomly change hairstyle, facial structure, or ethnicity
- keep the same premium children's storybook aesthetic

Illustration style must be: ${style}.
`.trim();
}

async function normalizeImageToBase64(imageItem) {
  if (!imageItem) return null;

  if (imageItem.b64_json) {
    return imageItem.b64_json;
  }

  if (imageItem.url) {
    const r = await fetch(imageItem.url);
    const arr = await r.arrayBuffer();
    return Buffer.from(arr).toString("base64");
  }

  return null;
}

/**
 * STEP 1
 * Generate character DNA + character sheet
 */
app.post("/generate-character-reference", async (req, res) => {
  try {
    const {
      child_photo,
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
Create a highly specific, conservative, reusable character DNA for a personalized children's storybook.

Return this exact JSON structure:
{
  "hair": "string",
  "skin": "string",
  "eyes": "string",
  "face": "string",
  "ageLook": "string",
  "outfit": "string",
  "vibe": "string",
  "signature": "string",
  "summary": "string"
}

Rules:
- Be specific and visually stable
- Do not invent dramatic features that are not visible
- Keep the child description conservative and reusable
- Do not mention camera quality
- Do not mention background unless it affects the child
- Focus only on the child appearance
- outfit can be inferred as simple child outfit if unclear
- signature must be a short unique anchor
- This DNA will be reused to keep the same child consistent across the whole book
              `.trim()
            },
            {
              type: "image_url",
              image_url: { url: child_photo }
            }
          ]
        }
      ],
      temperature: 0.1
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
      signature: "soft rounded cheeks and bright curious eyes",
      summary: "A warm curious child hero for a magical storybook."
    });

    const promptCore = buildCharacterPromptCore(characterDNA, style);

    const characterSheetPrompt = `
Create a premium children's storybook character reference sheet.

${promptCore}

Create one elegant reference sheet showing the exact same child in:
- one close portrait
- one slight side angle
- one full body pose

Visual rules:
- this must clearly feel like the same child in all 3 views
- premium children's book quality
- soft polished storybook rendering
- minimal elegant background
- no extra characters
- no text
- no watermark
- do not redesign the child between poses
`.trim();

    const imageResp = await openai.images.generate({
      model: "gpt-image-1",
      prompt: characterSheetPrompt,
      size: "1024x1024"
    });

    const characterSheetBase64 = await normalizeImageToBase64(imageResp?.data?.[0]);

    return res.json({
      status: "ok",
      characterDNA,
      characterPromptCore: promptCore,
      characterSummary: characterDNA.summary || "",
      characterSheetBase64
    });
  } catch (err) {
    console.error("generate-character-reference failed:", err);

    return res.status(500).json({
      status: "error",
      message: err?.message || "Character reference generation failed",
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
- imagePrompt must describe the exact same child consistently
- imagePrompt must never redesign the child
- every imagePrompt must assume the child already has a locked visual identity
- do not describe a new child in each page
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
    console.error("create-book failed:", err);

    return res.status(500).json({
      status: "error",
      message: err?.message || "Book generation failed",
      details: err?.message || "unknown_error"
    });
  }
});

/**
 * STEP 2.5
 * Generate final cover illustration
 */
app.post("/generate-cover-image", async (req, res) => {
  try {
    const {
      title,
      subtitle,
      story_type,
      illustration_style,
      characterPromptCore,
      characterSummary
    } = req.body;

    if (!title) {
      return res.status(400).json({
        status: "error",
        message: "Missing required field: title"
      });
    }

    const style = illustration_style || "Soft Storybook";

    const coverPrompt = `
Create a premium children's storybook COVER illustration.

Illustration style: ${style}

LOCKED CHILD CHARACTER:
${characterPromptCore || "Keep the same main child character consistent."}

SHORT CHARACTER SUMMARY:
${characterSummary || "A warm curious child hero."}

BOOK TITLE:
${title}

BOOK SUBTITLE:
${subtitle || ""}

STORY DIRECTION:
${story_type || "A magical storybook adventure."}

COVER ART DIRECTION:
- create ONE beautiful single cover illustration
- show the child as the hero of the book
- magical, premium, warm, emotional, cinematic
- cover-worthy composition
- elegant lighting
- rich storybook background
- no reference sheet
- no multiple poses
- no split layout
- do not create a character sheet
- no text
- no watermark
- the child should feel polished, premium, and central
`.trim();

    const imgResp = await openai.images.generate({
      model: "gpt-image-1",
      prompt: coverPrompt,
      size: "1024x1024"
    });

    const coverImageBase64 = await normalizeImageToBase64(imgResp?.data?.[0]);

    return res.json({
      status: "ok",
      coverImageBase64
    });
  } catch (err) {
    console.error("generate-cover-image failed:", err);

    return res.status(500).json({
      status: "error",
      message: err?.message || "Cover image generation failed",
      details: err?.message || "unknown_error"
    });
  }
});

/**
 * STEP 3
 * Generate final page image with stronger character consistency
 */
app.post("/generate-image", async (req, res) => {
  try {
    const {
      prompt,
      illustration_style,
      characterPromptCore,
      characterSummary
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

LOCKED CHILD CHARACTER:
${characterPromptCore || "Keep the same main child character consistent."}

SHORT CHARACTER SUMMARY:
${characterSummary || "A warm curious child hero."}

SCENE TO ILLUSTRATE:
${prompt}

HARD RULES:
- this must be the exact same child as the character reference
- same face shape
- same hair appearance
- same skin tone
- same eye look
- same age appearance
- same child identity across the entire book
- do not redesign the child
- do not age up or age down the child
- do not randomize facial features
- warm magical premium storybook feeling
- elegant composition
- no text
- no watermark
`.trim();

    const imgResp = await openai.images.generate({
      model: "gpt-image-1",
      prompt: finalPrompt,
      size: "1024x1024"
    });

    const imageBase64 = await normalizeImageToBase64(imgResp?.data?.[0]);

    return res.json({
      status: "ok",
      imageBase64
    });
  } catch (err) {
    console.error("generate-image failed:", err);

    return res.status(500).json({
      status: "error",
      message: err?.message || "Image generation failed",
      details: err?.message || "unknown_error"
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
