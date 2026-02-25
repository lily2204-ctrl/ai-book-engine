import express from "express";
import cors from "cors";
import OpenAI from "openai";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static site
app.use(express.static(path.join(__dirname, "public")));

// Folder to store generated images
const GENERATED_DIR = path.join(__dirname, "generated");
if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });

// Expose generated images
app.use("/generated", express.static(GENERATED_DIR));

// --- OpenAI client (requires OPENAI_API_KEY env var) ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Health check -> wizard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "wizard.html"));
});

/**
 * POST /create-book
 * Body: { child_name, age, story_type, illustration_style }
 * Returns: { title, subtitle, illustration_style, pages:[{pageNumber,text,imagePrompt,imageUrl?}] }
 */
app.post("/create-book", async (req, res) => {
  try {
    const { child_name, age, story_type, illustration_style } = req.body;

    if (!child_name || !age || !story_type) {
      return res.status(400).json({
        status: "error",
        message: "Missing required fields: child_name, age, story_type",
      });
    }

    const style = illustration_style || "Soft Storybook";

    const prompt = `
You are a professional children's book writer.

Illustration style must be: ${style}.

Create a magical children's story.

Child name: ${child_name}
Child age: ${age}
Story theme: ${story_type}

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
    const pages = Array.isArray(book.pages) ? book.pages : [];

    if (pages.length !== 10) {
      return res.status(500).json({
        status: "error",
        message: "AI returned invalid page count. Expected 10 pages.",
        debug: { returned: pages.length },
      });
    }

    const normalizedPages = pages.map((p, i) => ({
      pageNumber: i + 1,
      text: String(p?.text || "").trim(),
      imagePrompt: String(p?.imagePrompt || "").trim(),
      imageUrl: null, // will be filled later by /generate-image
    }));

    return res.json({
      status: "ok",
      title,
      subtitle,
      illustration_style: style,
      cover: { title, subtitle },
      pages: normalizedPages,
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
 * POST /generate-image
 * Body: { prompt, illustration_style }
 * Returns: { status:"ok", imageUrl:"/generated/xxx.png" }
 *
 * IMPORTANT:
 * We DO NOT return base64 to the browser (avoids localStorage quota).
 * We save the image on server and return a URL.
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
No brand names.`;

    // Generate image (URL) then download and save
    const imageResponse = await openai.images.generate({
      model: "gpt-image-1",
      prompt: finalPrompt,
      size: "1024x1024",
    });

    const url = imageResponse?.data?.[0]?.url;
    if (!url) {
      return res.status(500).json({
        status: "error",
        message: "Image generation failed (no URL returned).",
      });
    }

    // Download image bytes
    const r = await fetch(url);
    if (!r.ok) {
      return res.status(500).json({
        status: "error",
        message: "Image download failed.",
      });
    }

    const arrayBuffer = await r.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const fileName = `img_${Date.now()}_${Math.random().toString(16).slice(2)}.png`;
    const filePath = path.join(GENERATED_DIR, fileName);

    fs.writeFileSync(filePath, buffer);

    return res.json({
      status: "ok",
      imageUrl: `/generated/${fileName}`,
    });
  } catch (err) {
    const status = err?.status || 500;
    const code = err?.code || "unknown_error";
    const message = err?.message || "Image generation failed";

    if (status === 429 || code === "insufficient_quota") {
      return res.status(429).json({
        status: "error",
        message:
          "OpenAI quota/billing issue. Please enable billing or add credits to generate images.",
        code,
      });
    }

    return res.status(500).json({
      status: "error",
      message: "Image generation failed",
      code,
      details: message,
    });
  }
});

// Railway uses PORT env var
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
