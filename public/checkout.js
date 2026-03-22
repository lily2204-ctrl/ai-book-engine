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

let selectedFormat = "digital";
let selectedPrice = 39;

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

  nameEl.textContent = book.childName || "-";
  ageEl.textContent = book.childAge || "-";
  styleEl.textContent = book.illustrationStyle || "-";
  storyEl.textContent = book.storyIdea || "-";
  pagesEl.textContent = String(book.generatedBook?.pages?.length || 0);

  updateBookData({
    bookId,
    childName: book.childName,
    childAge: book.childAge,
    storyIdea: book.storyIdea,
    illustrationStyle: book.illustrationStyle,
    generatedBook: book.generatedBook,
    purchaseUnlocked: book.purchaseUnlocked === true
  });
}

proceedBtn?.addEventListener("click", async () => {
  try {
    await fetch(`${API_BASE}/api/books/${bookId}/unlock`, {
      method: "POST"
    });

    updateBookData({
      purchaseUnlocked: true
    });

    window.location.href = "success.html?bookId=" + encodeURIComponent(bookId);
  } catch (err) {
    console.error(err);
    alert("Payment simulation failed");
  }
});

(async () => {
  const book = await loadBook();
  renderBook(book);
})();
