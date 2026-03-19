import { getBookData } from "./js/state.js";

const API_BASE = window.location.origin;
const data = getBookData();

if (!data.generatedBook || !Array.isArray(data.generatedBook.pages) || data.generatedBook.pages.length === 0) {
  window.location.href = "cover.html";
}

const generatedBook = data.generatedBook;
const characterReference = data.characterReference || {};
const characterSheetImage = sessionStorage.getItem("characterSheetImage");

const previewBookTitle = document.getElementById("previewBookTitle");
const previewBookSubtitle = document.getElementById("previewBookSubtitle");
const previewCoverImage = document.getElementById("previewCoverImage");

const statChildName = document.getElementById("statChildName");
const statStyle = document.getElementById("statStyle");
const statStory = document.getElementById("statStory");
const statPages = document.getElementById("statPages");

const pagesContainer = document.getElementById("pagesContainer");

const backToCoverBtn = document.getElementById("backToCoverBtn");
const goToReaderBtn = document.getElementById("goToReaderBtn");
const goToPrintBtn = document.getElementById("goToPrintBtn");
const goToCheckoutBtn = document.getElementById("goToCheckoutBtn");

const previewBrandLogo = document.getElementById("previewBrandLogo");
const miniBookLogo = document.getElementById("miniBookLogo");

function hideBrokenLogo(img) {
  if (!img) return;
  img.addEventListener("error", () => {
    img.style.display = "none";
  });
}

hideBrokenLogo(previewBrandLogo);
hideBrokenLogo(miniBookLogo);

if (previewBookTitle) {
  previewBookTitle.textContent = generatedBook.title || "Your Magical Adventure";
}

if (previewBookSubtitle) {
  previewBookSubtitle.textContent = generatedBook.subtitle || "A story where you are the hero";
}

if (previewCoverImage) {
  if (characterSheetImage) {
    previewCoverImage.src = characterSheetImage;
  } else if (data.croppedPhoto) {
    previewCoverImage.src = data.croppedPhoto;
  } else if (data.originalPhoto) {
    previewCoverImage.src = data.originalPhoto;
  } else {
    previewCoverImage.style.display = "none";
  }
}

if (statChildName) {
  statChildName.textContent = data.childName || "-";
}

if (statStyle) {
  statStyle.textContent = data.illustrationStyle || "-";
}

if (statStory) {
  statStory.textContent = data.storyIdea || "-";
}

if (statPages) {
  statPages.textContent = String(generatedBook.pages?.length || 0);
}

function createPageCard(page, index) {
  const article = document.createElement("article");
  article.className = "page-card";

  const pageNumber = index + 1;
  const promptText = page.imagePrompt || "";
  const storyText = page.text || "";

  article.innerHTML = `
    <div class="page-card-inner">
      <div class="page-image-wrap">
        <div class="page-image-loading" id="loading-${pageNumber}">
          Generating illustration for page ${pageNumber}...
        </div>
      </div>

      <div class="page-content">
        <div class="page-badge">Page ${pageNumber}</div>
        <p class="page-text">${escapeHtml(storyText)}</p>
        <p class="page-prompt">${escapeHtml(promptText)}</p>
      </div>
    </div>
  `;

  return article;
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
  const wrap = article.querySelector(".page-image-wrap");

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
        class="page-image"
        src="data:image/png;base64,${result.imageBase64}"
        alt="Illustration for page ${pageNumber}"
      />
    `;
  } catch (error) {
    console.error(`Page ${pageNumber} image generation failed:`, error);

    wrap.innerHTML = `
      <div class="page-image-error">
        Failed to generate illustration for page ${pageNumber}.
      </div>
    `;
  }
}

async function renderPages() {
  if (!pagesContainer) return;

  pagesContainer.innerHTML = "";

  const articles = generatedBook.pages.map((page, index) => {
    const article = createPageCard(page, index);
    pagesContainer.appendChild(article);
    return article;
  });

  for (let i = 0; i < generatedBook.pages.length; i += 1) {
    await generatePageImage(generatedBook.pages[i], i, articles[i]);
  }
}

backToCoverBtn?.addEventListener("click", () => {
  window.location.href = "cover.html";
});

goToReaderBtn?.addEventListener("click", () => {
  window.location.href = "reader.html";
});

goToPrintBtn?.addEventListener("click", () => {
  window.location.href = "print.html";
});

goToCheckoutBtn?.addEventListener("click", () => {
  window.location.href = "checkout.html";
});

renderPages();
