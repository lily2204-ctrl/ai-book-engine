import { updateBookData } from "./js/state.js";

const API_BASE = window.location.origin;

// =======================
// GET bookId מה־URL
// =======================
function getBookId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("bookId");
}

const bookId = getBookId();

if (!bookId) {
  window.location.href = "wizard.html";
}

// =======================
// ELEMENTS
// =======================
const coverImageEl = document.getElementById("coverImage");
const bookTitleEl = document.getElementById("bookTitle");
const bookSubtitleEl = document.getElementById("bookSubtitle");
const pagesContainer = document.getElementById("pagesContainer");

// =======================
// FETCH BOOK
// =======================
async function loadBook() {
  try {
    const res = await fetch(`${API_BASE}/api/books/${bookId}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Failed to load book");
    }

    return data.book;
  } catch (err) {
    console.error(err);
    alert("Failed to load book");
    window.location.href = "wizard.html";
  }
}

// =======================
// RENDER
// =======================
function renderBook(book) {
  // COVER
  if (coverImageEl && book.coverImage) {
    coverImageEl.src = book.coverImage;
  }

  // TITLE
  if (bookTitleEl) {
    bookTitleEl.textContent = book.generatedBook?.title || "Your Magical Adventure";
  }

  if (bookSubtitleEl) {
    bookSubtitleEl.textContent = book.generatedBook?.subtitle || "";
  }

  // SAVE ל-state (לשלבים הבאים)
  updateBookData({
    bookId,
    generatedBook: book.generatedBook,
    characterReference: book.characterReference,
    coverImage: book.coverImage
  });

  renderPages(book);
}

// =======================
// PAGES (LOCK SYSTEM 🔒)
// =======================
function renderPages(book) {
  pagesContainer.innerHTML = "";

  const pages = book.generatedBook?.pages || [];
  const isUnlocked = book.purchaseUnlocked === true;

  pages.forEach((page, index) => {
    const isLocked = index >= 2 && !isUnlocked;

    const div = document.createElement("div");
    div.className = "page";

    if (isLocked) {
      div.innerHTML = `
        <div class="page-label">Page ${index + 1}</div>
        <div style="opacity:0.4; filter:blur(6px);">
          🔒 Unlock after purchase
        </div>
      `;
    } else {
      div.innerHTML = `
        <div class="page-label">Page ${index + 1}</div>
        <div class="image-box" id="img-${index}">Loading...</div>
        <div class="page-text">${page.text}</div>
      `;

      generateImage(page, index, book);
    }

    pagesContainer.appendChild(div);
  });
}

// =======================
// IMAGE GENERATION
// =======================
async function generateImage(page, index, book) {
  const container = document.getElementById(`img-${index}`);

  try {
    const res = await fetch(`${API_BASE}/generate-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: page.imagePrompt,
        illustration_style: book.illustrationStyle,
        characterPromptCore: book.characterReference?.characterPromptCore
      })
    });

    const data = await res.json();

    container.innerHTML = `
      <img src="data:image/png;base64,${data.imageBase64}" style="width:100%; border-radius:20px"/>
    `;
  } catch {
    container.innerHTML = "Failed";
  }
}

// =======================
// INIT
// =======================
(async () => {
  const book = await loadBook();
  renderBook(book);
})();
