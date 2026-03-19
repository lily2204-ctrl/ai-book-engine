import { getBookData } from "./js/state.js";

const API_BASE = window.location.origin;
const data = getBookData();

if (!data.generatedBook || !Array.isArray(data.generatedBook.pages) || data.generatedBook.pages.length === 0) {
  window.location.href = "cover.html";
}

const generatedBook = data.generatedBook;
const characterReference = data.characterReference || {};
const coverImage = sessionStorage.getItem("coverImage") || "";
const isUnlocked = data.purchaseUnlocked === true;

const coverImageEl = document.getElementById("coverImage");
const bookTitleEl = document.getElementById("bookTitle");
const bookSubtitleEl = document.getElementById("bookSubtitle");
const pagesContainer = document.getElementById("pagesContainer");
const checkoutBtn = document.getElementById("checkoutBtn");
const unlockNote = document.getElementById("unlockNote");

const previewPages = isUnlocked
  ? generatedBook.pages
  : generatedBook.pages.slice(0, 2);

if (bookTitleEl) {
  bookTitleEl.textContent = generatedBook.title || "Your Magical Adventure";
}

if (bookSubtitleEl) {
  bookSubtitleEl.textContent = generatedBook.subtitle || "A story where you are the hero";
}

if (coverImageEl) {
  if (coverImage) {
    coverImageEl.src = coverImage;
  } else if (data.croppedPhoto) {
    coverImageEl.src = data.croppedPhoto;
  } else if (data.originalPhoto) {
    coverImageEl.src = data.originalPhoto;
  }
}

if (unlockNote) {
  unlockNote.textContent = isUnlocked
    ? "Your full book is unlocked."
    : "You are viewing the first 2 preview pages. Complete payment to unlock the full book.";
}

if (checkoutBtn) {
  checkoutBtn.textContent = isUnlocked
    ? "Continue"
    : "Unlock Full Book";
}

function createPageCard(page, index) {
  const article = document.createElement("article");
  article.className = "page";

  const pageNumber = index + 1;
  const storyText = page.text || "";

  article.innerHTML = `
    <div class="page-label">Page ${pageNumber}</div>
    <div class="image-box" id="image-box-${pageNumber}">
      Generating illustration for page ${pageNumber}...
    </div>
    <div class="page-text">${escapeHtml(storyText)}</div>
  `;

  return article;
}

function createLockedCard() {
  const lockCard = document.createElement("article");
  lockCard.className = "page";

  lockCard.innerHTML = `
    <div class="page-label">Locked Preview</div>
    <div class="image-box" style="min-height:260px; font-size:20px; color:#f0c46d; text-align:center; padding:24px;">
      The rest of the story unlocks after payment
    </div>
    <div class="page-text">
      Continue to checkout to unlock the full preview, access the complete book, and continue to delivery.
    </div>
  `;

  return lockCard;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function generatePageImage(page, index, article) {
  const pageNumber = index + 1;
  const wrap = article.querySelector(`#image-box-${pageNumber}`);

  try {
    const res = await fetch(`${API_BASE}/generate-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: page.imagePrompt || "",
        illustration_style: data.illustrationStyle || "Soft Storybook",
        characterPromptCore: characterReference.characterPromptCore || generatedBook.characterPromptCore || "",
        characterSummary: characterReference.characterSummary || generatedBook.characterSummary || ""
      })
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result?.message || result?.details || `Failed to generate page ${pageNumber}`);
    }

    if (!result.imageBase64) {
      throw new Error(`No image returned for page ${pageNumber}`);
    }

    wrap.innerHTML = `
      <img
        src="data:image/png;base64,${result.imageBase64}"
        alt="Illustration for page ${pageNumber}"
      />
    `;
  } catch (error) {
    console.error(`Page ${pageNumber} image generation failed:`, error);

    wrap.innerHTML = `
      <div>Failed to generate illustration for page ${pageNumber}.</div>
    `;
  }
}

async function renderPages() {
  if (!pagesContainer) return;

  pagesContainer.innerHTML = "";

  const articles = previewPages.map((page, index) => {
    const article = createPageCard(page, index);
    pagesContainer.appendChild(article);
    return article;
  });

  for (let i = 0; i < previewPages.length; i += 1) {
    await generatePageImage(previewPages[i], i, articles[i]);
  }

  if (!isUnlocked && generatedBook.pages.length > 2) {
    pagesContainer.appendChild(createLockedCard());
  }
}

checkoutBtn?.addEventListener("click", () => {
  window.location.href = "checkout.html";
});

renderPages();
