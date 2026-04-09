import express from "express";
import cors from "cors";
import OpenAI from "openai";
import Stripe from "stripe";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());

// Stripe webhook needs RAW body
app.use("/webhooks/stripe", express.raw({ type: "*/*", limit: "25mb" }));
app.use(express.json({ limit: "25mb" }));

// Timeout middleware — prevents Railway from hanging on slow requests
app.use((req, res, next) => {
  res.setTimeout(300000, () => {
    console.warn("Request timeout:", req.path);
    if (!res.headersSent) {
      res.status(503).json({ status: "error", message: "Request timeout" });
    }
  });
  next();
});

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

// Clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    db: { schema: "public" },
    global: { headers: { "x-connection-timeout": "10" } }
  }
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Simple in-memory rate limiter for image generation
const generationQueue = new Map();
const MAX_CONCURRENT = 5;

function canGenerate(bookId) {
  const active = [...generationQueue.values()].filter(Boolean).length;
  if (active >= MAX_CONCURRENT) return false;
  generationQueue.set(bookId, true);
  return true;
}

function releaseGeneration(bookId) {
  generationQueue.delete(bookId);
}

// Utilities
function safeJsonParse(raw, fallback = {}) {
  try { return JSON.parse(raw); }
  catch { return fallback; }
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
    childName:         sanitizeBrandTerms(obj.childName || ""),
    storyIdea:         sanitizeBrandTerms(obj.storyIdea || ""),
    illustrationStyle: sanitizeBrandTerms(obj.illustrationStyle || ""),
    croppedPhoto:      obj.croppedPhoto  || "",
    originalPhoto:     obj.originalPhoto || ""
  };
}

function sanitizeImagePrompt(text = "") {
  return sanitizeBrandTerms(text)
    .replaceAll(/\blogo\b/gi,      "symbol")
    .replaceAll(/\bbrand\b/gi,     "design")
    .replaceAll(/\btrademark\b/gi, "graphic detail");
}

function buildCharacterPromptCore(characterDNA, style) {
  const hair    = characterDNA.hair    || "soft child hair";
  const skin    = characterDNA.skin    || "natural skin tone";
  const eyes    = characterDNA.eyes    || "gentle expressive eyes";
  const face    = characterDNA.face    || "soft child face";
  const vibe    = characterDNA.vibe    || "warm curious child";
  const ageLook = characterDNA.ageLook || "young child";
  const outfit  = characterDNA.outfit  || "simple timeless child outfit";

  return `Main character reference:
- ${ageLook}
- Hair: ${hair}
- Skin tone: ${skin}
- Eyes: ${eyes}
- Face: ${face}
- Outfit style: ${outfit}
- General vibe: ${vibe}

Keep this exact same child character consistent across all illustrations.
Do not change the child's identity, age appearance, hair color, skin tone, or facial structure.
Illustration style must be: ${style}.`.trim();
}

async function normalizeImageToBase64(imageItem) {
  if (!imageItem) return null;
  if (imageItem?.b64_json) return imageItem.b64_json;
  if (imageItem?.url) {
    const r   = await fetch(imageItem.url);
    const arr = await r.arrayBuffer();
    return Buffer.from(arr).toString("base64");
  }
  return null;
}

// DB helpers
function dbRowToBook(row) {
  if (!row) return null;
  return {
    bookId:            row.book_id,
    childName:         row.child_name         || "",
    childAge:          row.child_age          || "",
    childGender:       row.child_gender       || "",
    storyIdea:         row.story_idea         || "",
    illustrationStyle: row.illustration_style || "",
    croppedPhoto:      row.cropped_photo      || "",
    originalPhoto:     row.original_photo     || "",
    characterReference: row.character_reference || null,
    generatedBook:     row.generated_book     || null,
    coverImage:        row.cover_image        || null,
    previewImages:     row.preview_images     || [],
    fullImages:        row.full_images        || [],
    selectedFormat:    "digital",
    selectedPrice:     39,
    paymentStatus:     row.payment_status     || "pending",
    purchaseUnlocked:  row.purchase_unlocked  === true,
    stripeSessionId:   row.stripe_session_id  || null,
    createdAt:         row.created_at         || null,
    updatedAt:         row.updated_at         || null
  };
}

function patchToDbFields(patch = {}) {
  const dbPatch = {};
  if ("childName"          in patch) dbPatch.child_name          = patch.childName;
  if ("childAge"           in patch) dbPatch.child_age           = patch.childAge;
  if ("childGender"        in patch) dbPatch.child_gender        = patch.childGender;
  if ("storyIdea"          in patch) dbPatch.story_idea          = patch.storyIdea;
  if ("illustrationStyle"  in patch) dbPatch.illustration_style  = patch.illustrationStyle;
  if ("croppedPhoto"       in patch) dbPatch.cropped_photo       = patch.croppedPhoto;
  if ("originalPhoto"      in patch) dbPatch.original_photo      = patch.originalPhoto;
  if ("characterReference" in patch) dbPatch.character_reference = patch.characterReference;
  if ("generatedBook"      in patch) dbPatch.generated_book      = patch.generatedBook;
  if ("coverImage"         in patch) dbPatch.cover_image         = patch.coverImage;
  if ("previewImages"      in patch) dbPatch.preview_images      = patch.previewImages;
  if ("fullImages"         in patch) dbPatch.full_images         = patch.fullImages;
  if ("paymentStatus"      in patch) dbPatch.payment_status      = patch.paymentStatus;
  if ("purchaseUnlocked"   in patch) dbPatch.purchase_unlocked   = patch.purchaseUnlocked;
  if ("stripeSessionId"    in patch) dbPatch.stripe_session_id   = patch.stripeSessionId;
  dbPatch.updated_at = new Date().toISOString();
  return dbPatch;
}

async function insertBook(book) {
  const { data, error } = await supabase
    .from("books")
    .insert({
      book_id:            book.bookId,
      child_name:         book.childName,
      child_age:          book.childAge,
      child_gender:       book.childGender,
      story_idea:         book.storyIdea,
      illustration_style: book.illustrationStyle,
      cropped_photo:      book.croppedPhoto,
      original_photo:     book.originalPhoto,
      character_reference: null,
      generated_book:     null,
      cover_image:        null,
      preview_images:     [],
      full_images:        [],
      selected_format:    "digital",
      selected_price:     39,
      payment_status:     "pending",
      purchase_unlocked:  false,
      stripe_session_id:  null
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

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/api/books/:bookId", async (req, res) => {
  try {
    const book = await getBook(req.params.bookId);
    if (!book) return res.status(404).json({ status: "error", message: "Book not found" });
    return res.json({ status: "ok", book });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err?.message || "Failed to fetch book" });
  }
});

app.post("/api/books/create", async (req, res) => {
  try {
    const cleanInput = sanitizeStoryPayload(req.body || {});
    const rawInput   = req.body || {};
    const bookId     = crypto.randomUUID();

    const book = {
      bookId,
      childName:         cleanInput.childName        || "",
      childAge:          rawInput.childAge           || "",
      childGender:       rawInput.childGender        || "",
      storyIdea:         cleanInput.storyIdea        || "",
      illustrationStyle: cleanInput.illustrationStyle || "Soft Storybook",
      croppedPhoto:      cleanInput.croppedPhoto     || "",
      originalPhoto:     cleanInput.originalPhoto    || ""
    };

    await insertBook(book);
    return res.json({ status: "ok", bookId });
  } catch (err) {
    console.error("create book error:", err);
    return res.status(500).json({ status: "error", message: err?.message || "Failed to create book" });
  }
});

app.patch("/api/books/:bookId", async (req, res) => {
  try {
    const updated = await updateBook(req.params.bookId, req.body || {});
    if (!updated) return res.status(404).json({ status: "error", message: "Book not found" });
    return res.json({ status: "ok", book: updated });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err?.message || "Failed to update book" });
  }
});

// Stripe Checkout — digital only, always $39
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const { bookId } = req.body;

    if (!bookId) return res.status(400).json({ status: "error", message: "Missing bookId" });

    const book = await getBook(bookId);
    if (!book) return res.status(404).json({ status: "error", message: "Book not found" });

    const appUrl     = process.env.APP_URL || "http://localhost:8080";
    const productName = "Lifebook — Digital Storybook (" + book.childName + ")";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency:     "usd",
          product_data: {
            name:        productName,
            description: "Personalized storybook: \"" + (book.generatedBook?.title || "Your Magical Adventure") + "\""
          },
          unit_amount: 3900
        },
        quantity: 1
      }],
      mode: "payment",
      metadata: { bookId, format: "digital" },
      success_url: appUrl + "/success.html?bookId=" + bookId + "&session_id={CHECKOUT_SESSION_ID}",
      cancel_url:  appUrl + "/checkout.html?bookId=" + bookId
    });

    await updateBook(bookId, { stripeSessionId: session.id });
    return res.json({ status: "ok", url: session.url });
  } catch (err) {
    console.error("Stripe session error:", err);
    return res.status(500).json({ status: "error", message: err?.message || "Failed to create checkout session" });
  }
});

// Stripe Webhook
app.post("/webhooks/stripe", async (req, res) => {
  const sig           = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature failed:", err.message);
    return res.status(400).send("Webhook Error: " + err.message);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const bookId  = session.metadata?.bookId;
    if (!bookId) return res.status(200).send("ok");

    try {
      await updateBook(bookId, { paymentStatus: "paid", purchaseUnlocked: true, stripeSessionId: session.id });
      console.log("Book unlocked:", bookId);
    } catch (err) {
      console.error("Failed to unlock book:", err.message);
      return res.status(500).send("DB update failed");
    }
  }

  return res.status(200).send("ok");
});

// Manual unlock (dev/admin)
app.post("/api/books/:bookId/unlock", async (req, res) => {
  try {
    const updated = await updateBook(req.params.bookId, { paymentStatus: "paid", purchaseUnlocked: true });
    if (!updated) return res.status(404).json({ status: "error", message: "Book not found" });
    return res.json({ status: "ok", book: updated });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err?.message || "Failed to unlock book" });
  }
});

// Batch generate page images — with concurrency protection
app.post("/api/books/:bookId/generate-images", async (req, res) => {
  const bookId = req.params.bookId;

  if (!canGenerate(bookId)) {
    return res.status(429).json({ status: "error", message: "Server busy, please retry in a moment" });
  }

  try {
    const book = await getBook(bookId);
    if (!book) {
      releaseGeneration(bookId);
      return res.status(404).json({ status: "error", message: "Book not found" });
    }

    const pages = book.generatedBook?.pages || [];
    if (pages.length === 0) {
      releaseGeneration(bookId);
      return res.status(400).json({ status: "error", message: "No pages to generate" });
    }

    const characterReference = book.characterReference || {};
    const style = book.illustrationStyle || "Soft Storybook";

    const existingImages = book.fullImages || [];
    const fullImages = [...existingImages];

    while (fullImages.length < pages.length) fullImages.push(null);

    const toGenerate = pages.map((_, i) => i).filter(i => !fullImages[i]);

    if (toGenerate.length === 0) {
      releaseGeneration(bookId);
      return res.json({ status: "ok", generated: 0, total: pages.length, message: "All images already exist" });
    }

    // Generate 2 at a time (reduced from 3 to be gentler on OpenAI rate limits)
    const BATCH_SIZE = 2;

    for (let batchStart = 0; batchStart < toGenerate.length; batchStart += BATCH_SIZE) {
      const batch = toGenerate.slice(batchStart, batchStart + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (pageIndex) => {
          const page = pages[pageIndex];

          const finalPrompt = "Create a premium children's storybook illustration.\n\n" +
            "Illustration style: " + sanitizeBrandTerms(style) + "\n\n" +
            "Character consistency:\n" + sanitizeBrandTerms(characterReference.characterPromptCore || "Keep the same main child character consistent.") + "\n\n" +
            "Scene:\n" + sanitizeImagePrompt(page.imagePrompt || "") + "\n\n" +
            "Rules:\n- same child identity\n- same face structure\n- same hair and skin tone\n- warm magical storybook aesthetic\n- no text\n- no watermark\n- elegant composition\n- no logos\n- no brand names";

          const imgResp = await openai.images.generate({
            model:  "gpt-image-1",
            prompt: finalPrompt,
            size:   "1024x1024"
          });

          const base64 = await normalizeImageToBase64(imgResp?.data?.[0]);
          return { pageIndex, base64 };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value.base64) {
          fullImages[result.value.pageIndex] = "data:image/png;base64," + result.value.base64;
        }
      }

      await updateBook(bookId, { fullImages });
    }

    releaseGeneration(bookId);
    const successCount = fullImages.filter(Boolean).length;
    return res.json({ status: "ok", generated: toGenerate.length, succeeded: successCount, total: pages.length });

  } catch (err) {
    releaseGeneration(bookId);
    console.error("Batch image generation failed:", err);
    return res.status(500).json({ status: "error", message: err?.message || "Image generation failed" });
  }
});

// Image generation progress
app.get("/api/books/:bookId/image-status", async (req, res) => {
  try {
    const book = await getBook(req.params.bookId);
    if (!book) return res.status(404).json({ status: "error", message: "Book not found" });

    const totalPages = book.generatedBook?.pages?.length || 0;
    const fullImages = book.fullImages || [];
    const readyCount = fullImages.filter(Boolean).length;

    return res.json({ status: "ok", total: totalPages, ready: readyCount, done: readyCount >= totalPages });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err?.message || "Failed" });
  }
});

// Character reference
app.post("/generate-character-reference", async (req, res) => {
  try {
    const { child_photo, illustration_style } = req.body;
    if (!child_photo) return res.status(400).json({ status: "error", message: "Missing child_photo" });

    const style     = illustration_style || "Soft Storybook";
    const safeStyle = sanitizeBrandTerms(style);

    const dnaCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze the uploaded child photo and return ONLY JSON.\n\nReturn:\n{\n  \"hair\": \"string\",\n  \"skin\": \"string\",\n  \"eyes\": \"string\",\n  \"face\": \"string\",\n  \"ageLook\": \"string\",\n  \"outfit\": \"string\",\n  \"vibe\": \"string\",\n  \"summary\": \"string\"\n}\n\nRules:\n- Focus only on the child\n- Ignore any brand names, logos, or copyrighted characters\n- If clothing includes a recognizable character, describe it generically"
          },
          { type: "image_url", image_url: { url: child_photo } }
        ]
      }],
      temperature: 0.2
    });

    const dnaRaw = dnaCompletion.choices?.[0]?.message?.content || "{}";
    const characterDNA = safeJsonParse(dnaRaw, {
      hair: "soft brown child hair", skin: "natural warm skin tone",
      eyes: "bright child eyes", face: "soft rounded child face",
      ageLook: "young child", outfit: "simple timeless child outfit",
      vibe: "warm curious child", summary: "A warm curious child hero for a magical storybook."
    });

    const promptCore = buildCharacterPromptCore(characterDNA, safeStyle);

    const characterSheetPrompt = "Create a premium children's storybook character sheet.\n\nStyle: " + safeStyle + "\n\n" +
      sanitizeBrandTerms(promptCore) + "\n\n" +
      "Create ONE clean composition showing the same child character in:\n- front view\n- slight side view\n- full body storybook pose\n\n" +
      "Background: clean soft storybook background, minimal, no text, no watermark, no logos";

    const imageResp = await openai.images.generate({
      model:  "gpt-image-1",
      prompt: characterSheetPrompt,
      size:   "1024x1024"
    });

    const characterSheetBase64 = await normalizeImageToBase64(imageResp?.data?.[0]);

    return res.json({
      status: "ok",
      characterDNA,
      characterPromptCore: promptCore,
      characterSummary:    characterDNA.summary || "",
      characterSheetBase64
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: "Character reference generation failed", details: err?.message || "unknown_error" });
  }
});

// Create book story text
app.post("/create-book", async (req, res) => {
  try {
    const { child_name, age, gender, story_type, illustration_style, character_reference } = req.body;

    if (!child_name || !age || !story_type) {
      return res.status(400).json({ status: "error", message: "Missing required fields: child_name, age, story_type" });
    }

    const style = illustration_style || "Soft Storybook";
    const cleanChildName  = sanitizeBrandTerms(child_name || "");
    const cleanStoryType  = sanitizeBrandTerms(story_type || "");
    const cleanStyle      = sanitizeBrandTerms(style || "");
    const cleanSummary    = sanitizeBrandTerms(character_reference?.characterSummary || "A warm curious child hero");
    const cleanPromptCore = sanitizeBrandTerms(character_reference?.characterPromptCore || "");

    const prompt = "You are a premium personalized children's book writer.\n\n" +
      "Child name: " + cleanChildName + "\nChild age: " + age + "\nChild gender: " + (gender || "not specified") + "\n" +
      "Story direction: " + cleanStoryType + "\nIllustration style: " + cleanStyle + "\n\n" +
      "Character summary:\n" + cleanSummary + "\n\nCharacter consistency instructions:\n" + cleanPromptCore + "\n\n" +
      "Return ONLY JSON:\n{\n  \"title\": \"string\",\n  \"subtitle\": \"string\",\n  \"pages\": [{\"text\": \"string\", \"imagePrompt\": \"string\"}]\n}\n\n" +
      "Rules:\n- Exactly 10 story pages\n- Each page text must be 35-70 words\n- The child must clearly be the hero\n- imagePrompt must describe the same child consistently\n- No page numbers inside text\n- No brand names or copyrighted characters";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8
    });

    const raw  = completion.choices?.[0]?.message?.content || "{}";
    const book = safeJsonParse(raw, {});

    const title    = sanitizeBrandTerms(book.title    || "The Magical Adventure of " + cleanChildName);
    const subtitle = sanitizeBrandTerms(book.subtitle || "A story where you are the hero");
    const pages    = Array.isArray(book.pages) ? book.pages.slice(0, 10) : [];

    return res.json({
      status: "ok",
      title,
      subtitle,
      illustration_style: cleanStyle,
      pages: pages.map(p => ({
        text:        sanitizeBrandTerms(String(p.text || "").trim()),
        imagePrompt: sanitizeImagePrompt(String(p.imagePrompt || "").trim())
      }))
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: "Book generation failed", details: err?.message || "unknown_error" });
  }
});

// Generate cover image
app.post("/generate-cover-image", async (req, res) => {
  try {
    const { title, subtitle, story_type, illustration_style, characterPromptCore, characterSummary } = req.body;
    if (!title) return res.status(400).json({ status: "error", message: "Missing required field: title" });

    const style = illustration_style || "Soft Storybook";

    const coverPrompt = "Create a premium children's storybook COVER illustration.\n\n" +
      "Illustration style: " + sanitizeBrandTerms(style) + "\n\n" +
      "LOCKED CHILD CHARACTER:\n" + sanitizeBrandTerms(characterPromptCore || "Keep the same main child character consistent.") + "\n\n" +
      "CHARACTER SUMMARY:\n" + sanitizeBrandTerms(characterSummary || "A warm curious child hero.") + "\n\n" +
      "BOOK TITLE: " + sanitizeBrandTerms(title) + "\n" +
      "BOOK SUBTITLE: " + sanitizeBrandTerms(subtitle || "") + "\n" +
      "STORY DIRECTION: " + sanitizeBrandTerms(story_type || "A magical storybook adventure.") + "\n\n" +
      "Rules:\n- ONE beautiful single cover illustration\n- show the child as the hero\n- magical, premium, warm\n- no character sheet\n- no multiple poses\n- no text rendered into image\n- no watermark\n- no logos";

    const imgResp = await openai.images.generate({
      model:  "gpt-image-1",
      prompt: coverPrompt,
      size:   "1024x1024"
    });

    const coverImageBase64 = await normalizeImageToBase64(imgResp?.data?.[0]);
    return res.json({ status: "ok", coverImageBase64 });
  } catch (err) {
    return res.status(200).json({ status: "fallback", coverImageBase64: null, message: "Cover generation blocked, fallback used." });
  }
});

// Generate single page image
app.post("/generate-image", async (req, res) => {
  try {
    const { prompt, illustration_style, characterPromptCore } = req.body;
    if (!prompt) return res.status(400).json({ status: "error", message: "Missing required field: prompt" });

    const style = illustration_style || "Soft Storybook";

    const finalPrompt = "Create a premium children's storybook illustration.\n\n" +
      "Illustration style: " + sanitizeBrandTerms(style) + "\n\n" +
      "Character consistency:\n" + sanitizeBrandTerms(characterPromptCore || "Keep the same main child character consistent.") + "\n\n" +
      "Scene:\n" + sanitizeImagePrompt(prompt) + "\n\n" +
      "Rules:\n- same child identity\n- same face structure\n- same hair and skin tone\n- warm magical storybook aesthetic\n- no text\n- no watermark\n- no logos";

    const imgResp = await openai.images.generate({
      model:  "gpt-image-1",
      prompt: finalPrompt,
      size:   "1024x1024"
    });

    const imageBase64 = await normalizeImageToBase64(imgResp?.data?.[0]);
    return res.json({ status: "ok", imageBase64 });
  } catch (err) {
    return res.status(500).json({ status: "error", message: "Image generation failed", details: err?.message || "unknown_error" });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
