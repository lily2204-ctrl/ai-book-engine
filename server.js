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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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

function buildOpenAIErrorPayload(err, fallbackMessage) {
  const status = err?.status || 500;
  const code = err?.code || "unknown_error";
  const details = err?.message || fallbackMessage;

  if (
    status === 429 ||
    code === "insufficient_quota" ||
    details.toLowerCase().includes("quota") ||
    details.toLowerCase().includes("billing")
  ) {
    return {
      statusCode: 429,
      body: {
        status: "error",
        message: "OpenAI billing/quota issue.",
        code,
        details
      }
    };
  }

  return {
    statusCode: status,
    body: {
      status: "error",
      message: fallbackMessage,
      code,
      details
    }
  };
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/create-book", async (req, res) => {
  try {
    const { child_name, age, story_type, illustration_style, child_gender } = req.body;

    if (!child_name || !age || !story_type) {
      return res.status(400).json({
        status: "error",
        message: "Missing required fields: child_name, age, story_type"
      });
    }

    const style = illustration_style || "Soft Storybook";

    const prompt = `
You are a professional children's book writer.

Create a magical premium children's story.

Child name: ${child_name}
Age: ${age}
Gender: ${child_gender || "neutral"}
Story direction from parent: ${story_type}

Return JSON only in this format:

{
  "title": "string",
  "subtitle": "string",
  "pages": [
    { "text": "string", "imagePrompt": "string" }
  ]
}

Rules:
- 10 pages exactly
- each page text must be short, emotional, child-friendly, and premium
- imagePrompt must describe the scene visually for a storybook illustrator
- keep the same main child character consistent across all pages
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.9
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
        details: `Returned ${pages.length} pages instead of 10.`
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
    const payload = buildOpenAIErrorPayload(err, "Book generation failed");
    return res.status(payload.statusCode).json(payload.body);
  }
});

app.post("/generate-character", async (req, res) => {
  try {
    const { child_photo, illustration_style } = req.body;

    if (!child_photo) {
      return res.status(400).json({
        status: "error",
        message: "Missing child_photo"
      });
    }

    const style = illustration_style || "Soft Storybook";

    const analysis = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
Analyze the child in this image and return a reusable character profile for a premium children's storybook.

Return JSON only in this format:

{
  "characterDescription": "",
  "characterDNA": {
    "hairColor": "",
    "hairLength": "",
    "skinTone": "",
    "eyeColor": "",
    "faceShape": "",
    "ageLook": "",
    "distinctiveFeatures": "",
    "overallVibe": ""
  }
}
`
            },
            {
              type: "image_url",
              image_url: { url: child_photo }
            }
          ]
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    });

    const profileRaw = analysis.choices?.[0]?.message?.content || "{}";
    const profile = JSON.parse(profileRaw);

    const characterPrompt = `
Create a premium children's book character illustration.

Style: ${style}

Character description:
${profile.characterDescription || "young child character"}

Character DNA:
Hair: ${profile.characterDNA?.hairColor || ""}
Hair length: ${profile.characterDNA?.hairLength || ""}
Skin tone: ${profile.characterDNA?.skinTone || ""}
Eye color: ${profile.characterDNA?.eyeColor || ""}
Face shape: ${profile.characterDNA?.faceShape || ""}
Age look: ${profile.characterDNA?.ageLook || ""}
Distinctive features: ${profile.characterDNA?.distinctiveFeatures || ""}
Overall vibe: ${profile.characterDNA?.overallVibe || ""}

Rules:
- one main child character
- full body
- premium storybook quality
- clean soft background
- warm soft lighting
- no text
`;

    const image = await openai.images.generate({
      model: "gpt-image-1",
      prompt: characterPrompt,
      size: "1024x1024"
    });

    const imageData = image.data?.[0];
    let characterImageBase64 = null;

    if (imageData?.b64_json) {
      characterImageBase64 = imageData.b64_json;
    } else if (imageData?.url) {
      const r = await fetch(imageData.url);
      const buf = await r.arrayBuffer();
      characterImageBase64 = Buffer.from(buf).toString("base64");
    }

    return res.json({
      status: "ok",
      characterDescription: profile.characterDescription || "",
      characterDNA: profile.characterDNA || {},
      characterImageBase64
    });
  } catch (err) {
    const payload = buildOpenAIErrorPayload(err, "Character generation failed");
    return res.status(payload.statusCode).json(payload.body);
  }
});

app.post("/generate-image", async (req, res) => {
  try {
    const {
      prompt,
      illustration_style,
      characterDescription,
      characterDNA
    } = req.body;

    if (!prompt) {
      return res.status(400).json({
        status: "error",
        message: "Missing prompt"
      });
    }

    const style = illustration_style || "Soft Storybook";

    const finalPrompt = `
Create a premium children's book illustration.

Illustration style:
${style}

Main character lock:
${characterDescription || "young child character"}

Character DNA:
Hair: ${characterDNA?.hairColor || ""}
Hair length: ${characterDNA?.hairLength || ""}
Skin tone: ${characterDNA?.skinTone || ""}
Eye color: ${characterDNA?.eyeColor || ""}
Face shape: ${characterDNA?.faceShape || ""}
Age look: ${characterDNA?.ageLook || ""}
Distinctive features: ${characterDNA?.distinctiveFeatures || ""}
Overall vibe: ${characterDNA?.overallVibe || ""}

Scene:
${prompt}

Rules:
- the child must remain visually consistent across pages
- same child, same look, same vibe
- premium illustrated storybook
- no text in image
- warm polished composition
`;

    const img = await openai.images.generate({
      model: "gpt-image-1",
      prompt: finalPrompt,
      size: "1024x1024"
    });

    const imageData = img.data?.[0];
    let imageBase64 = null;

    if (imageData?.b64_json) {
      imageBase64 = imageData.b64_json;
    } else if (imageData?.url) {
      const r = await fetch(imageData.url);
      const buf = await r.arrayBuffer();
      imageBase64 = Buffer.from(buf).toString("base64");
    }

    if (!imageBase64) {
      return res.status(500).json({
        status: "error",
        message: "Image generation failed",
        details: "No image data returned from OpenAI."
      });
    }

    return res.json({
      status: "ok",
      imageBase64
    });
  } catch (err) {
    const payload = buildOpenAIErrorPayload(err, "Image generation failed");
    return res.status(payload.statusCode).json(payload.body);
  }
});

app.post("/create-order", async (req, res) => {
  try {
    const { bookData, amount } = req.body;

    if (!bookData || !bookData.title) {
      return res.status(400).json({
        status: "error",
        message: "Missing bookData"
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
        childAge: bookData.childAge || ""
      },
      book: {
        title: bookData.title || "",
        subtitle: bookData.subtitle || "",
        illustrationStyle: bookData.illustration_style || "",
        pagesCount: Array.isArray(bookData.pages) ? bookData.pages.length : 0
      },
      source: "lifebook-demo-checkout"
    };

    await saveOrder(order);

    return res.json({
      status: "ok",
      orderId,
      order
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Failed to create order",
      details: err?.message || "Unknown server error"
    });
  }
});

app.post("/complete-order", async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        status: "error",
        message: "Missing orderId"
      });
    }

    const order = await loadOrder(orderId);
    order.status = "paid";
    order.paidAt = new Date().toISOString();

    await saveOrder(order);

    return res.json({
      status: "ok",
      order
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Failed to complete order",
      details: err?.message || "Unknown server error"
    });
  }
});

app.get("/order/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await loadOrder(orderId);

    return res.json({
      status: "ok",
      order
    });
  } catch (err) {
    return res.status(404).json({
      status: "error",
      message: "Order not found"
    });
  }
});

const PORT = process.env.PORT || 8080;

ensureDataDirs().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
