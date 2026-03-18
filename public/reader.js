import { getBookData } from "./js/state.js";

const API_BASE = window.location.origin;
const data = getBookData();

if (!data.generatedBook || !Array.isArray(data.generatedBook.pages) || data.generatedBook.pages.length === 0) {
  window.location.href = "preview.html";
}

const generatedBook = data.generatedBook;
const characterReference = data.characterReference || {};
const pages = generatedBook.pages || [];

const readerTitle = document.getElementById("readerTitle");
const readerSubtitle = document.getElementById("readerSubtitle");
const readerPageBadge = document.getElementById("readerPageBadge");
const readerImageWrap = document.getElementById("readerImageWrap");
const readerPageText = document.getElementById("readerPageText");
const readerPageCounter = document.getElementById("readerPageCounter");

const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const backToPreviewBtn = document.getElementById("backToPreviewBtn");
const readerBrandLogo = document.getElementById("readerBrandLogo");

let currentPageIndex = 0;
const pageImageCache = new Map();

function hideBrokenLogo(img) {
  if (!img) return;
  img.addEventListener("error", () => {
    img.style.display = "none";
  });
}
hideBrokenLogo(readerBrandLogo);

if (readerTitle) {
  readerTitle.textContent = generatedBook.title || "Your Magical Adventure";
}

if (readerSubtitle) {
  readerSubtitle.textContent = generatedBook.subtitle || "A story where you are the hero";
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

async function renderCurrentPage() {
  const page = pages[currentPageIndex];
  const pageNumber = currentPageIndex + 1;

  if (readerPageBadge) {
    readerPageBadge.textContent = `Page ${pageNumber}`;
  }

  if (readerPageCounter) {
    readerPageCounter.textContent = `Page ${pageNumber} of ${pages.length}`;
  }

  if (readerPageText) {
    readerPageText.textContent = page.text || "";
  }

  if (readerImageWrap) {
    readerImageWrap.innerHTML = `<div class="reader-image-loading">Generating illustration for page ${pageNumber}...</div>`;
  }

  try {
    const imageSrc = await generatePageImage(page, currentPageIndex);

    if (readerImageWrap) {
      readerImageWrap.innerHTML = `
        <img class="reader-image" src="${imageSrc}" alt="Illustration for page ${pageNumber}" />
      `;
    }
  } catch (error) {
    console.error(`Reader page ${pageNumber} failed:`, error);

    if (readerImageWrap) {
      readerImageWrap.innerHTML = `
        <div class="reader-image-error">
          Failed to generate illustration for page ${pageNumber}.
        </div>
      `;
    }
  }

  if (prevPageBtn) {
    prevPageBtn.disabled = currentPageIndex === 0;
    prevPageBtn.style.opacity = currentPageIndex === 0 ? "0.55" : "1";
  }

  if (nextPageBtn) {
    nextPageBtn.textContent = currentPageIndex === pages.length - 1 ? "Done" : "Next";
  }
}

prevPageBtn?.addEventListener("click", async () => {
  if (currentPageIndex === 0) return;
  currentPageIndex -= 1;
  await renderCurrentPage();
});

nextPageBtn?.addEventListener("click", async () => {
  if (currentPageIndex < pages.length - 1) {
    currentPageIndex += 1;
    await renderCurrentPage();
    return;
  }

  window.location.href = "checkout.html";
});

backToPreviewBtn?.addEventListener("click", () => {
  window.location.href = "preview.html";
});

renderCurrentPage();
