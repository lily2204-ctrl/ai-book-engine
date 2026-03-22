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

const nameEl = document.getElementById("name");
const ageEl = document.getElementById("age");
const styleEl = document.getElementById("style");
const storyEl = document.getElementById("story");
const pagesEl = document.getElementById("pages");

const proceedBtn = document.getElementById("proceedToPaymentBtn");

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

  if (nameEl) nameEl.textContent = book.childName || "-";
  if (ageEl) ageEl.textContent = book.childAge || "-";
  if (styleEl) styleEl.textContent = book.illustrationStyle || "-";
  if (storyEl) storyEl.textContent = book.storyIdea || "-";
  if (pagesEl) pagesEl.textContent = String(book.generatedBook?.pages?.length || 0);

  updateBookData({
    bookId: book.bookId,
    childName: book.childName || "",
    childAge: book.childAge || "",
    childGender: book.childGender || "",
    storyIdea: book.storyIdea || "",
    illustrationStyle: book.illustrationStyle || "",
    croppedPhoto: book.croppedPhoto || "",
    originalPhoto: book.originalPhoto || "",
    generatedBook: book.generatedBook || null,
    characterReference: book.characterReference || null,
    purchaseUnlocked: book.purchaseUnlocked === true,
    selectedFormat: book.selectedFormat || "digital",
    selectedPrice: book.selectedPrice || 39
  });
}

proceedBtn?.addEventListener("click", async () => {
  try {
    const unlockRes = await fetch(`${API_BASE}/api/books/${bookId}/unlock`, {
      method: "POST"
    });

    const unlockData = await unlockRes.json();

    if (!unlockRes.ok) {
      throw new Error(unlockData.message || "Failed to unlock book");
    }

    updateBookData({
      purchaseUnlocked: true
    });

    window.location.href = `success.html?bookId=${encodeURIComponent(bookId)}`;
  } catch (err) {
    console.error("unlock failed:", err);
    alert("Payment simulation failed");
  }
});

(async () => {
  const book = await loadBook();
  renderBook(book);
})();
