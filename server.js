import express from "express";
import cors from "cors";
import OpenAI from "openai";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DATA_DIR = path.join(__dirname, "data");
const ORDERS_DIR = path.join(DATA_DIR, "orders");

async function ensureDataDirs() {
  await fs.mkdir(ORDERS_DIR, { recursive: true });
}

function createOrderId() {
  return `LB-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

async function saveOrder(order) {
  const filePath = path.join(ORDERS_DIR, `${order.orderId}.json`);
  await fs.writeFile(filePath, JSON.stringify(order, null, 2), "utf8");
}

async function loadOrder(orderId) {
  const filePath = path.join(ORDERS_DIR, `${orderId}.json`);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/**
 * POST /create-book
 */
app.post("/create-book", async (req, res) => {
  try {
    const { child_name, age, story_type, illustration_style, child_gender } = req.body;

    if (!child_name || !age || !story_type) {
      return res.status(400).json({
        status: "error",
        message: "Missing required fields: child_name, age, story_type",
      });
    }

    const style = illustration_style || "Soft Storybook";

    const prompt = `
You are a professional children's book writer and illustrator.

Illustration style must be: ${style}.

Create a magical children's story.

Child name: ${child_name}
Child age: ${age}
Child gender: ${child_gender || "neutral"}
Story direction from parent: ${story_type}

Return structured JSON only in this format:

{
  "title": "string",
  "subtitle": "string",
  "pages": [
    { "text": "string (max 80 words)", "imagePrompt": "string (for an illustration)" }
  ]
}

Rules:
- 10 pages exactly.
- Page texts must be kid-friendly, colorful, positive, and simple.
- imagePrompt should describe a colorful children's illustration (no brand names).
- Keep prompts consistent for the SAME main character across pages.
- Make the story feel premium, emotional, and memorable.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.9,
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    const book = JSON.parse(raw);

    const title = book.title || "My Magical Story";
    const subtitle = book.subtitle || "A personalized adventure";
    const pages = Array.isArray(book.pages) ? book.pages.slice(0, 10) : [];

    if (pages.length !== 10) {
      return res.status(500).json({
        status: "error",
        message: "AI returned invalid page count. Expected 10 pages.",
        debug: { returned: pages.length },
      });
    }

    return res.json({
      status: "ok",
      title,
      subtitle,
      illustration_style: style,
      pages: pages.map((p) => ({
        text: String(p.text || "").trim(),
        imagePrompt: String(p.imagePrompt || "").trim(),
      })),
    });
  } catch (err) {
    const status = err?.status || 500;
    const code = err?.code || "unknown_error";
    const message = err?.message || "AI generation failed";

    if (status === 429 || code === "insufficient_quota") {
      return res.status(429).json({
        status: "error",
        message:
          "OpenAI quota/billing issue. Please enable billing or add credits to generate stories/images.",
        code,
      });
    }

    return res.status(500).json({
      status: "error",
      message: "AI generation failed",
      code,
      details: message,
    });
  }
});

/**
 * POST /generate-character
 */
app.post("/generate-character", async (req, res) => {
  try {
    const { child_photo, illustration_style } = req.body;

    if (!child_photo) {
      return res.status(400).json({
        status: "error",
        message: "Missing child_photo",
      });
    }

    const style = illustration_style || "Soft Storybook";

    const descriptionResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this child photo and describe the child for consistent children's book illustration.

Return a concise but specific reusable description including:
- hair color
- hair length
- skin tone
- face shape
- eye color
- distinct features
- overall vibe

Keep it short but visually useful.`,
            },
            {
              type: "image_url",
              image_url: { url: child_photo },
            },
          ],
        },
      ],
      temperature: 0.3,
    });

    const characterDescription =
      descriptionResponse.choices?.[0]?.message?.content?.trim() ||
      "Young child character";

    const imageResponse = await openai.images.generate({
      model: "gpt-image-1",
      prompt: `
Create a premium children's book character illustration.

Style: ${style}

The child should strongly resemble this description:
${characterDescription}

Requirements:
- full body
- premium storybook quality
- soft lighting
- clean background
- no text
- warm, emotional, polished visual style
`,
      size: "1024x1024",
    });

    const imageData = imageResponse.data?.[0];
    let imageBase64 = null;

    if (imageData?.b64_json) {
      imageBase64 = imageData.b64_json;
    } else if (imageData?.url) {
      const r = await fetch(imageData.url);
      const buf = await r.arrayBuffer();
      imageBase64 = Buffer.from(buf).toString("base64");
    }

    return res.json({
      status: "ok",
      characterImageBase64: imageBase64,
      characterDescription,
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Character generation failed",
      details: err?.message,
    });
  }
});

/**
 * POST /generate-image
 */
app.post("/generate-image", async (req, res) => {
  try {
    const { prompt, illustration_style } = req.body;

    if (!prompt) {
      return res.status(400).json({
        status: "error",
        message: "Missing required field: prompt",
      });
    }

    const style = illustration_style || "Soft Storybook";

    const finalPrompt = `
${prompt}

Illustration style: ${style}.
High quality children's book illustration.
Colorful, detailed, soft lighting.
No text on image.
Premium polished composition.
`;

    const imgResp = await openai.images.generate({
      model: "gpt-image-1",
      prompt: finalPrompt,
      size: "1024x1024",
    });

    const item = imgResp?.data?.[0];

    if (item?.b64_json) {
      return res.json({ status: "ok", imageBase64: item.b64_json });
    }

    if (item?.url) {
      const r = await fetch(item.url);
      const arrayBuf = await r.arrayBuffer();
      const base64 = Buffer.from(arrayBuf).toString("base64");
      return res.json({ status: "ok", imageBase64: base64 });
    }

    return res.status(500).json({
      status: "error",
      message: "Image generation failed",
      code: "no_image_returned",
    });
  } catch (err) {
    const status = err?.status || 500;
    const code = err?.code || "unknown_error";
    const message = err?.message || "Image generation failed";

    return res.status(status).json({
      status: "error",
      message: "Image generation failed",
      code,
      details: message,
    });
  }
});

/**
 * POST /create-order
 */
app.post("/create-order", async (req, res) => {
  try {
    const { bookData, amount } = req.body;

    if (!bookData || !bookData.title) {
      return res.status(400).json({
        status: "error",
        message: "Missing bookData",
      });
    }

    const orderId = createOrderId();

    const order = {
      orderId,
      status: "pending",
      amount: amount || 49,
      currency: "USD",
      createdAt: new Date().toISOString(),
      paidAt: null,
      customer: {
        childName: bookData.childName || "",
        childAge: bookData.childAge || "",
      },
      book: {
        title: bookData.title || "",
        subtitle: bookData.subtitle || "",
        illustrationStyle: bookData.illustration_style || "",
        pagesCount: Array.isArray(bookData.pages) ? bookData.pages.length : 0,
      },
      source: "lifebook-demo-checkout",
    };

    await saveOrder(order);

    return res.json({
      status: "ok",
      orderId,
      order,
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Failed to create order",
      details: err?.message,
    });
  }
});

/**
 * POST /complete-order
 */
app.post("/complete-order", async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        status: "error",
        message: "Missing orderId",
      });
    }

    const order = await loadOrder(orderId);
    order.status = "paid";
    order.paidAt = new Date().toISOString();

    await saveOrder(order);

    return res.json({
      status: "ok",
      order,
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Failed to complete order",
      details: err?.message,
    });
  }
});

/**
 * GET /order/:orderId
 */
app.get("/order/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await loadOrder(orderId);

    return res.json({
      status: "ok",
      order,
    });
  } catch (err) {
    return res.status(404).json({
      status: "error",
      message: "Order not found",
    });
  }
});

const PORT = process.env.PORT || 8080;

ensureDataDirs().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
