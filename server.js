import express from "express";
import cors from "cors";
import OpenAI from "openai";
import Stripe from "stripe";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const app = express();
app.use(cors());

// ─── Stripe webhook needs the RAW body for signature verification ─────────────
app.use("/webhooks/stripe", express.raw({ type: "*/*", limit: "25mb" }));
app.use(express.json({ limit: "25mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

// ─── Clients ──────────────────────────────────────────────────────────────────
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Utilities ────────────────────────────────────────────────────────────────
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
    childName:          sanitizeBrandTerms(obj.childName || ""),
    storyIdea:          sanitizeBrandTerms(obj.storyIdea || ""),
    illustrationStyle:  sanitizeBrandTerms(obj.illustrationStyle || ""),
    croppedPhoto:       obj.croppedPhoto  || "",
    originalPhoto:      obj.originalPhoto || ""
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
  if (imageItem?.b64_json) return imageItem.b64_json;
  if (imageItem?.url) {
    const r   = await fetch(imageItem.url);
    const arr = await r.arrayBuffer();
    return Buffer.from(arr).toString("base64");
  }
  return null;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
function dbRowToBook(row) {
  if (!row) return null;
  return {
    bookId:           row.book_id,
    childName:        row.child_name        || "",
    childAge:         row.child_age         || "",
    childGender:      row.child_gender      || "",
    storyIdea:        row.story_idea        || "",
    illustrationStyle:row.illustration_style|| "",
    croppedPhoto:     row.cropped_photo     || "",
    originalPhoto:    row.original_photo    || "",
    customerEmail:    row.customer_email    || "",
    characterReference: row.character_reference || null,
    generatedBook:    row.generated_book    || null,
    coverImage:       row.cover_image       || null,
    previewImages:    row.preview_images    || [],
    fullImages:       row.full_images       || [],
    selectedFormat:   row.selected_format   || "digital",
    selectedPrice:    row.selected_price    || 39,
    paymentStatus:    row.payment_status    || "pending",
    purchaseUnlocked: row.purchase_unlocked === true,
    stripeSessionId:  row.stripe_session_id || null,
    createdAt:        row.created_at        || null,
    updatedAt:        row.updated_at        || null
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
  if ("customerEmail"      in patch) dbPatch.customer_email      = patch.customerEmail;
  if ("characterReference" in patch) dbPatch.character_reference = patch.characterReference;
  if ("generatedBook"      in patch) dbPatch.generated_book      = patch.generatedBook;
  if ("coverImage"         in patch) dbPatch.cover_image         = patch.coverImage;
  if ("previewImages"      in patch) dbPatch.preview_images      = patch.previewImages;
  if ("fullImages"         in patch) dbPatch.full_images         = patch.fullImages;
  if ("selectedFormat"     in patch) dbPatch.selected_format     = patch.selectedFormat;
  if ("selectedPrice"      in patch) dbPatch.selected_price      = patch.selectedPrice;
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
      customer_email:     book.customerEmail || "",
      character_reference:book.characterReference,
      generated_book:     book.generatedBook,
      cover_image:        book.coverImage,
      preview_images:     book.previewImages,
      full_images:        book.fullImages,
      selected_format:    book.selectedFormat,
      selected_price:     book.selectedPrice,
      payment_status:     book.paymentStatus,
      purchase_unlocked:  book.purchaseUnlocked,
      stripe_session_id:  book.stripeSessionId
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

// ─── Routes ───────────────────────────────────────────────────────────────────
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

// ─── Email helper ─────────────────────────────────────────────────────────────
async function sendBookReadyEmail(book) {
  if (!book.customerEmail) return;

  const appUrl    = process.env.APP_URL || "http://localhost:8080";
  const bookTitle = book.generatedBook?.title || "Your Magical Storybook";
  const childName = book.childName || "your child";
  const downloadUrl = `${appUrl}/delivery.html?bookId=${book.bookId}`;

  try {
    await resend.emails.send({
      from: "Lifebook <books@lifebook.ai>",
      to:   book.customerEmail,
      subject: `Your book is ready! "${bookTitle}"`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#fdf6ec;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf6ec;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a1008,#5c3d1e);padding:36px 40px;text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">📖</div>
            <div style="font-family:Georgia,serif;font-size:28px;color:#f5d98a;letter-spacing:0.5px;">lifebook</div>
            <div style="font-size:13px;color:#c4a87a;margin-top:4px;letter-spacing:1px;">AI CHILDREN'S STORYBOOKS</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="font-family:Georgia,serif;font-size:26px;color:#3a2810;margin:0 0 16px;">
              ✨ ${childName}'s book is ready!
            </p>
            <p style="font-size:16px;color:#7a6048;line-height:1.7;margin:0 0 24px;">
              Your personalized storybook <strong style="color:#3a2810;">"${bookTitle}"</strong>
              has been created and is waiting for you.
            </p>

            <!-- CTA Button -->
            <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
              <tr>
                <td style="background:linear-gradient(135deg,#e8b84b,#c8922a);border-radius:50px;padding:16px 36px;">
                  <a href="${downloadUrl}"
                     style="font-family:Arial,sans-serif;font-size:17px;font-weight:700;color:#ffffff;text-decoration:none;display:block;">
                    Download My Book &rarr;
                  </a>
                </td>
              </tr>
            </table>

            <p style="font-size:14px;color:#a08060;line-height:1.6;margin:0 0 8px;">
              Or copy this link to your browser:
            </p>
            <p style="font-size:13px;color:#c8922a;word-break:break-all;margin:0 0 32px;">
              ${downloadUrl}
            </p>

            <hr style="border:none;border-top:1px solid #f0e4d0;margin:0 0 24px;" />

            <p style="font-size:13px;color:#b09070;line-height:1.6;margin:0;">
              Questions? Reply to this email and we'll get back to you.<br/>
              Thank you for using Lifebook 💛
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#fdf6ec;padding:20px 40px;text-align:center;">
            <p style="font-size:12px;color:#c4a87a;margin:0;">
              © 2026 Lifebook · AI Children's Storybooks
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
      `.trim()
    });
    console.log("Book ready email sent to:", book.customerEmail);
  } catch(err) {
    console.error("Failed to send book ready email:", err.message);
    // Don't throw — email failure should not break the book generation
  }
}

app.post("/api/books/create", async (req, res) => {
  try {
    const cleanInput = sanitizeStoryPayload(req.body || {});
    const rawInput   = req.body || {};
    const bookId     = crypto.randomUUID();

    const book = {
      bookId,
      childName:         cleanInput.childName        || "",
      childAge:          rawInput.childAge            || "",
      childGender:       rawInput.childGender         || "",
      storyIdea:         cleanInput.storyIdea         || "",
      illustrationStyle: cleanInput.illustrationStyle || "Soft Storybook",
      croppedPhoto:      cleanInput.croppedPhoto      || "",
      originalPhoto:     cleanInput.originalPhoto     || "",
      customerEmail:     rawInput.customerEmail       || "",
      characterReference:null,
      generatedBook:     null,
      coverImage:        null,
      previewImages:     [],
      fullImages:        [],
      selectedFormat:    "digital",
      selectedPrice:     39,
      paymentStatus:     "pending",
      purchaseUnlocked:  false,
      stripeSessionId:   null
    };

    await insertBook(book);
    return res.json({ status: "ok", bookId });
  } catch (err) {
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

// ─── Stripe: Create Checkout Session ─────────────────────────────────────────
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const { bookId, format } = req.body;

    if (!bookId) {
      return res.status(400).json({ status: "error", message: "Missing bookId" });
    }

    const book = await getBook(bookId);
    if (!book) {
      return res.status(404).json({ status: "error", message: "Book not found" });
    }

    const isDigital    = (format || book.selectedFormat) !== "printed";
    const priceInCents = isDigital ? 3900 : 4900; // $39 / $49
    const productName  = isDigital
      ? `Lifebook — Digital Edition (${book.childName})`
      : `Lifebook — Printed Book (${book.childName})`;

    const appUrl = process.env.APP_URL || "http://localhost:8080";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: productName,
              description: `Personalized storybook: "${book.generatedBook?.title || "Your Magical Adventure"}"`,
              images: book.coverImage ? [] : [] // Stripe requires hosted URLs, not base64
            },
            unit_amount: priceInCents
          },
          quantity: 1
        }
      ],
      mode: "payment",
      metadata: {
        bookId,
        format: isDigital ? "digital" : "printed"
      },
      success_url: `${appUrl}/success.html?bookId=${bookId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/checkout.html?bookId=${bookId}`
    });

    // Save session ID to book so we can link it on webhook
    await updateBook(bookId, { stripeSessionId: session.id });

    return res.json({ status: "ok", url: session.url });
  } catch (err) {
    console.error("Stripe session error:", err);
    return res.status(500).json({ status: "error", message: err?.message || "Failed to create checkout session" });
  }
});

// ─── Stripe Webhook ───────────────────────────────────────────────────────────
app.post("/webhooks/stripe", async (req, res) => {
  const sig           = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const bookId  = session.metadata?.bookId;

    if (!bookId) {
      console.warn("Stripe webhook: no bookId in metadata");
      return res.status(200).send("ok");
    }

    try {
      await updateBook(bookId, {
        paymentStatus:    "paid",
        purchaseUnlocked: true,
        stripeSessionId:  session.id
      });
      console.log(`Book ${bookId} unlocked via Stripe`);
    } catch (err) {
      console.error("Failed to unlock book:", err.message);
      return res.status(500).send("DB update failed");
    }
  }

  return res.status(200).send("ok");
});

// ─── Unlock endpoint (manual / dev) ──────────────────────────────────────────
app.post("/api/books/:bookId/unlock", async (req, res) => {
  try {
    const updated = await updateBook(req.params.bookId, {
      paymentStatus:    "paid",
      purchaseUnlocked: true
    });
    if (!updated) return res.status(404).json({ status: "error", message: "Book not found" });
    return res.json({ status: "ok", book: updated });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err?.message || "Failed to unlock book" });
  }
});

// ─── Generate Full Book (story + cover + images) — fires in background ────────
app.post("/api/books/:bookId/generate-full", async (req, res) => {
  const bookId = req.params.bookId;

  // Respond immediately so crop.js can redirect to preview
  res.json({ status: "ok", message: "Generation started in background" });

  // Run everything async — errors are caught and saved to DB
  (async () => {
    try {
      const book = await getBook(bookId);
      if (!book) { console.error("generate-full: book not found", bookId); return; }

      const childName         = book.childName         || "The Child";
      const childAge          = book.childAge          || "5";
      const childGender       = book.childGender       || "not specified";
      const storyIdea         = book.storyIdea         || "a magical adventure";
      const illustrationStyle = book.illustrationStyle || "Soft Storybook";
      const croppedPhoto      = book.croppedPhoto      || book.originalPhoto || "";
      const safeStyle         = sanitizeBrandTerms(illustrationStyle);

      // ── STEP 1: Character reference (photo → DNA + prompt core) ──────────────
      let characterReference = book.characterReference || null;

      if (!characterReference && croppedPhoto) {
        try {
          const dnaCompletion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [{
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analyze the uploaded child photo and return ONLY JSON.\nReturn:\n{\n  "hair": "string",\n  "skin": "string",\n  "eyes": "string",\n  "face": "string",\n  "ageLook": "string",\n  "outfit": "string",\n  "vibe": "string",\n  "summary": "string"\n}\nRules:\n- Focus only on the child\n- Ignore any brand names, logos, copyrighted characters, or toy franchises\n- If clothing includes a recognizable character or logo, describe it generically`
                },
                { type: "image_url", image_url: { url: croppedPhoto } }
              ]
            }],
            temperature: 0.2
          });

          const characterDNA = safeJsonParse(dnaCompletion.choices?.[0]?.message?.content || "{}", {
            hair: "soft child hair", skin: "warm natural skin tone",
            eyes: "bright child eyes", face: "soft rounded child face",
            ageLook: "young child", outfit: "simple timeless child outfit",
            vibe: "warm curious child", summary: "A warm curious child hero for a magical storybook."
          });

          const promptCore = buildCharacterPromptCore(characterDNA, safeStyle);
          characterReference = {
            characterDNA,
            characterPromptCore: promptCore,
            characterSummary: characterDNA.summary || "A warm curious child hero."
          };
          await updateBook(bookId, { characterReference });
        } catch (err) {
          console.warn("generate-full: character reference failed, continuing without it:", err.message);
          characterReference = {
            characterDNA: {},
            characterPromptCore: `A young child aged ${childAge}, warm storybook style.`,
            characterSummary: `A ${childAge}-year-old child hero.`
          };
          await updateBook(bookId, { characterReference });
        }
      }

      const promptCore       = characterReference?.characterPromptCore || `A young child aged ${childAge}.`;
      const characterSummary = characterReference?.characterSummary    || `A ${childAge}-year-old child hero.`;

      // ── STEP 2: Generate story text ───────────────────────────────────────────
      if (!book.generatedBook?.pages?.length) {
        const storyPrompt = `You are a premium personalized children's book writer.\n\nChild name: ${sanitizeBrandTerms(childName)}\nChild age: ${childAge}\nChild gender: ${childGender}\nStory direction: ${sanitizeBrandTerms(storyIdea)}\nIllustration style: ${safeStyle}\n\nCharacter summary:\n${sanitizeBrandTerms(characterSummary)}\n\nCharacter consistency instructions:\n${sanitizeBrandTerms(promptCore)}\n\nReturn ONLY JSON:\n{\n  "title": "string",\n  "subtitle": "string",\n  "pages": [\n    {\n      "text": "string",\n      "imagePrompt": "string"\n    }\n  ]\n}\n\nRules:\n- Exactly 10 story pages\n- Each page text must be 35-70 words\n- The child must clearly be the hero\n- imagePrompt must describe the same child consistently\n- No page numbers inside text\n- No brand names\n- Do not mention copyrighted characters or logos`;

        const storyCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: storyPrompt }],
          temperature: 0.8
        });

        const storyRaw  = storyCompletion.choices?.[0]?.message?.content || "{}";
        const storyData = safeJsonParse(storyRaw, {});
        const generatedBook = {
          title:    sanitizeBrandTerms(storyData.title    || `The Magical Adventure of ${childName}`),
          subtitle: sanitizeBrandTerms(storyData.subtitle || "A story where you are the hero"),
          pages:    Array.isArray(storyData.pages)
            ? storyData.pages.slice(0, 10).map(p => ({
                text:        sanitizeBrandTerms(String(p.text        || "").trim()),
                imagePrompt: sanitizeImagePrompt(String(p.imagePrompt || "").trim())
              }))
            : []
        };
        await updateBook(bookId, { generatedBook });
      }

      // Re-fetch to get latest state
      const bookAfterStory = await getBook(bookId);
      const pages          = bookAfterStory.generatedBook?.pages || [];
      const title          = bookAfterStory.generatedBook?.title    || `The Magical Adventure of ${childName}`;
      const subtitle       = bookAfterStory.generatedBook?.subtitle || "A story where you are the hero";

      // ── STEP 3: Cover image ───────────────────────────────────────────────────
      if (!bookAfterStory.coverImage) {
        try {
          const coverPrompt = `Create a premium children's storybook COVER illustration.\n\nIllustration style: ${safeStyle}\n\nLOCKED CHILD CHARACTER:\n${sanitizeBrandTerms(promptCore)}\n\nSHORT CHARACTER SUMMARY:\n${sanitizeBrandTerms(characterSummary)}\n\nBOOK TITLE:\n${sanitizeBrandTerms(title)}\n\nBOOK SUBTITLE:\n${sanitizeBrandTerms(subtitle)}\n\nSTORY DIRECTION:\n${sanitizeBrandTerms(storyIdea)}\n\nRules:\n- create ONE beautiful single cover illustration\n- show the child as the hero\n- magical, premium, warm\n- no character sheet\n- no multiple poses\n- no text rendered into the image\n- no watermark\n- no logos\n- no copyrighted costume emblems`;

          const coverResp = await openai.images.generate({
            model: "gpt-image-1",
            prompt: coverPrompt,
            size:  "1024x1024"
          });

          const coverBase64 = await normalizeImageToBase64(coverResp?.data?.[0]);
          if (coverBase64) {
            await updateBook(bookId, { coverImage: `data:image/png;base64,${coverBase64}` });
          }
        } catch (err) {
          console.warn("generate-full: cover generation failed:", err.message);
        }
      }

      // ── STEP 4: Page images (batches of 3) ───────────────────────────────────
      const bookBeforeImgs  = await getBook(bookId);
      const existingImages  = bookBeforeImgs.fullImages || [];
      const fullImages      = [...existingImages];
      while (fullImages.length < pages.length) fullImages.push(null);

      const toGenerate = [];
      for (let i = 0; i < pages.length; i++) {
        if (!fullImages[i]) toGenerate.push(i);
      }

      const BATCH_SIZE = 3;
      for (let batchStart = 0; batchStart < toGenerate.length; batchStart += BATCH_SIZE) {
        const batch = toGenerate.slice(batchStart, batchStart + BATCH_SIZE);

        const results = await Promise.allSettled(batch.map(async (pageIndex) => {
          const page = pages[pageIndex];
          const imgPrompt = `Create a premium children's storybook illustration.\n\nIllustration style: ${safeStyle}\n\nCharacter consistency:\n${sanitizeBrandTerms(promptCore)}\n\nScene:\n${sanitizeImagePrompt(page.imagePrompt || "")}\n\nRules:\n- same child identity\n- same face structure\n- same hair and skin tone\n- warm magical storybook aesthetic\n- no text\n- no watermark\n- elegant composition\n- no logos\n- no brand names\n- no copyrighted costume emblems`;

          const imgResp = await openai.images.generate({
            model: "gpt-image-1",
            prompt: imgPrompt,
            size:  "1024x1024"
          });

          const base64 = await normalizeImageToBase64(imgResp?.data?.[0]);
          return { pageIndex, base64 };
        }));

        for (const result of results) {
          if (result.status === "fulfilled" && result.value.base64) {
            fullImages[result.value.pageIndex] = `data:image/png;base64,${result.value.base64}`;
          }
        }

        await updateBook(bookId, { fullImages });
      }

      // ── STEP 5: Send book ready email ─────────────────────────────────────────
      try {
        const finalBook = await getBook(bookId);
        await sendBookReadyEmail(finalBook);
      } catch (err) {
        console.warn("generate-full: email send failed:", err.message);
      }

      console.log("generate-full: completed for bookId:", bookId);

    } catch (err) {
      console.error("generate-full: fatal error for bookId:", bookId, err.message);
    }
  })();
});

// ─── Batch generate all page images (parallel, 3 at a time) ─────────────────
app.post("/api/books/:bookId/generate-images", async (req, res) => {
  try {
    const bookId = req.params.bookId;
    const book   = await getBook(bookId);

    if (!book) {
      return res.status(404).json({ status: "error", message: "Book not found" });
    }

    const pages = book.generatedBook?.pages || [];
    if (pages.length === 0) {
      return res.status(400).json({ status: "error", message: "No pages to generate" });
    }

    const characterReference = book.characterReference || {};
    const style = book.illustrationStyle || "Soft Storybook";

    // Skip pages that already have images
    const existingImages = book.fullImages || [];
    const fullImages = [...existingImages];

    // Pad array to match pages length
    while (fullImages.length < pages.length) {
      fullImages.push(null);
    }

    // Find which pages still need generation
    const toGenerate = [];
    for (let i = 0; i < pages.length; i++) {
      if (!fullImages[i]) {
        toGenerate.push(i);
      }
    }

    if (toGenerate.length === 0) {
      return res.json({
        status: "ok",
        generated: 0,
        total: pages.length,
        message: "All images already exist"
      });
    }

    // Generate in batches of 3 for speed without hammering the API
    const BATCH_SIZE = 3;

    for (let batchStart = 0; batchStart < toGenerate.length; batchStart += BATCH_SIZE) {
      const batch = toGenerate.slice(batchStart, batchStart + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (pageIndex) => {
          const page = pages[pageIndex];

          const finalPrompt = `
Create a premium children's storybook illustration.

Illustration style: ${sanitizeBrandTerms(style)}

Character consistency:
${sanitizeBrandTerms(characterReference.characterPromptCore || "Keep the same main child character consistent.")}

Scene:
${sanitizeImagePrompt(page.imagePrompt || "")}

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
            model:  "gpt-image-1",
            prompt: finalPrompt,
            size:   "1024x1024"
          });

          const base64 = await normalizeImageToBase64(imgResp?.data?.[0]);
          return { pageIndex, base64 };
        })
      );

      // Store successful results
      for (const result of results) {
        if (result.status === "fulfilled" && result.value.base64) {
          fullImages[result.value.pageIndex] = `data:image/png;base64,${result.value.base64}`;
        }
      }

      // Save progress after each batch (so partial results are saved)
      await updateBook(bookId, { fullImages });
    }

    const successCount = fullImages.filter(Boolean).length;

    // Send "book ready" email to customer
    const finalBook = await getBook(bookId);
    await sendBookReadyEmail(finalBook);

    return res.json({
      status:    "ok",
      generated: toGenerate.length,
      succeeded: successCount,
      total:     pages.length
    });
  } catch (err) {
    console.error("Batch image generation failed:", err);
    return res.status(500).json({
      status:  "error",
      message: err?.message || "Image generation failed"
    });
  }
});

// ─── Image generation progress check ─────────────────────────────────────────
app.get("/api/books/:bookId/image-status", async (req, res) => {
  try {
    const book = await getBook(req.params.bookId);
    if (!book) return res.status(404).json({ status: "error", message: "Book not found" });

    const totalPages    = book.generatedBook?.pages?.length || 0;
    const fullImages    = book.fullImages || [];
    const readyCount    = fullImages.filter(Boolean).length;

    return res.json({
      status: "ok",
      total:  totalPages,
      ready:  readyCount,
      done:   readyCount >= totalPages
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err?.message || "Failed" });
  }
});

// ─── Character reference ──────────────────────────────────────────────────────
app.post("/generate-character-reference", async (req, res) => {
  try {
    const { child_photo, illustration_style } = req.body;

    if (!child_photo) {
      return res.status(400).json({ status: "error", message: "Missing child_photo" });
    }

    const style     = illustration_style || "Soft Storybook";
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

    const dnaRaw      = dnaCompletion.choices?.[0]?.message?.content || "{}";
    const characterDNA = safeJsonParse(dnaRaw, {
      hair:    "soft brown child hair",
      skin:    "natural warm skin tone",
      eyes:    "bright child eyes",
      face:    "soft rounded child face",
      ageLook: "young child",
      outfit:  "simple timeless child outfit",
      vibe:    "warm curious child",
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
      model:  "gpt-image-1",
      prompt: characterSheetPrompt,
      size:   "1024x1024"
    });

    const characterSheetBase64 = await normalizeImageToBase64(imageResp?.data?.[0]);

    return res.json({
      status:              "ok",
      characterDNA,
      characterPromptCore: promptCore,
      characterSummary:    characterDNA.summary || "",
      characterSheetBase64
    });
  } catch (err) {
    return res.status(500).json({
      status:  "error",
      message: "Character reference generation failed",
      details: err?.message || "unknown_error"
    });
  }
});

// ─── Create book (story text) ─────────────────────────────────────────────────
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
        status:  "error",
        message: "Missing required fields: child_name, age, story_type"
      });
    }

    const style            = illustration_style || "Soft Storybook";
    const characterSummary = character_reference?.characterSummary    || "A warm curious child hero";
    const characterPromptCore = character_reference?.characterPromptCore || "";

    const cleanStoryType         = sanitizeBrandTerms(story_type        || "");
    const cleanChildName         = sanitizeBrandTerms(child_name        || "");
    const cleanStyle             = sanitizeBrandTerms(style             || "");
    const cleanCharacterSummary  = sanitizeBrandTerms(characterSummary  || "");
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
      model:           "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages:        [{ role: "user", content: prompt }],
      temperature:     0.8
    });

    const raw  = completion.choices?.[0]?.message?.content || "{}";
    const book = safeJsonParse(raw, {});

    const title    = sanitizeBrandTerms(book.title    || `The Magical Adventure of ${cleanChildName}`);
    const subtitle = sanitizeBrandTerms(book.subtitle || "A story where you are the hero");
    const pages    = Array.isArray(book.pages) ? book.pages.slice(0, 10) : [];

    return res.json({
      status: "ok",
      title,
      subtitle,
      illustration_style: cleanStyle,
      pages: pages.map((p) => ({
        text:        sanitizeBrandTerms(String(p.text        || "").trim()),
        imagePrompt: sanitizeImagePrompt(String(p.imagePrompt || "").trim())
      }))
    });
  } catch (err) {
    return res.status(500).json({
      status:  "error",
      message: "Book generation failed",
      details: err?.message || "unknown_error"
    });
  }
});

// ─── Generate cover image ─────────────────────────────────────────────────────
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
      return res.status(400).json({ status: "error", message: "Missing required field: title" });
    }

    const style = illustration_style || "Soft Storybook";

    const coverPrompt = `
Create a premium children's storybook COVER illustration.

Illustration style: ${sanitizeBrandTerms(style)}

LOCKED CHILD CHARACTER:
${sanitizeBrandTerms(characterPromptCore || "Keep the same main child character consistent.")}

SHORT CHARACTER SUMMARY:
${sanitizeBrandTerms(characterSummary || "A warm curious child hero.")}

BOOK TITLE:
${sanitizeBrandTerms(title)}

BOOK SUBTITLE:
${sanitizeBrandTerms(subtitle || "")}

STORY DIRECTION:
${sanitizeBrandTerms(story_type || "A magical storybook adventure.")}

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
      model:  "gpt-image-1",
      prompt: coverPrompt,
      size:   "1024x1024"
    });

    const coverImageBase64 = await normalizeImageToBase64(imgResp?.data?.[0]);
    return res.json({ status: "ok", coverImageBase64 });
  } catch (err) {
    return res.status(200).json({
      status:         "fallback",
      coverImageBase64: null,
      message:        "Cover generation was blocked, fallback will be used on client."
    });
  }
});

// ─── Generate page image ──────────────────────────────────────────────────────
app.post("/generate-image", async (req, res) => {
  try {
    const { prompt, illustration_style, characterPromptCore } = req.body;

    if (!prompt) {
      return res.status(400).json({ status: "error", message: "Missing required field: prompt" });
    }

    const style       = illustration_style || "Soft Storybook";
    const finalPrompt = `
Create a premium children's storybook illustration.

Illustration style: ${sanitizeBrandTerms(style)}

Character consistency:
${sanitizeBrandTerms(characterPromptCore || "Keep the same main child character consistent.")}

Scene:
${sanitizeImagePrompt(prompt)}

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
      model:  "gpt-image-1",
      prompt: finalPrompt,
      size:   "1024x1024"
    });

    const imageBase64 = await normalizeImageToBase64(imgResp?.data?.[0]);
    return res.json({ status: "ok", imageBase64 });
  } catch (err) {
    return res.status(500).json({
      status:  "error",
      message: "Image generation failed",
      details: err?.message || "unknown_error"
    });
  }
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
