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

async function generateCharacterReference() {
  setActiveStep(stepCharacter, "Creating character reference...");

  const res = await fetch(`${API_BASE}/generate-character-reference`, {
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

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result?.message || "Failed to create character reference");
  }

  let characterSheetImage = "";

  if (result.characterSheetBase64) {
    characterSheetImage = `data:image/png;base64,${result.characterSheetBase64}`;

    if (characterSheetPreview) {
      characterSheetPreview.src = characterSheetImage;
    }
  }

  const characterRef = {
  characterDNA: result.characterDNA || {},
  characterPromptCore: result.characterPromptCore || "",
  characterSummary: result.characterSummary || ""
};

  return characterRef;
}

async function generateBook(characterRef) {
  setActiveStep(stepStory, "Building the story structure...");

  const res = await fetch(`${API_BASE}/create-book`, {
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

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result?.message || "Failed to generate book");
  }

  return result;
}

generateBookBtn?.addEventListener("click", async () => {
  try {
    generateBookBtn.disabled = true;

    if (generateStatus) {
      generateStatus.textContent = "Starting generation...";
    }

    const characterRef = await generateCharacterReference();
    const bookResponse = await generateBook(characterRef);

    setActiveStep(stepPreview, "Preparing cover and preview...");

    const generatedBook = buildGeneratedBookData(bookResponse, characterRef);

    updateBookData({
      generatedBook
    });

    setTimeout(() => {
      window.location.href = "cover.html";
    }, 700);
  } catch (error) {
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
