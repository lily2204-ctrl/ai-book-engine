const API_BASE = window.location.origin;

const SHOPIFY_DOMAIN = "lifebook-464.myshopify.com";
const STOREFRONT_TOKEN = "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";

const VARIANTS = {
  digital: "43110468845634",
  printed: "43110480674882"
};

function getBookId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("bookId");
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

  async function createShopifyCheckout(currentBook) {
    const selectedFormat = currentBook.selectedFormat || "digital";
    const variantId = selectedFormat === "printed"
      ? VARIANTS.printed
      : VARIANTS.digital;

    const mutation = `
      mutation cartCreate($input: CartInput!) {
        cartCreate(input: $input) {
          cart {
            id
            checkoutUrl
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        lines: [
          {
            quantity: 1,
            merchandiseId: `gid://shopify/ProductVariant/${variantId}`,
            attributes: [
              { key: "_bookId", value: bookId },
              { key: "_childName", value: currentBook.childName || "" },
              { key: "_style", value: currentBook.illustrationStyle || "" },
              { key: "_story", value: currentBook.storyIdea || "" },
              { key: "_format", value: selectedFormat }
            ]
          }
        ]
      }
    };

    const res = await fetch(`https://${SHOPIFY_DOMAIN}/api/2025-01/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN
      },
      body: JSON.stringify({
        query: mutation,
        variables
      })
    });

    const data = await res.json();

    const errors = data?.data?.cartCreate?.userErrors || [];
    if (errors.length > 0) {
      throw new Error(errors.map((e) => e.message).join(", "));
    }

    const checkoutUrl = data?.data?.cartCreate?.cart?.checkoutUrl;
    if (!checkoutUrl) {
      console.error("Shopify response:", data);
      throw new Error("Failed to create Shopify checkout.");
    }

    return checkoutUrl;
  }

  backToPreviewBtn?.addEventListener("click", () => {
    window.location.href = `preview.html?bookId=${encodeURIComponent(bookId)}`;
  });

  backToCoverBtn?.addEventListener("click", () => {
    window.location.href = `cover.html?bookId=${encodeURIComponent(bookId)}`;
  });

  proceedBtn?.addEventListener("click", async () => {
    try {
      if (!book) {
        throw new Error("Book details are still loading.");
      }

      proceedBtn.disabled = true;

      if (checkoutStatus) {
        checkoutStatus.textContent = "Creating secure Shopify checkout...";
        checkoutStatus.classList.remove("error");
      }

      const checkoutUrl = await createShopifyCheckout(book);
      window.location.href = checkoutUrl;
    } catch (error) {
      console.error("Shopify checkout failed:", error);

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
