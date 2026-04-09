import { getBookData, updateBookData } from “./js/state.js”;

const API_BASE = window.location.origin;

const wizardData = getBookData();

if (
!wizardData.croppedPhoto ||
!wizardData.childName ||
!wizardData.storyIdea ||
!wizardData.illustrationStyle
) {
window.location.href = “setup.html”;
}

const generateBookBtn       = document.getElementById(“generateBookBtn”);
const backToSetupBtn        = document.getElementById(“backToSetupBtn”);
const backToCropBtn         = document.getElementById(“backToCropBtn”);
const generateStatus        = document.getElementById(“generateStatus”);
const stepCharacter         = document.getElementById(“stepCharacter”);
const stepStory             = document.getElementById(“stepStory”);
const stepPreview           = document.getElementById(“stepPreview”);
const uploadedPhotoPreview  = document.getElementById(“uploadedPhotoPreview”);
const characterSheetPreview = document.getElementById(“characterSheetPreview”);

// ── Progress bar ─────────────────────────────────────────────────────────────
const progressWrap = document.createElement(“div”);
progressWrap.id = “progressWrap”;
progressWrap.style.cssText = `display:none; margin-top:16px; background:rgba(255,255,255,0.06); border-radius:14px; overflow:hidden; height:22px; border:1px solid rgba(240,196,109,0.14);`;
const progressBar = document.createElement(“div”);
progressBar.id = “progressBar”;
progressBar.style.cssText = `height:100%; width:0%; border-radius:14px; background:linear-gradient(90deg,#f0c46d,#d08e2b); transition:width 0.6s ease;`;
progressWrap.appendChild(progressBar);
generateStatus?.parentElement?.insertBefore(progressWrap, generateStatus.nextSibling);

if (uploadedPhotoPreview) {
uploadedPhotoPreview.src = wizardData.croppedPhoto;
}

function setActiveStep(stepElement, text) {
[stepCharacter, stepStory, stepPreview].forEach((el) => {
if (el) el.classList.remove(“active”);
});
if (stepElement) stepElement.classList.add(“active”);
if (generateStatus) generateStatus.textContent = text;
}

function setProgress(pct) {
progressWrap.style.display = “block”;
progressBar.style.width = `${Math.min(100, Math.round(pct))}%`;
}

function buildGeneratedBookData(bookResponse, characterRef) {
return {
title:               bookResponse.title    || “”,
subtitle:            bookResponse.subtitle || “”,
pages:               bookResponse.pages    || [],
characterDNA:        characterRef.characterDNA        || {},
characterPromptCore: characterRef.characterPromptCore || “”,
characterSummary:    characterRef.characterSummary    || “”
};
}

function loadImage(src) {
return new Promise((resolve, reject) => {
const img = new Image();
img.onload  = () => resolve(img);
img.onerror = () => reject(new Error(“Failed to load generated image.”));
img.src = src;
});
}

async function compressDataUrl(dataUrl, maxDimension = 700, quality = 0.72) {
const img = await loadImage(dataUrl);
let { width, height } = img;
const scale = Math.min(1, maxDimension / Math.max(width, height));
width  = Math.round(width  * scale);
height = Math.round(height * scale);
const canvas = document.createElement(“canvas”);
canvas.width  = width;
canvas.height = height;
canvas.getContext(“2d”).drawImage(img, 0, 0, width, height);
return canvas.toDataURL(“image/jpeg”, quality);
}

async function safeStoreImage(key, dataUrl, maxDimension = 700, quality = 0.72) {
const compressed = await compressDataUrl(dataUrl, maxDimension, quality);
sessionStorage.setItem(key, compressed);
return compressed;
}

// ─── FIX: apiJson with explicit timeout to fail fast instead of hanging ───────
async function apiJson(url, options, timeoutMs = 25000) {
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

try {
const res = await fetch(url, { ...options, signal: controller.signal });
clearTimeout(timer);
const rawText = await res.text();
let result;
try { result = JSON.parse(rawText); }
catch { throw new Error(`Server returned non-JSON from ${url}`); }
if (!res.ok) throw new Error(result?.message || result?.details || `Request failed: ${url}`);
return result;
} catch (err) {
clearTimeout(timer);
if (err.name === “AbortError”) {
throw new Error(“Request timed out — please try again”);
}
throw err;
}
}

// ─── FIX: retry wrapper — retries up to 3 times on failure ───────────────────
async function withRetry(fn, retries = 3, delayMs = 1500) {
for (let attempt = 1; attempt <= retries; attempt++) {
try {
return await fn();
} catch (err) {
if (attempt === retries) throw err;
console.warn(`Attempt ${attempt} failed: ${err.message}. Retrying in ${delayMs}ms…`);
if (generateStatus) {
generateStatus.textContent = `Retrying… (attempt ${attempt + 1}/${retries})`;
}
await new Promise(r => setTimeout(r, delayMs));
}
}
}

async function createBookRecordIfNeeded() {
if (wizardData.bookId) return wizardData.bookId;

const result = await apiJson(`${API_BASE}/api/books/create`, {
method:  “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify({
childName:         wizardData.childName         || “”,
childAge:          wizardData.childAge          || “”,
childGender:       wizardData.childGender       || “”,
storyIdea:         wizardData.storyIdea         || “”,
illustrationStyle: wizardData.illustrationStyle || “Soft Storybook”,
croppedPhoto:      wizardData.croppedPhoto      || “”,
originalPhoto:     wizardData.originalPhoto     || “”
})
}, 10000);

const newBookId = result.bookId || “”;
updateBookData({ bookId: newBookId });
return newBookId;
}

async function patchBook(bookId, patch) {
if (!bookId) return;
await apiJson(`${API_BASE}/api/books/${bookId}`, {
method:  “PATCH”,
headers: { “Content-Type”: “application/json” },
body:    JSON.stringify(patch)
}, 10000);
}

// ─── Step 1: Character reference (up to 60s — heavy AI call) ─────────────────
async function generateCharacterReference(bookId) {
setActiveStep(stepCharacter, “Creating character reference…”);
setProgress(5);

const result = await withRetry(() =>
apiJson(`${API_BASE}/generate-character-reference`, {
method:  “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify({
child_photo:        wizardData.croppedPhoto,
child_name:         wizardData.childName         || “”,
age:                wizardData.childAge          || “”,
gender:             wizardData.childGender       || “”,
illustration_style: wizardData.illustrationStyle || “Soft Storybook”
})
}, 60000) // 60s timeout for image AI call
);

const characterRef = {
characterDNA:        result.characterDNA        || {},
characterPromptCore: result.characterPromptCore || “”,
characterSummary:    result.characterSummary    || “”
};

if (result.characterSheetBase64) {
const src = `data:image/png;base64,${result.characterSheetBase64}`;
if (characterSheetPreview) characterSheetPreview.src = src;
await safeStoreImage(“characterSheetImage”, src, 650, 0.68);
}

updateBookData({ characterReference: characterRef });
await patchBook(bookId, { characterReference: characterRef });
setProgress(20);
return characterRef;
}

// ─── Step 2: Story text only (fast — text only, no images) ───────────────────
async function generateBookStory(bookId, characterRef) {
setActiveStep(stepStory, “Building the story…”);
setProgress(25);

const result = await withRetry(() =>
apiJson(`${API_BASE}/create-book`, {
method:  “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify({
child_name:         wizardData.childName         || “”,
age:                wizardData.childAge          || “”,
gender:             wizardData.childGender       || “”,
story_type:         wizardData.storyIdea         || “A magical adventure”,
illustration_style: wizardData.illustrationStyle || “Soft Storybook”,
character_reference: {
characterDNA:        characterRef.characterDNA        || {},
characterPromptCore: characterRef.characterPromptCore || “”,
characterSummary:    characterRef.characterSummary    || “”
}
})
}, 30000) // 30s for text generation
);

const generatedBook = buildGeneratedBookData(result, characterRef);
updateBookData({ generatedBook });
await patchBook(bookId, { generatedBook });
setProgress(35);
return result;
}

// ─── Step 3: Cover image ──────────────────────────────────────────────────────
async function generateCoverImage(bookId, characterRef, bookResponse) {
setActiveStep(stepPreview, “Creating the cover…”);
setProgress(40);

const result = await withRetry(() =>
apiJson(`${API_BASE}/generate-cover-image`, {
method:  “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify({
title:               bookResponse.title    || “”,
subtitle:            bookResponse.subtitle || “”,
story_type:          wizardData.storyIdea  || “”,
illustration_style:  wizardData.illustrationStyle || “Soft Storybook”,
characterPromptCore: characterRef.characterPromptCore || “”,
characterSummary:    characterRef.characterSummary    || “”
})
}, 60000)
);

if (result.coverImageBase64) {
const rawCover = `data:image/png;base64,${result.coverImageBase64}`;
const stored   = await safeStoreImage(“coverImage”, rawCover, 700, 0.7);
await patchBook(bookId, { coverImage: stored });
setProgress(50);
return true;
}

if (wizardData.croppedPhoto) {
sessionStorage.setItem(“coverImage”, wizardData.croppedPhoto);
await patchBook(bookId, { coverImage: wizardData.croppedPhoto });
}
setProgress(50);
return false;
}

// ─── Step 4: Page images — one at a time with live progress ──────────────────
// FIX: Instead of one giant batch request that times out,
//      we trigger server-side batch and poll aggressively.
async function generateAllPageImages(bookId) {
setActiveStep(stepPreview, “Generating illustrations…”);
setProgress(52);

// Start the batch on the server (fire and don’t await the full response)
// We use a longer timeout here and handle partial failures gracefully
const startBatch = async () => {
try {
await apiJson(`${API_BASE}/api/books/${bookId}/generate-images`, {
method:  “POST”,
headers: { “Content-Type”: “application/json” }
}, 300000); // 5 min max for all images
} catch (err) {
// Batch may partially succeed — that’s OK, we handle in preview
console.warn(“Batch ended (may be partial):”, err.message);
}
};

// Start batch in background
const batchPromise = startBatch();

// Poll every 4s for progress
let done = false;
let lastReady = 0;
let stallCount = 0;

while (!done) {
await new Promise(r => setTimeout(r, 4000));

```
try {
  const status = await apiJson(
    `${API_BASE}/api/books/${bookId}/image-status`,
    { method: "GET" },
    8000
  );

  const ready = status.ready || 0;
  const total = status.total || 10;

  // Detect stall (no progress for 3 polls = 12s)
  if (ready === lastReady) {
    stallCount++;
  } else {
    stallCount = 0;
    lastReady = ready;
  }

  const pct = 52 + (ready / Math.max(1, total)) * 46;
  setProgress(pct);

  if (generateStatus) {
    generateStatus.textContent = `Generating illustrations… ${ready}/${total}`;
  }

  if (status.done || ready >= total) {
    done = true;
  }

  // If stalled for 60s (15 polls × 4s), give up waiting and move on
  if (stallCount >= 15) {
    console.warn("Image generation stalled — proceeding with partial results");
    done = true;
  }
} catch (pollErr) {
  console.warn("Poll error:", pollErr.message);
  // Don't break — keep trying
}
```

}

// Wait for batch promise to settle (it may already be done)
await batchPromise.catch(() => {});

setProgress(98);
if (generateStatus) generateStatus.textContent = “Almost ready…”;
}

// ─── Main button ──────────────────────────────────────────────────────────────
generateBookBtn?.addEventListener(“click”, async () => {
try {
generateBookBtn.disabled = true;
generateBookBtn.textContent = “Generating…”;

```
if (generateStatus) generateStatus.textContent = "Starting…";
setProgress(2);

const bookId       = await createBookRecordIfNeeded();
const characterRef = await generateCharacterReference(bookId);
const bookResponse = await generateBookStory(bookId, characterRef);
await generateCoverImage(bookId, characterRef, bookResponse);
await generateAllPageImages(bookId);

updateBookData({ purchaseUnlocked: false });
setProgress(100);

if (generateStatus) generateStatus.textContent = "Done! Opening your book…";

setTimeout(() => {
  window.location.href = `cover.html?bookId=${encodeURIComponent(bookId)}`;
}, 800);
```

} catch (error) {
console.error(“generate.js failed:”, error);
if (generateStatus) {
generateStatus.textContent = `Error: ${error.message || "Something went wrong. Please try again."}`;
}
generateBookBtn.disabled = false;
generateBookBtn.textContent = “Generate Book”;
}
});

backToSetupBtn?.addEventListener(“click”, () => {
window.location.href = “setup.html”;
});

backToCropBtn?.addEventListener(“click”, () => {
window.location.href = “crop.html”;
});
