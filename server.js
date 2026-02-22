const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // 👈 זה החדש

app.get("/", (req, res) => {
  res.send("AI Book Engine is running 🚀");
});

app.post("/create-book", async (req, res) => {
  const data = req.body;

  console.log("Received data:", data);

  res.json({
    status: "success",
    message: "Book generation started",
    received: data
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
