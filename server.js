import express from "express";
import cors from "cors";
import OpenAI from "openai";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());

// Shopify webhook needs raw body for HMAC verification
app.use("/webhooks/shopify", express.raw({ type: "*/*", limit: "25mb" }));
app.use(express.json({ limit: "25mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

function dbRowToBook(row) {
  if (!row) return null;

  return {
    bookId: row.book_id,
    childName: row.child_name || "",
    childAge: row.child_age || "",
    childGender: row.child_gender || "",
    storyIdea: row.story_idea || "",
    illustrationStyle: row.illustration_style || "",
    croppedPhoto: row.cropped_photo || "",
    originalPhoto: row.original_photo || "",
    characterReference: row.character_reference || null,
    generatedBook: row.generated_book || null,
    coverImage: row.cover_image || null,
    previewImages: row.preview_images || [],
    fullImages: row.full_images || [],
    selectedFormat: row.selected_format || "digital",
    selectedPrice: row.selected_price || 39,
    paymentStatus: row.payment_status || "pending",
    purchaseUnlocked: row.purchase_unlocked === true,
    shopifyOrderId: row.shopify_order_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function patchToDbFields(patch = {}) {
  const dbPatch = {};

  if ("childName" in patch) dbPatch.child_name = patch.childName;
  if ("childAge" in patch) dbPatch.child_age = patch.childAge;
  if ("childGender" in patch) dbPatch.child_gender = patch.childGender;
  if ("storyIdea" in patch) dbPatch.story_idea = patch.storyIdea;
  if ("illustrationStyle" in patch) dbPatch.illustration_style = patch.illustrationStyle;
  if ("croppedPhoto" in patch) dbPatch.cropped_photo = patch.croppedPhoto;
  if ("originalPhoto" in patch) dbPatch.original_photo = patch.originalPhoto;
  if ("characterReference" in patch) dbPatch.character_reference = patch.characterReference;
  if ("generatedBook" in patch) dbPatch.generated_book = patch.generatedBook;
  if ("coverImage" in patch) dbPatch.cover_image = patch.coverImage;
  if ("previewImages" in patch) dbPatch.preview_images = patch.previewImages;
  if ("fullImages" in patch) dbPatch.full_images = patch.fullImages;
  if ("selectedFormat" in patch) dbPatch.selected_format = patch.selectedFormat;
  if ("selectedPrice" in patch) dbPatch.selected_price = patch.selectedPrice;
  if ("paymentStatus" in patch) dbPatch.payment_status = patch.paymentStatus;
  if ("purchaseUnlocked" in patch) dbPatch.purchase_unlocked = patch.purchaseUnlocked;
  if ("shopifyOrderId" in patch) dbPatch.shopify_order_id = patch.shopifyOrderId;

  dbPatch.updated_at = new Date().toISOString();

  return dbPatch;
}

async function insertBook(book) {
  const { data, error } = await supabase
    .from("books")
    .insert({
      book_id: book.bookId,
      child_name: book.childName,
      child_age: book.childAge,
      child_gender: book.childGender,
      story_idea: book.storyIdea,
      illustration_style: book.illustrationStyle,
      cropped_photo: book.croppedPhoto,
      original_photo: book.originalPhoto,
      character_reference: book.characterReference,
      generated_book: book.generatedBook,
      cover_image: book.coverImage,
      preview_images: book.previewImages,
      full_images: book.fullImages,
      selected_format: book.selectedFormat,
      selected_price: book.selectedPrice,
      payment_status: book.paymentStatus,
      purchase_unlocked: book.purchaseUnlocked,
      shopify_order_id: book.shopifyOrderId
    })
    .select()
    .single();

  if (error) throw error;
  return dbRowToBook(data);
}

async function getBook(bookId) {
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .eq("book_id", bookId)
    .maybeSingle();

  if (error) throw error;
  return dbRowToBook(data);
}

async function updateBook(bookId, patch) {
  const dbPatch = patchToDbFields(patch);

  const { data, error } = await supabase
    .from("books")
    .update(dbPatch)
    .eq("book_id", bookId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return dbRowToBook(data);
}

function verifyShopifyWebhook(rawBody, hmacHeader) {
  const secret = process.env.SHOPIFY_API_SECRET || "";
  if (!secret || !hmacHeader) return false;

  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(hmacHeader)
    );
  } catch {
    return false;
  }
}

function extractBookIdFromOrder(orderPayload) {
  const lineItems = orderPayload?.line_items || [];

  for (const item of lineItems) {
    const properties = item?.properties || [];
    for (const prop of properties) {
      if (prop?.name === "_bookId" && prop?.value) {
        return String(prop.value);
      }
    }
  }

  return null;
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/api/books/:bookId", async (req, res) => {
  try {
    const book = await getBook(req.params.bookId);

    if (!book) {
      return res.status(404).json({
        status: "error",
        message: "Book not found"
      });
    }
    
app.get("/api/order/:orderId", async (req, res) => {
  try {
    const orderId = String(req.params.orderId);

    const { data, error } = await supabase
      .from("books")
      .select("book_id, payment_status, purchase_unlocked, shopify_order_id")
      .eq("shopify_order_id", orderId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        status: "error",
        message: "Book not found for this order"
      });
    }

    return res.json({
      status: "ok",
      bookId: data.book_id,
      paymentStatus: data.payment_status,
      purchaseUnlocked: data.purchase_unlocked
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err?.message || "Failed to load order mapping"
    });
  }
});
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
      shopifyOrderId: null
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
 * Shopify webhook
 * Register this endpoint in Shopify as:
 * https://your-domain.com/webhooks/shopify/orders-paid
 */
app.post("/webhooks/shopify/orders-paid", async (req, res) => {
  try {
    const rawBody = req.body instanceof Buffer ? req.body.toString("utf8") : "";
    const hmacHeader = req.get("X-Shopify-Hmac-Sha256");

    const valid = verifyShopifyWebhook(rawBody, hmacHeader);
    if (!valid) {
      return res.status(401).send("Invalid webhook signature");
    }

    const payload = safeJsonParse(rawBody, {});
    const bookId = extractBookIdFromOrder(payload);
    const shopifyOrderId = payload?.id ? String(payload.id) : null;

    if (!bookId) {
      return res.status(200).send("No _bookId found");
    }

    await updateBook(bookId, {
      paymentStatus: "paid",
      purchaseUnlocked: true,
      shopifyOrderId
    });

    return res.status(200).send("ok");
  } catch (err) {
    return res.status(500).send(err?.message || "Webhook failed");
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
