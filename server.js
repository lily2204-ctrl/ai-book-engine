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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/create-book", async (req, res) => {
  try {

    const { child_name, age, story_type, illustration_style } = req.body;

    const prompt = `
You are a professional children's book writer.

Create a magical children's story.

Child name: ${child_name}
Age: ${age}
Story direction: ${story_type}

Return JSON:

{
"title":"",
"subtitle":"",
"pages":[
{text:"",imagePrompt:""}
]
}

10 pages exactly.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });

    const raw = completion.choices[0].message.content;
    const book = JSON.parse(raw);

    return res.json({
      status: "ok",
      title: book.title,
      subtitle: book.subtitle,
      illustration_style: illustration_style,
      pages: book.pages
    });

  } catch (err) {

    return res.status(500).json({
      status: "error",
      message: "Book generation failed"
    });

  }
});

app.post("/generate-character", async (req, res) => {

  try {

    const { child_photo } = req.body;

    const analysis = await openai.chat.completions.create({

      model: "gpt-4o-mini",

      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
Analyze the child in the image.

Return a CHARACTER PROFILE.

Return JSON:

{
"characterDescription":"",
"characterDNA":{
"hairColor":"",
"hairLength":"",
"skinTone":"",
"eyeColor":"",
"faceShape":"",
"ageLook":"",
"distinctiveFeatures":"",
"overallVibe":""
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

      response_format: { type: "json_object" }

    });

    const profile = JSON.parse(analysis.choices[0].message.content);

    const image = await openai.images.generate({

      model: "gpt-image-1",

      prompt: `
Create a premium children's book character.

Character profile:

${profile.characterDescription}

Full body
storybook illustration
clean background
same character across pages
`,

      size: "1024x1024"

    });

    const base64 = image.data[0].b64_json;

    return res.json({
      status: "ok",
      characterDescription: profile.characterDescription,
      characterDNA: profile.characterDNA,
      characterImageBase64: base64
    });

  } catch (err) {

    return res.status(500).json({
      status: "error",
      message: "Character generation failed"
    });

  }

});

app.post("/generate-image", async (req, res) => {

  try {

    const {
      prompt,
      illustration_style,
      characterDescription,
      characterDNA,
      characterImage
    } = req.body;

    const finalPrompt = `
Create a children's book illustration.

STYLE:
${illustration_style}

CHARACTER LOCK (MUST remain identical):

${characterDescription}

DNA:

Hair: ${characterDNA?.hairColor}
Hair length: ${characterDNA?.hairLength}
Skin: ${characterDNA?.skinTone}
Eyes: ${characterDNA?.eyeColor}
Face: ${characterDNA?.faceShape}
Age look: ${characterDNA?.ageLook}
Features: ${characterDNA?.distinctiveFeatures}
Vibe: ${characterDNA?.overallVibe}

Scene:
${prompt}

Rules:

The same child must appear.
Do not change appearance.
Consistent child across pages.
storybook illustration
`;

    const img = await openai.images.generate({

      model: "gpt-image-1",
      prompt: finalPrompt,
      image: characterImage,
      size: "1024x1024"

    });

    const base64 = img.data[0].b64_json;

    return res.json({
      status: "ok",
      imageBase64: base64
    });

  } catch (err) {

    return res.status(500).json({
      status: "error",
      message: "Image generation failed"
    });

  }

});

app.post("/create-order", async (req, res) => {

  try {

    const { bookData, amount } = req.body;

    const orderId = createOrderId();

    const order = {
      orderId,
      status: "pending",
      amount,
      createdAt: new Date().toISOString(),
      book: bookData
    };

    await saveOrder(order);

    return res.json({
      status: "ok",
      orderId
    });

  } catch (err) {

    return res.status(500).json({
      status: "error"
    });

  }

});

app.post("/complete-order", async (req, res) => {

  const { orderId } = req.body;

  const order = await loadOrder(orderId);

  order.status = "paid";
  order.paidAt = new Date().toISOString();

  await saveOrder(order);

  return res.json({
    status: "ok"
  });

});

app.get("/order/:orderId", async (req, res) => {

  try {

    const order = await loadOrder(req.params.orderId);

    res.json({
      status: "ok",
      order
    });

  } catch {

    res.status(404).json({
      status: "error"
    });

  }

});

const PORT = process.env.PORT || 8080;

ensureDataDirs().then(() => {

  app.listen(PORT, () => {
    console.log("Server running on", PORT);
  });

});
