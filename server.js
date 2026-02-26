import express from "express";
import cors from "cors";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" })); // מאפשר העלאת תמונות בפורמט Base64

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// דף הבית
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "wizard.html"));
});

// שלב א': ניתוח תמונת הילד ויצירת תיאור דמות עקבי
app.post("/generate-character", async (req, res) => {
  try {
    const { child_photo, illustration_style } = req.body;
    if (!child_photo) return res.status(400).json({ error: "No photo provided" });

    const vision = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this child's face, hair, and eyes for a storybook character. Max 2 sentences for consistency." },
            { type: "image_url", image_url: { url: child_photo } }
          ],
        },
      ],
    });

    res.json({ status: "ok", characterDescription: vision.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// שלב ב': יצירת מבנה הספר (10 עמודים) בשפה שנבחרה
app.post("/create-book", async (req, res) => {
  try {
    const { child_name, age, story_type, language, character_description, illustration_style } = req.body;
    
    const prompt = `
      Write a 10-page children's storybook in ${language || 'English'}.
      Hero: ${child_name}, Age: ${age}. Theme: ${story_type}.
      Physical appearance to maintain: ${character_description}.
      Style: ${illustration_style || '3D Render'}.

      Return ONLY a JSON object:
      {
        "title": "...",
        "subtitle": "...",
        "pages": [
          { "text": "...", "imagePrompt": "Detailed illustration prompt of ${child_name} doing X, maintaining the character description." }
        ]
      }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    res.json({ status: "ok", ...JSON.parse(completion.choices[0].message.content) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
