import express from "express";
import cors from "cors";
import OpenAI from "openai";
import path from "path";
import fs from "fs";
import { promises as fsp } from "fs";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DATA_DIR = path.join(__dirname, "data");
const BOOKS_FILE = path.join(DATA_DIR, "books.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(BOOKS_FILE)) {
  fs.writeFileSync(BOOKS_FILE, JSON.stringify({ books: [] }, null, 2), "utf8");
}

async function readBooksDb() {
  const raw = await fsp.readFile(BOOKS_FILE, "utf8");
  return JSON.parse(raw || '{"books":[]}');
}

async function writeBooksDb(db) {
  await fsp.writeFile(BOOKS_FILE, JSON.stringify(db, null, 2), "utf8");
}

async function insertBook(book) {
  const db = await readBooksDb();
  db.books.push(book);
  await writeBooksDb(db);
  return book;
}

async function updateBook(bookId, patch) {
  const db = await readBooksDb();
  const idx = db.books.findIndex((b) => b.bookId === bookId);

  if (idx === -1) return null;

  db.books[idx] = {
    ...db.books[idx],
    ...patch,
    updatedAt: new Date().toISOString()
  };

  await writeBooksDb(db);
  return db.books[idx];
}

async function getBook(bookId) {
  const db = await readBooksDb();
  return db.books.find((b) => b.bookId === bookId) || null;
}

function safeJsonParse(raw, fallback = {}) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function sanitizeBrandTerms(text = "") {
  return String(text)
    .replaceAll(/\bBatman\b/gi, "superhero")
    .replaceAll(/\bIron\s*Man\b/gi, "red superhero")
    .replaceAll(/\bMarvel\b/gi, "comic-style")
    .replaceAll(/\bDisney\b/gi, "storybook")
    .replaceAll(/\bPixar\b/gi, "3D animated")
    .replaceAll(/\bSuperman\b/gi, "heroic")
    .replaceAll(/\bSpider[- ]?Man\b/gi, "web hero")
    .replaceAll(/\bFrozen\b/gi, "snowy fantasy")
    .replaceAll(/\bMickey\b/gi, "cartoon mouse")
    .replaceAll(/\bMinnie\b/gi, "cartoon character");
}

function sanitizeStoryPayload(obj = {}) {
  return {
    ...obj,
    childName: sanitizeBrandTerms(obj.childName || ""),
    storyIdea: sanitizeBrandTerms(obj.storyIdea || ""),
    illustrationStyle: sanitizeBrandTerms(obj.illustrationStyle || ""),
    croppedPhoto: obj.croppedPhoto || "",
    originalPhoto: obj.originalPhoto || ""
  };
}

function sanitizeImagePrompt(text = "") {
  return sanitizeBrandTerms(text)
    .replaceAll(/\blogo\b/gi, "symbol")
    .replaceAll(/\bbrand\b/gi, "design")
    .replaceAll(/\btrademark\b/gi, "graphic detail");
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

async function normalizeImageToBase64(imageItem) {
  if (!imageItem) return null;

  if (imageItem?.b64_json) {
    return imageItem.b64_json;
  }

  if (imageItem?.url) {
    const r = await fetch(imageItem.url);
    const arr = await r.arrayBuffer();
    return Buffer.from(arr).toString("base64");
  }

  return null;
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/**
 * Create initial book record
 */
app.post("/api/books/create", async (req, res) => {
  try {
    const cleanInput = sanitizeStoryPayload(req.body || {});
    const rawInput = req.body || {};

    const bookId = crypto.randomUUID();

    const book = {
      bookId,
      childName: cleanInput.childName || "",
      childAge: rawInput.childAge || "",
      childGender: rawInput.childGender || "",
      storyIdea: cleanInput.storyIdea || "",
      illustrationStyle: cleanInput.illustrationStyle || "Soft Storybook",
      croppedPhoto: cleanInput.croppedPhoto || "",
      originalPhoto: cleanInput.originalPhoto || "",
      characterReference: null,
      generatedBook: null,
      coverImage: null,
      previewImages: [],
      fullImages: [],
      selectedFormat: "digital",
      selectedPrice: 39,
      paymentStatus: "pending",
      purchaseUnlocked: false,
      shopifyOrderId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await insertBook(book);

    return res.json({
      status: "ok",
      bookId
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err?.message || "Failed to create book"
    });
  }
});

/**
 * Get book by id
 */
app.get("/api/books/:bookId", async (req, res) => {
  try {
    const book = await getBook(req.params.bookId);

    if (!book) {
      return res.status(404).json({
        status: "error",
        message: "Book not found"
      });
    }

    return res.json({
      status: "ok",
      book
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err?.message || "Failed to fetch book"
    });
  }
});

/**
 * Update book by id
 */
app.patch("/api/books/:bookId", async (req, res) => {
  try {
    const updated = await updateBook(req.params.bookId, req.body || {});

    if (!updated) {
      return res.status(404).json({
        status: "error",
        message: "Book not found"
      });
    }

    return res.json({
      status: "ok",
      book: updated
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err?.message || "Failed to update book"
    });
  }
});

/**
 * Unlock book after payment
 */
app.post("/api/books/:bookId/unlock", async (req, res) => {
  try {
    const updated = await updateBook(req.params.bookId, {
      paymentStatus: "paid",
      purchaseUnlocked: true
    });

    if (!updated) {
      return res.status(404).json({
        status: "error",
        message: "Book not found"
      });
    }

    return res.json({
      status: "ok",
      book: updated
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err?.message || "Failed to unlock book"
    });
  }
});

/**
 * Character reference
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
    const safeStyle = sanitizeBrandTerms(style);

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

Return:
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
- Focus only on the child
- Ignore any brand names, logos, copyrighted characters, or toy franchises
- If clothing includes a recognizable character or logo, describe it generically
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

    const promptCore = buildCharacterPromptCore(characterDNA, safeStyle);

    const characterSheetPrompt = `
Create a premium children's storybook character sheet.

Style: ${safeStyle}

${sanitizeBrandTerms(promptCore)}

Create ONE clean composition showing the same child character in:
- front view
- slight side view
- full body storybook pose

Background:
- clean soft storybook background
- minimal and elegant
- no text
- no watermark
- no logos
- no branded costume details
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
    return res.status(500).json({
      status: "error",
      message: "Character reference generation failed",
      details: err?.message || "unknown_error"
    });
  }
});

/**
 * Create story text
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

    const cleanStoryType = sanitizeBrandTerms(story_type || "");
    const cleanChildName = sanitizeBrandTerms(child_name || "");
    const cleanStyle = sanitizeBrandTerms(style || "");
    const cleanCharacterSummary = sanitizeBrandTerms(characterSummary || "");
    const cleanCharacterPromptCore = sanitizeBrandTerms(characterPromptCore || "");

    const prompt = `
You are a premium personalized children's book writer.

Child name: ${cleanChildName}
Child age: ${age}
Child gender: ${gender || "not specified"}
Story direction: ${cleanStoryType}
Illustration style: ${cleanStyle}

Character summary:
${cleanCharacterSummary}

Character consistency instructions:
${cleanCharacterPromptCore}

Return ONLY JSON:
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
- imagePrompt must describe the same child consistently
- No page numbers inside text
- No brand names
- Do not mention copyrighted characters or logos
- Convert any branded clothing or toys into generic descriptions
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    const book = safeJsonParse(raw, {});

    const title = sanitizeBrandTerms(book.title || `The Magical Adventure of ${cleanChildName}`);
    const subtitle = sanitizeBrandTerms(book.subtitle || "A story where you are the hero");
    const pages = Array.isArray(book.pages) ? book.pages.slice(0, 10) : [];

    return res.json({
      status: "ok",
      title,
      subtitle,
      illustration_style: cleanStyle,
      pages: pages.map((p) => ({
        text: sanitizeBrandTerms(String(p.text || "").trim()),
        imagePrompt: sanitizeImagePrompt(String(p.imagePrompt || "").trim())
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
 * Cover image
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

    const safeTitle = sanitizeBrandTerms(title || "");
    const safeSubtitle = sanitizeBrandTerms(subtitle || "");
    const safeStoryType = sanitizeBrandTerms(story_type || "");
    const safeCharacterPromptCore = sanitizeBrandTerms(characterPromptCore || "");
    const safeCharacterSummary = sanitizeBrandTerms(characterSummary || "");
    const safeStyle = sanitizeBrandTerms(style || "");

    const coverPrompt = `
Create a premium children's storybook COVER illustration.

Illustration style: ${safeStyle}

LOCKED CHILD CHARACTER:
${safeCharacterPromptCore || "Keep the same main child character consistent."}

SHORT CHARACTER SUMMARY:
${safeCharacterSummary || "A warm curious child hero."}

BOOK TITLE:
${safeTitle}

BOOK SUBTITLE:
${safeSubtitle || ""}

STORY DIRECTION:
${safeStoryType || "A magical storybook adventure."}

Rules:
- create ONE beautiful single cover illustration
- show the child as the hero
- magical, premium, warm
- no character sheet
- no multiple poses
- no text rendered into the image
- no watermark
- no logos
- no copyrighted costume emblems
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
    return res.status(200).json({
      status: "fallback",
      coverImageBase64: null,
      message: "Cover generation was blocked, fallback will be used on client."
    });
  }
});

/**
 * Generate single page image
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

    const safeScenePrompt = sanitizeImagePrompt(prompt || "");
    const safeCharacterPromptCore = sanitizeBrandTerms(characterPromptCore || "");
    const safeStyle = sanitizeBrandTerms(style || "");

    const finalPrompt = `
Create a premium children's storybook illustration.

Illustration style: ${safeStyle}

Character consistency:
${safeCharacterPromptCore || "Keep the same main child character consistent."}

Scene:
${safeScenePrompt}

Rules:
- same child identity
- same face structure
- same hair and skin tone
- warm magical storybook aesthetic
- no text
- no watermark
- elegant composition
- no logos
- no brand names
- no copyrighted costume emblems
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
    return res.status(500).json({
      status: "error",
      message: "Image generation failed",
      details: err?.message || "unknown_error"
    });
  }
});

/**
 * Shopify payment success webhook placeholder
 */
app.post("/webhooks/shopify-paid", async (req, res) => {
  try {
    const { bookId, shopifyOrderId } = req.body;

    if (!bookId) {
      return res.status(400).json({
        status: "error",
        message: "Missing bookId"
      });
    }

    const updated = await updateBook(bookId, {
      paymentStatus: "paid",
      purchaseUnlocked: true,
      shopifyOrderId: shopifyOrderId || null
    });

    if (!updated) {
      return res.status(404).json({
        status: "error",
        message: "Book not found"
      });
    }

    return res.json({
      status: "ok",
      book: updated
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err?.message || "Webhook failed"
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
