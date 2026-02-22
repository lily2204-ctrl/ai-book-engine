const express = require("express");
const cors = require("cors");
const path = require("path");
const OpenAI = require("openai");

const app = express();

// 🔐 OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // מאפשר להגיש wizard.html

// דף ראשי
app.get("/", (req, res) => {
  res.send("AI Book Engine is running 🚀");
});

// יצירת ספר
app.post("/create-book", async (req, res) => {
  try {
    const { child_name, age, story_type, traits } = req.body;

    if (!child_name || !age || !story_type) {
      return res.status(400).json({
        status: "error",
        message: "Missing required fields"
      });
    }

    const prompt = `
Write a magical children's story (600-800 words).
Main character: ${child_name}, age ${age}.
Theme: ${story_type}.
Personality traits: ${(traits || []).join(", ") || "kind and curious"}.
Make it emotional, warm, inspiring.
End with a gentle life lesson.
Return plain text only.
`;

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
    });

    res.json({
      status: "success",
      story_text: response.output_text
    });

  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({
      status: "error",
      message: "AI generation failed"
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
