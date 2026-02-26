import express from "express";
import cors from "cors";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Health check
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "wizard.html"));
});

/**
 * POST /create-book
 * Body: { child_name, age, story_type, illustration_style, child_photo }
 * Returns JSON: { title, subtitle, pages: [{text, imagePrompt}], illustration_style }
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
You are a professional children's book writer and illustrator.

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
- Keep prompts consistent for the SAME main character across pages.
`;

    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      child_photo: payload.child_photo,
      illustration_style: payload.illustration_style
    })
  });

  const charJson = await charRes.json();

  if (!charRes.ok) {
    setMsg("Character generation failed", "err");
    createBtn.disabled = false;
    return;
  }

  characterData = charJson;
}
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

    // 1️⃣ Generate character description (important for consistency)
    const descriptionResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `
Analyze this child photo and describe the child in detail.

Return a consistent character description that can be reused for illustration prompts.

Include:
- Hair color
- Hair length
- Skin tone
- Face shape
- Eye color
- Distinct features
- General vibe

Keep it concise but consistent.
`
      }],
      temperature: 0.3
    });

    const characterDescription =
      descriptionResponse.choices?.[0]?.message?.content?.trim() ||
      "Young child character";

    // 2️⃣ Generate reference illustration
    const imageResponse = await openai.images.generate({
      model: "gpt-image-1",
      prompt: `
Create a high quality children's book character illustration.

Style: ${style}

The character must strongly resemble:
${characterDescription}

Full body.
Neutral background.
Soft lighting.
Highly detailed.
No text.
`,
      image: child_photo,
      size: "1024x1024"
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
      characterDescription
    });

  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Character generation failed",
      details: err?.message
    });
  }
});

/**
 * POST /generate-image
 * Body: { prompt, illustration_style }
 * Returns: { status:"ok", imageBase64 }
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
`;

    const imgResp = await openai.images.generate({
      model: "gpt-image-1",
      prompt: finalPrompt,
      size: "1024x1024",
    });

    const item = imgResp?.data?.[0];

    // Prefer b64_json if available, otherwise fetch URL and convert to base64
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

// Railway uses PORT env var
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
