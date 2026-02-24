import express from "express";
import cors from "cors";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

// --- OpenAI client (requires OPENAI_API_KEY env var) ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Health check
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "wizard.html"));
});

/**
 * POST /create-book
 * Body: { child_name, age, story_type }
 * Returns: { title, pages: [{pageNumber, text, imagePrompt}], cover: {title, subtitle} }
 */
app.post("/create-book", async (req, res) => {
  try {
    const { child_name, age, story_type, illustration_style, child_photo } = req.body;
    if (!child_name || !age || !story_type) {
      return res.status(400).json({
        status: "error",
        message: "Missing required fields: child_name, age, story_type",
      });
    }

    // Ask model to return structured JSON only
    const prompt = `
You are a professional children's book writer and illustrator.

Illustration style must be: ${illustration_style}.

Create a magical children's story.

Child name: ${child_name}
Child age: ${age}
Story theme: ${story_type}

The story must include image prompts that clearly describe the child in the selected illustration style.
Make sure the illustrated character strongly resembles the uploaded child photo.

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

    // Normalize / validate
    const title = book.title || "My Magical Story";
    const subtitle = book.subtitle || "A personalized adventure";
    const pages = Array.isArray(book.pages) ? book.pages.slice(0, 10) : [];
    let characterImageUrl = null;

if (child_photo) {
  const characterImage = await openai.images.generate({
    model: "gpt-image-1",
    prompt: `
Create a high quality children's book illustration
of this child in ${illustration_style} style.
The illustration must strongly resemble the uploaded child photo.
Colorful, soft lighting, storybook style.
`,
    image: child_photo,
    size: "1024x1024"
  });

  characterImageUrl = characterImage.data[0].url;
}

    if (pages.length !== 10) {
      return res.status(500).json({
        status: "error",
        message: "AI returned invalid page count. Expected 10 pages.",
        debug: { returned: pages.length },
      });
    
    const normalizedPages = [];

for (let i = 0; i < pages.length; i++) {
  const p = pages[i];

  const imagePrompt = `
${p.imagePrompt}

Illustration style: ${illustration_style}.
Use the same main character as the reference image.
High quality children's book illustration.
Colorful, detailed, soft lighting.
`;

  const imageResponse = await openai.images.generate({
    model: "gpt-image-1",
    prompt: imagePrompt,
    size: "1024x1024"
  });

  const imageUrl = imageResponse.data[0].url;

  normalizedPages.push({
    pageNumber: i + 1,
    text: String(p.text || "").trim(),
    imagePrompt: p.imagePrompt,
    imageUrl
  });


    return res.json({
      status: "ok",
      title,
      subtitle,
      cover: { title, subtitle },
      characterImage: characterImageUrl,
      pages: normalizedPages,
    });
    } catch (err) {
    const status = err?.status || 500;
    const code = err?.code || "unknown_error";
    const message = err?.message || "AI generation failed";

    // If quota issue - return clean error message to UI
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

// Railway uses PORT env var
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
