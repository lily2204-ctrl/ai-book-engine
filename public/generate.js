import { getBookData, updateBookData } from "./js/state.js";

const API_BASE = window.location.origin;

const wizardData = getBookData();

if (
  !wizardData.croppedPhoto ||
  !wizardData.childName ||
  !wizardData.storyIdea ||
  !wizardData.illustrationStyle
) {
  window.location.href = "setup.html";
}

const generateBookBtn       = document.getElementById("generateBookBtn");
const backToSetupBtn        = document.getElementById("backToSetupBtn");
const backToCropBtn         = document.getElementById("backToCropBtn");
const generateStatus        = document.getElementById("generateStatus");
const stepCharacter         = document.getElementById("stepCharacter");
const stepStory             = document.getElementById("stepStory");
const stepPreview           = document.getElementById("stepPreview");
const uploadedPhotoPreview  = document.getElementById("uploadedPhotoPreview");
const characterSheetPreview = document.getElementById("characterSheetPreview");

// ── Progress bar (inject into DOM) ──────────────────────────────────────────
const progressWrap = document.createElement("div");
progressWrap.id = "progressWrap";
progressWrap.style.cssText = `
  display:none; margin-top:16px; background:rgba(255,255,255,0.06);
  border-radius:14px; overflow:hidden; height:22px;
  border:1px solid rgba(240,196,109,0.14);
`;
const progressBar = document.createElement("div");
progressBar.id = "progressBar";
progressBar.style.cssText = `
  height:100%; width:0%; border-radius:14px;
  background:linear-gradient(90deg,#f0c46d,#d08e2b);
  transition:width 0.4s ease;
`;
progressWrap.appendChild(progressBar);
generateStatus?.parentElement?.insertBefore(progressWrap, generateStatus.nextSibling);

if (uploadedPhotoPreview) {
  uploadedPhotoPreview.src = wizardData.croppedPhoto;
}

function setActiveStep(stepElement, text) {
  [stepCharacter, stepStory, stepPreview].forEach((el) => {
    if (el) el.classList.remove("active");
  });
  if (stepElement) stepElement.classList.add("active");
  if (generateStatus) generateStatus.textContent = text;
}

function setProgress(pct) {
  progressWrap.style.display = "block";
  progressBar.style.width = `${Math.min(100, Math.round(pct))}%`;
}

function buildGeneratedBookData(bookResponse, characterRef) {
  return {
    title:               bookResponse.title    || "",
    subtitle:            bookResponse.subtitle || "",
    pages:               bookResponse.pages    || [],
    characterDNA:        characterRef.characterDNA        || {},
    characterPromptCore: characterRef.characterPromptCore || "",
    characterSummary:    characterRef.characterSummary    || ""
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load generated image."));
    img.src = src;
  });
}

async function compressDataUrl(dataUrl, maxDimension = 700, quality = 0.72) {
  const img = await loadImage(dataUrl);
  let { width, height } = img;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  width  = Math.round(width  * scale);
  height = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width  = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

async function safeStoreImage(key, dataUrl, maxDimension = 700, quality = 0.72) {
  const compressed = await compressDataUrl(dataUrl, maxDimension, quality);
  sessionStorage.setItem(key, compressed);
  return compressed;
}

async function apiJson(url, options) {
  const res     = await fetch(url, options);
  const rawText = await res.text();
  let result;
  try { result = JSON.parse(rawText); }
  catch { throw new Error(`Server returned non-JSON response from ${url}`); }
  if (!res.ok) throw new Error(result?.message || result?.details || `Request failed: ${url}`);
  return result;
}

async function createBookRecordIfNeeded() {
  if (wizardData.bookId) return wizardData.bookId;

  const result = await apiJson(`${API_BASE}/api/books/create`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      childName:         wizardData.childName         || "",
      childAge:          wizardData.childAge          || "",
      childGender:       wizardData.childGender       || "",
      storyIdea:         wizardData.storyIdea         || "",
      illustrationStyle: wizardData.illustrationStyle || "Soft Storybook",
      croppedPhoto:      wizardData.croppedPhoto      || "",
      originalPhoto:     wizardData.originalPhoto     || ""
    })
  });

  const newBookId = result.bookId || "";
  updateBookData({ bookId: newBookId });
  return newBookId;
}

async function patchBook(bookId, patch) {
  if (!bookId) return;
  await apiJson(`${API_BASE}/api/books/${bookId}`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(patch)
  });
}

// ─── Step 1: Character reference ─────────────────────────────────────────────
async function generateCharacterReference(bookId) {
  setActiveStep(stepCharacter, "Creating character reference…");
  setProgress(5);

  const result = await apiJson(`${API_BASE}/generate-character-reference`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      child_photo:        wizardData.croppedPhoto,
      child_name:         wizardData.childName         || "",
      age:                wizardData.childAge          || "",
      gender:             wizardData.childGender       || "",
      illustration_style: wizardData.illustrationStyle || "Soft Storybook"
    })
  });

  const characterRef = {
    characterDNA:        result.characterDNA        || {},
    characterPromptCore: result.characterPromptCore || "",
    characterSummary:    result.characterSummary    || ""
  };

  if (result.characterSheetBase64) {
    const src = `data:image/png;base64,${result.characterSheetBase64}`;
    if (characterSheetPreview) characterSheetPreview.src = src;
    await safeStoreImage("characterSheetImage", src, 650, 0.68);
  }

  updateBookData({ characterReference: characterRef });
  await patchBook(bookId, { characterReference: characterRef });
  setProgress(15);
  return characterRef;
}

// ─── Step 2: Story text ──────────────────────────────────────────────────────
async function generateBookStory(bookId, characterRef) {
  setActiveStep(stepStory, "Building the story…");
  setProgress(20);

  const result = await apiJson(`${API_BASE}/create-book`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      child_name:         wizardData.childName         || "",
      age:                wizardData.childAge          || "",
      gender:             wizardData.childGender       || "",
      story_type:         wizardData.storyIdea         || "A magical adventure",
      illustration_style: wizardData.illustrationStyle || "Soft Storybook",
      character_reference: {
        characterDNA:        characterRef.characterDNA        || {},
        characterPromptCore: characterRef.characterPromptCore || "",
        characterSummary:    characterRef.characterSummary    || ""
      }
    })
  });

  const generatedBook = buildGeneratedBookData(result, characterRef);
  updateBookData({ generatedBook });
  await patchBook(bookId, { generatedBook });
  setProgress(30);
  return result;
}

// ─── Step 3: Cover image ─────────────────────────────────────────────────────
async function generateCoverImage(bookId, characterRef, bookResponse) {
  setActiveStep(stepPreview, "Creating the cover…");
  setProgress(35);

  const result = await apiJson(`${API_BASE}/generate-cover-image`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title:               bookResponse.title    || "",
      subtitle:            bookResponse.subtitle || "",
      story_type:          wizardData.storyIdea  || "",
      illustration_style:  wizardData.illustrationStyle || "Soft Storybook",
      characterPromptCore: characterRef.characterPromptCore || "",
      characterSummary:    characterRef.characterSummary    || ""
    })
  });

  if (result.coverImageBase64) {
    const rawCover = `data:image/png;base64,${result.coverImageBase64}`;
    const stored   = await safeStoreImage("coverImage", rawCover, 700, 0.7);
    await patchBook(bookId, { coverImage: stored });
    setProgress(40);
    return true;
  }

  if (wizardData.croppedPhoto) {
    sessionStorage.setItem("coverImage", wizardData.croppedPhoto);
    await patchBook(bookId, { coverImage: wizardData.croppedPhoto });
  }
  setProgress(40);
  return false;
}

// ─── Step 4: All page illustrations (parallel batches on server) ─────────────
async function generateAllPageImages(bookId) {
  setActiveStep(stepPreview, "Generating illustrations… (3 at a time)");
  setProgress(42);

  // Fire off the batch generation on the server
  const genPromise = apiJson(`${API_BASE}/api/books/${bookId}/generate-images`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" }
  });

  // Poll for progress while we wait
  const pollInterval = setInterval(async () => {
    try {
      const status = await apiJson(`${API_BASE}/api/books/${bookId}/image-status`);
      const pct = 42 + (status.ready / Math.max(1, status.total)) * 55;
      setProgress(pct);

      if (generateStatus) {
        generateStatus.textContent = `Generating illustrations… ${status.ready}/${status.total} ready`;
      }
    } catch { /* ignore polling errors */ }
  }, 3000);

  try {
    await genPromise;
    clearInterval(pollInterval);
    setProgress(97);

    if (generateStatus) {
      generateStatus.textContent = "All illustrations ready!";
    }
  } catch (err) {
    clearInterval(pollInterval);
    console.warn("Batch image gen had errors (partial results may be saved):", err.message);
    // Don't throw — partial images are fine, reader can generate missing ones
  }
}

// ─── Main button ─────────────────────────────────────────────────────────────
generateBookBtn?.addEventListener("click", async () => {
  try {
    generateBookBtn.disabled = true;

    if (generateStatus) generateStatus.textContent = "Starting generation…";
    setProgress(0);

    const bookId       = await createBookRecordIfNeeded();
    const characterRef = await generateCharacterReference(bookId);
    const bookResponse = await generateBookStory(bookId, characterRef);
    await generateCoverImage(bookId, characterRef, bookResponse);
    await generateAllPageImages(bookId);

    updateBookData({ purchaseUnlocked: false });
    setProgress(100);

    if (generateStatus) generateStatus.textContent = "Done! Redirecting…";

    setTimeout(() => {
      window.location.href = `cover.html?bookId=${encodeURIComponent(bookId)}`;
    }, 600);
  } catch (error) {
    console.error("generate.js failed:", error);
    if (generateStatus) generateStatus.textContent = error.message || "Something went wrong.";
    generateBookBtn.disabled = false;
  }
});

backToSetupBtn?.addEventListener("click", () => {
  window.location.href = "setup.html";
});

backToCropBtn?.addEventListener("click", () => {
  window.location.href = "crop.html";
});
