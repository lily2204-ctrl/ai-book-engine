import { getBookData } from "./js/state.js";

const API_BASE = window.location.origin;
const data = getBookData();

if (!data.generatedBook || !Array.isArray(data.generatedBook.pages) || data.generatedBook.pages.length === 0) {
  window.location.href = "preview.html";
}

const generatedBook = data.generatedBook;
const characterReference = data.characterReference || {};
const pages = generatedBook.pages || [];

const printTitle = document.getElementById("printTitle");
const spreadList = document.getElementById("spreadList");

const backToPreviewBtn = document.getElementById("backToPreviewBtn");
const goToReaderBtn = document.getElementById("goToReaderBtn");
const goToCheckoutBtn = document.getElementById("goToCheckoutBtn");
const printBrandLogo = document.getElementById("printBrandLogo");

const pageImageCache = new Map();

function hideBrokenLogo(img) {
  if (!img) return;
  img.addEventListener("error", () => {
    img.style.display = "none";
  });
}
hideBrokenLogo(printBrandLogo);

if (printTitle) {
  printTitle.textContent = generatedBook.title || "Print-ready preview";
}

async function generatePageImage(page, index) {
  const cacheKey = `page-${index}`;
  if (pageImageCache.has(cacheKey)) {
    return pageImageCache.get(cacheKey);
  }

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
    throw new Error(result?.message || result?.details || `Failed to generate page ${index + 1}`);
  }

  const imageSrc = `data:image/png;base64,${result.imageBase64}`;
  pageImageCache.set(cacheKey, imageSrc);
  return imageSrc;
}

function createSpreadCard(leftPage, leftIndex, rightPage, rightIndex) {
  const section = document.createElement("section");
  section.className = "spread-card";

  const rightPageHtml = rightPage
    ? `
      <article class="print-page" id="print-page-${rightIndex}">
        <div class="print-page-image-wrap" data-image-slot="${rightIndex}">
          <div class="print-page-loading">Generating illustration for page ${rightIndex + 1}...</div>
        </div>
        <div class="print-page-text">${escapeHtml(rightPage.text || "")}</div>
      </article>
    `
    : `
      <article class="print-page">
        <div class="print-page-image-wrap">
          <div class="print-page-loading">Empty page</div>
        </div>
        <div class="print-page-text"></div>
      </article>
    `;

  section.innerHTML = `
    <div class="spread-header">
      <div class="spread-badge">Spread ${Math.floor(leftIndex / 2) + 1}</div>
      <div class="spread-badge">Pages ${leftIndex + 1}${rightPage ? ` - ${rightIndex + 1}` : ""}</div>
    </div>

    <div class="spread-grid">
      <article class="print-page" id="print-page-${leftIndex}">
        <div class="print-page-image-wrap" data-image-slot="${leftIndex}">
          <div class="print-page-loading">Generating illustration for page ${leftIndex + 1}...</div>
        </div>
        <div class="print-page-text">${escapeHtml(leftPage.text || "")}</div>
      </article>

      ${rightPageHtml}
    </div>
  `;

  return section;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function renderSpreads() {
  if (!spreadList) return;

  spreadList.innerHTML = "";

  for (let i = 0; i < pages.length; i += 2) {
    const leftPage = pages[i];
    const rightPage = pages[i + 1] || null;

    const spread = createSpreadCard(leftPage, i, rightPage, i + 1);
    spreadList.appendChild(spread);

    const leftSlot = spread.querySelector(`[data-image-slot="${i}"]`);
    try {
      const leftImage = await generatePageImage(leftPage, i);
      leftSlot.innerHTML = `<img class="print-page-image" src="${leftImage}" alt="Illustration for page ${i + 1}" />`;
    } catch (error) {
      console.error(`Print page ${i + 1} failed:`, error);
      leftSlot.innerHTML = `<div class="print-page-error">Failed to generate illustration for page ${i + 1}.</div>`;
    }

    if (rightPage) {
      const rightSlot = spread.querySelector(`[data-image-slot="${i + 1}"]`);
      try {
        const rightImage = await generatePageImage(rightPage, i + 1);
        rightSlot.innerHTML = `<img class="print-page-image" src="${rightImage}" alt="Illustration for page ${i + 2}" />`;
      } catch (error) {
        console.error(`Print page ${i + 2} failed:`, error);
        rightSlot.innerHTML = `<div class="print-page-error">Failed to generate illustration for page ${i + 2}.</div>`;
      }
    }
  }
}

backToPreviewBtn?.addEventListener("click", () => {
  window.location.href = "preview.html";
});

goToReaderBtn?.addEventListener("click", () => {
  window.location.href = "reader.html";
});

goToCheckoutBtn?.addEventListener("click", () => {
  window.location.href = "checkout.html";
});

renderSpreads();
