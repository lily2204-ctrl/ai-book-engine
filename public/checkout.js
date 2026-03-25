const API_BASE = window.location.origin;

const SHOPIFY_DOMAIN = "lifebook-464.myshopify.com";

const VARIANTS = {
  digital: "43110468845634",
  printed: "43110480674882"
};

function getBookId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("bookId");
}

function toBase64UrlUtf8(obj) {
  const json = JSON.stringify(obj);
  const utf8Bytes = new TextEncoder().encode(json);

  let binary = "";
  utf8Bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

document.addEventListener("DOMContentLoaded", async () => {
  const bookId = getBookId();

  const coverImageEl = document.getElementById("coverImage");
  const bookTitleValue = document.getElementById("bookTitleValue");
  const bookSubtitleValue = document.getElementById("bookSubtitleValue");
  const nameEl = document.getElementById("name");
  const ageEl = document.getElementById("age");
  const styleEl = document.getElementById("style");
  const storyEl = document.getElementById("story");
  const pagesEl = document.getElementById("pages");

  const proceedBtn = document.getElementById("proceedToPaymentBtn");
  const backToPreviewBtn = document.getElementById("backToPreviewBtn");
  const backToCoverBtn = document.getElementById("backToCoverBtn");
  const checkoutStatus = document.getElementById("checkoutStatus");

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

  async function loadBook() {
    const res = await fetch(`${API_BASE}/api/books/${bookId}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Failed to load book");
    }

    return data.book;
  }

  function renderBook(currentBook) {
    if (!currentBook) return;

    if (coverImageEl) {
      if (currentBook.coverImage) {
        coverImageEl.src = currentBook.coverImage;
      } else if (currentBook.croppedPhoto) {
        coverImageEl.src = currentBook.croppedPhoto;
      } else if (currentBook.originalPhoto) {
        coverImageEl.src = currentBook.originalPhoto;
      } else {
        coverImageEl.style.display = "none";
      }
    }

    if (bookTitleValue) {
      bookTitleValue.textContent = currentBook.generatedBook?.title || "-";
    }

    if (bookSubtitleValue) {
      bookSubtitleValue.textContent = currentBook.generatedBook?.subtitle || "-";
    }

    if (nameEl) nameEl.textContent = currentBook.childName || "-";
    if (ageEl) ageEl.textContent = currentBook.childAge || "-";
    if (styleEl) styleEl.textContent = currentBook.illustrationStyle || "-";
    if (storyEl) storyEl.textContent = currentBook.storyIdea || "-";
    if (pagesEl) pagesEl.textContent = String(currentBook.generatedBook?.pages?.length || 0);

    if (checkoutStatus) {
      checkoutStatus.textContent = "Ready to continue to secure checkout.";
      checkoutStatus.classList.remove("error");
    }
  }

  function buildShopifyPermalink(currentBook) {
    const selectedFormat = currentBook.selectedFormat === "printed" ? "printed" : "digital";
    const variantId = selectedFormat === "printed" ? VARIANTS.printed : VARIANTS.digital;

    const properties = {
      _bookId: bookId,
      _childName: currentBook.childName || "",
      _style: currentBook.illustrationStyle || "",
      _story: currentBook.storyIdea || "",
      _format: selectedFormat
    };

    const encodedProps = toBase64UrlUtf8(properties);

    return `https://${SHOPIFY_DOMAIN}/cart/${variantId}:1?properties=${encodedProps}`;
  }

  backToPreviewBtn?.addEventListener("click", () => {
    window.location.href = `preview.html?bookId=${encodeURIComponent(bookId)}`;
  });

  backToCoverBtn?.addEventListener("click", () => {
    window.location.href = `cover.html?bookId=${encodeURIComponent(bookId)}`;
  });

  proceedBtn?.addEventListener("click", () => {
    try {
      if (!book) {
        throw new Error("Book details are still loading.");
      }

      proceedBtn.disabled = true;

      if (checkoutStatus) {
        checkoutStatus.textContent = "Redirecting to Shopify checkout...";
        checkoutStatus.classList.remove("error");
      }

      const checkoutUrl = buildShopifyPermalink(book);
      console.log("Shopify permalink:", checkoutUrl);

      window.location.href = checkoutUrl;
    } catch (error) {
      console.error("Shopify permalink failed:", error);

      if (checkoutStatus) {
        checkoutStatus.textContent = error.message || "Failed to open Shopify checkout.";
        checkoutStatus.classList.add("error");
      }

      alert(error.message || "Failed to open Shopify checkout.");
      proceedBtn.disabled = false;
    }
  });

  try {
    book = await loadBook();
    renderBook(book);
  } catch (error) {
    console.error("loadBook failed:", error);

    if (checkoutStatus) {
      checkoutStatus.textContent = error.message || "Failed to load book.";
      checkoutStatus.classList.add("error");
    }

    alert(error.message || "Failed to load book.");
  }
});
