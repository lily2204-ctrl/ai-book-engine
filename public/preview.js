import { updateBookData } from "./js/state.js";

const API_BASE = window.location.origin;

function getBookId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("bookId");
}

const bookId = getBookId();

if (!bookId) {
  window.location.href = "wizard.html";
}

const coverImageEl = document.getElementById("coverImage");
const bookTitleEl = document.getElementById("bookTitle");
const bookSubtitleEl = document.getElementById("bookSubtitle");
const pagesContainer = document.getElementById("pagesContainer");
const unlockNote = document.getElementById("unlockNote");
const goToCheckoutBtn = document.getElementById("goToCheckoutBtn");

async function loadBook() {
  try {
    const res = await fetch(`${API_BASE}/api/books/${bookId}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Failed to load book");
    }

    return data.book;
  } catch (err) {
    console.error("loadBook failed:", err);
    alert("Failed to load book");
    window.location.href = "wizard.html";
    return null;
  }
}

function renderBook(book) {
  if (!book) return;

  if (coverImageEl && book.coverImage) {
    coverImageEl.src = book.coverImage;
  }

  if (bookTitleEl) {
    bookTitleEl.textContent = book.generatedBook?.title || "Your Magical Adventure";
  }

  if (bookSubtitleEl) {
    bookSubtitleEl.textContent = book.generatedBook?.subtitle || "";
  }

  if (unlockNote) {
    unlockNote.textContent =
      book.purchaseUnlocked === true
        ? "Your full story is unlocked."
        : "You are currently viewing only the first 2 preview pages. Complete payment to unlock the full book.";
  }

  updateBookData({
    bookId,
    childName: book.childName || "",
    childAge: book.childAge || "",
    childGender: book.childGender || "",
    storyIdea: book.storyIdea || "",
    illustrationStyle: book.illustrationStyle || "",
    croppedPhoto: book.croppedPhoto || "",
    originalPhoto: book.originalPhoto || "",
    generatedBook: book.generatedBook || null,
    characterReference: book.characterReference || null,
    purchaseUnlocked: book.purchaseUnlocked === true
  });

  renderPages(book);
}

function renderPages(book) {
  if (!pagesContainer) return;

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
        <div style="opacity:0.45; filter:blur(6px); min-height:180px; display:flex; align-items:center; justify-content:center;">
          🔒 Unlock after purchase
        </div>
      `;
    } else {
      div.innerHTML = `
        <div class="page-label">Page ${index + 1}</div>
        <div class="image-box" id="img-${index}">Loading...</div>
        <div class="page-text">${escapeHtml(page.text || "")}</div>
      `;
    }

    pagesContainer.appendChild(div);

    if (!isLocked) {
      generateImage(page, index, book);
    }
  });
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function generateImage(page, index, book) {
  const container = document.getElementById(`img-${index}`);
  if (!container) return;

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

    if (!res.ok || !data.imageBase64) {
      throw new Error(data?.message || "Failed to generate image");
    }

    container.innerHTML = `
      <img src="data:image/png;base64,${data.imageBase64}" style="width:100%; border-radius:20px"/>
    `;
  } catch (error) {
    console.error(`generateImage failed for page ${index + 1}:`, error);
    container.innerHTML = "Failed";
  }
}

goToCheckoutBtn?.addEventListener("click", () => {
  window.location.href = `checkout.html?bookId=${encodeURIComponent(bookId)}`;
});

(async () => {
  const book = await loadBook();
  renderBook(book);
})();
