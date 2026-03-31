const API_BASE = window.location.origin;

function getBookId() {
  return new URLSearchParams(window.location.search).get("bookId");
}

document.addEventListener("DOMContentLoaded", async () => {
  const bookId = getBookId();

  const coverImageEl    = document.getElementById("coverImage");
  const bookTitleValue  = document.getElementById("bookTitleValue");
  const bookSubtitleValue = document.getElementById("bookSubtitleValue");
  const nameEl          = document.getElementById("name");
  const ageEl           = document.getElementById("age");
  const styleEl         = document.getElementById("style");
  const storyEl         = document.getElementById("story");
  const pagesEl         = document.getElementById("pages");
  const proceedBtn      = document.getElementById("proceedToPaymentBtn");
  const backToPreviewBtn= document.getElementById("backToPreviewBtn");
  const backToCoverBtn  = document.getElementById("backToCoverBtn");
  const checkoutStatus  = document.getElementById("checkoutStatus");

  if (!bookId) {
    if (checkoutStatus) {
      checkoutStatus.textContent = "Missing book ID.";
      checkoutStatus.classList.add("error");
    }
    alert("Missing book ID");
    window.location.href = "wizard.html";
    return;
  }

  let book = null;

  // ── Load book from API ────────────────────────────────────────────────────
  async function loadBook() {
    const res  = await fetch(`${API_BASE}/api/books/${bookId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to load book");
    return data.book;
  }

  // ── Render book details into the page ─────────────────────────────────────
  function renderBook(currentBook) {
    if (!currentBook) return;

    if (coverImageEl) {
      const src = currentBook.coverImage || currentBook.croppedPhoto || currentBook.originalPhoto;
      if (src) { coverImageEl.src = src; }
      else      { coverImageEl.style.display = "none"; }
    }

    if (bookTitleValue)    bookTitleValue.textContent    = currentBook.generatedBook?.title    || "-";
    if (bookSubtitleValue) bookSubtitleValue.textContent = currentBook.generatedBook?.subtitle || "-";
    if (nameEl)  nameEl.textContent  = currentBook.childName        || "-";
    if (ageEl)   ageEl.textContent   = currentBook.childAge         || "-";
    if (styleEl) styleEl.textContent = currentBook.illustrationStyle|| "-";
    if (storyEl) storyEl.textContent = currentBook.storyIdea        || "-";
    if (pagesEl) pagesEl.textContent = String(currentBook.generatedBook?.pages?.length || 0);

    if (checkoutStatus) {
      checkoutStatus.textContent = "Ready to continue to secure checkout.";
      checkoutStatus.classList.remove("error");
    }
  }

  // ── Send to Stripe ────────────────────────────────────────────────────────
  async function redirectToStripe() {
    if (!book) throw new Error("Book details are still loading.");

    proceedBtn.disabled    = true;
    proceedBtn.textContent = "Opening secure checkout…";

    if (checkoutStatus) {
      checkoutStatus.textContent = "Preparing secure payment page…";
      checkoutStatus.classList.remove("error");
    }

    const res = await fetch(`${API_BASE}/api/create-checkout-session`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        bookId,
        format: book.selectedFormat || "digital"
      })
    });

    const data = await res.json();

    if (!res.ok || !data.url) {
      throw new Error(data.message || "Failed to open payment page.");
    }

    // Redirect to Stripe Checkout (stays on your domain visually, returns cleanly)
    window.location.href = data.url;
  }

  // ── Button listeners ──────────────────────────────────────────────────────
  backToPreviewBtn?.addEventListener("click", () => {
    window.location.href = `preview.html?bookId=${encodeURIComponent(bookId)}`;
  });

  backToCoverBtn?.addEventListener("click", () => {
    window.location.href = `cover.html?bookId=${encodeURIComponent(bookId)}`;
  });

  proceedBtn?.addEventListener("click", async () => {
    try {
      await redirectToStripe();
    } catch (error) {
      console.error("Stripe redirect failed:", error);

      if (checkoutStatus) {
        checkoutStatus.textContent = error.message || "Failed to open payment page.";
        checkoutStatus.classList.add("error");
      }

      proceedBtn.disabled    = false;
      proceedBtn.textContent = "Proceed to Payment";
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  try {
    book = await loadBook();
    renderBook(book);
  } catch (error) {
    console.error("loadBook failed:", error);

    if (checkoutStatus) {
      checkoutStatus.textContent = error.message || "Failed to load book.";
      checkoutStatus.classList.add("error");
    }
  }
});
