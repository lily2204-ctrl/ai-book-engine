const API_BASE = window.location.origin;

function getBookId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("bookId");
}

const bookId = getBookId();

const statusEl = document.getElementById("openBookStatus");
const retryBtn = document.getElementById("retryBtn");
const goHomeBtn = document.getElementById("goHomeBtn");

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

async function loadBook() {
  const res = await fetch(`${API_BASE}/api/books/${bookId}`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Failed to load book");
  }

  return data.book;
}

async function tryOpenBook() {
  try {
    if (!bookId) {
      setStatus("Missing book ID.", true);
      return;
    }

    setStatus("Checking payment status...");

    const book = await loadBook();

    if (book.purchaseUnlocked === true || book.paymentStatus === "paid") {
      setStatus("Your book is ready. Redirecting...");
      window.location.href = `preview.html?bookId=${encodeURIComponent(bookId)}`;
      return;
    }

    setStatus("Your payment has not been confirmed yet. Please wait a moment and try again.", true);
  } catch (error) {
    console.error("open-book failed:", error);
    setStatus(error.message || "Failed to open your book.", true);
  }
}

retryBtn?.addEventListener("click", () => {
  tryOpenBook();
});

goHomeBtn?.addEventListener("click", () => {
  window.location.href = "index.html";
});

tryOpenBook();
