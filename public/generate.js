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

const generateBookBtn = document.getElementById("generateBookBtn");
const backToSetupBtn = document.getElementById("backToSetupBtn");
const backToCropBtn = document.getElementById("backToCropBtn");
const generateStatus = document.getElementById("generateStatus");

const stepCharacter = document.getElementById("stepCharacter");
const stepStory = document.getElementById("stepStory");
const stepPreview = document.getElementById("stepPreview");

const uploadedPhotoPreview = document.getElementById("uploadedPhotoPreview");
const characterSheetPreview = document.getElementById("characterSheetPreview");

if (uploadedPhotoPreview) {
  uploadedPhotoPreview.src = wizardData.croppedPhoto;
}

function setActiveStep(stepElement, text) {
  [stepCharacter, stepStory, stepPreview].forEach((el) => {
    if (el) el.classList.remove("active");
  });

  if (stepElement) {
    stepElement.classList.add("active");
  }

  if (generateStatus) {
    generateStatus.textContent = text;
  }
}

function buildGeneratedBookData(bookResponse, characterRef) {
  return {
    title: bookResponse.title || "",
    subtitle: bookResponse.subtitle || "",
    pages: bookResponse.pages || [],
    characterDNA: characterRef.characterDNA || {},
    characterPromptCore: characterRef.characterPromptCore || "",
    characterSummary: characterRef.characterSummary || ""
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load generated image."));
    img.src = src;
  });
}

async function compressDataUrl(dataUrl, maxDimension = 700, quality = 0.72) {
  const img = await loadImage(dataUrl);

  let { width, height } = img;
  const scale = Math.min(1, maxDimension / Math.max(width, height));

  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", quality);
}

async function safeStoreImage(key, dataUrl, maxDimension = 700, quality = 0.72) {
  const compressed = await compressDataUrl(dataUrl, maxDimension, quality);
  sessionStorage.setItem(key, compressed);
  return compressed;
}

async function apiJson(url, options) {
  const res = await fetch(url, options);
  const rawText = await res.text();

  let result;
  try {
    result = JSON.parse(rawText);
  } catch {
    throw new Error(`Server returned non-JSON response from ${url}`);
  }

  if (!res.ok) {
    throw new Error(result?.message || result?.details || `Request failed: ${url}`);
  }

  return result;
}

async function createBookRecordIfNeeded() {
  if (wizardData.bookId) {
    return wizardData.bookId;
  }

  const result = await apiJson(`${API_BASE}/api/books/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      childName: wizardData.childName || "",
      childAge: wizardData.childAge || "",
      childGender: wizardData.childGender || "",
      storyIdea: wizardData.storyIdea || "",
      illustrationStyle: wizardData.illustrationStyle || "Soft Storybook",
      croppedPhoto: wizardData.croppedPhoto || "",
      originalPhoto: wizardData.originalPhoto || ""
    })
  });

  const newBookId = result.bookId || "";

  updateBookData({
    bookId: newBookId
  });

  return newBookId;
}

async function patchBook(bookId, patch) {
  if (!bookId) return;

  await apiJson(`${API_BASE}/api/books/${bookId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(patch)
  });
}

async function generateCharacterReference(bookId) {
  setActiveStep(stepCharacter, "Creating character reference...");

  const result = await apiJson(`${API_BASE}/generate-character-reference`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      child_photo: wizardData.croppedPhoto,
      child_name: wizardData.childName || "",
      age: wizardData.childAge || "",
      gender: wizardData.childGender || "",
      illustration_style: wizardData.illustrationStyle || "Soft Storybook"
    })
  });

  const characterRef = {
    characterDNA: result.characterDNA || {},
    characterPromptCore: result.characterPromptCore || "",
    characterSummary: result.characterSummary || ""
  };

  if (result.characterSheetBase64) {
    const characterSheetImage = `data:image/png;base64,${result.characterSheetBase64}`;

    if (characterSheetPreview) {
      characterSheetPreview.src = characterSheetImage;
    }

    await safeStoreImage("characterSheetImage", characterSheetImage, 650, 0.68);
  } else {
    sessionStorage.removeItem("characterSheetImage");
  }

  updateBookData({
    characterReference: characterRef
  });

  await patchBook(bookId, {
    characterReference: characterRef
  });

  return characterRef;
}

async function generateBookStory(bookId, characterRef) {
  setActiveStep(stepStory, "Building the story structure...");

  const result = await apiJson(`${API_BASE}/create-book`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      child_name: wizardData.childName || "",
      age: wizardData.childAge || "",
      gender: wizardData.childGender || "",
      story_type: wizardData.storyIdea || "A magical adventure",
      illustration_style: wizardData.illustrationStyle || "Soft Storybook",
      character_reference: {
        characterDNA: characterRef.characterDNA || {},
        characterPromptCore: characterRef.characterPromptCore || "",
        characterSummary: characterRef.characterSummary || ""
      }
    })
  });

  const generatedBook = buildGeneratedBookData(result, characterRef);

  updateBookData({
    generatedBook
  });

  await patchBook(bookId, {
    generatedBook
  });

  return result;
}

async function generateCoverImage(bookId, characterRef, bookResponse) {
  setActiveStep(stepPreview, "Creating the final cover image...");

  const result = await apiJson(`${API_BASE}/generate-cover-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      title: bookResponse.title || "",
      subtitle: bookResponse.subtitle || "",
      story_type: wizardData.storyIdea || "",
      illustration_style: wizardData.illustrationStyle || "Soft Storybook",
      characterPromptCore: characterRef.characterPromptCore || "",
      characterSummary: characterRef.characterSummary || ""
    })
  });

  if (result.coverImageBase64) {
    const rawCoverImage = `data:image/png;base64,${result.coverImageBase64}`;
    const storedCoverImage = await safeStoreImage("coverImage", rawCoverImage, 700, 0.7);

    await patchBook(bookId, {
      coverImage: storedCoverImage
    });

    return true;
  }

  if (wizardData.croppedPhoto) {
    sessionStorage.setItem("coverImage", wizardData.croppedPhoto);

    await patchBook(bookId, {
      coverImage: wizardData.croppedPhoto
    });
  }

  return false;
}

generateBookBtn?.addEventListener("click", async () => {
  try {
    generateBookBtn.disabled = true;

    if (generateStatus) {
      generateStatus.textContent = "Starting generation...";
    }

    const bookId = await createBookRecordIfNeeded();
    const characterRef = await generateCharacterReference(bookId);
    const bookResponse = await generateBookStory(bookId, characterRef);
    await generateCoverImage(bookId, characterRef, bookResponse);

    updateBookData({
      purchaseUnlocked: false
    });

    setTimeout(() => {
      window.location.href = `cover.html?bookId=${encodeURIComponent(bookId)}`;
    }, 500);
  } catch (error) {
    console.error("generate.js failed:", error);

    if (generateStatus) {
      generateStatus.textContent = error.message || "Something went wrong.";
    }

    generateBookBtn.disabled = false;
  }
});

backToSetupBtn?.addEventListener("click", () => {
  window.location.href = "setup.html";
});

backToCropBtn?.addEventListener("click", () => {
  window.location.href = "crop.html";
});
