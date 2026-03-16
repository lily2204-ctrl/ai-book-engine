const API_BASE = window.location.origin;

const rawSetup = localStorage.getItem("bookSetupData");
const croppedPhoto = localStorage.getItem("croppedPhoto");

const generateBookBtn = document.getElementById("generateBookBtn");
const backToSetupBtn = document.getElementById("backToSetupBtn");
const backToCropBtn = document.getElementById("backToCropBtn");
const generateStatus = document.getElementById("generateStatus");

const stepCharacter = document.getElementById("stepCharacter");
const stepStory = document.getElementById("stepStory");
const stepPreview = document.getElementById("stepPreview");

const uploadedPhotoPreview = document.getElementById("uploadedPhotoPreview");
const characterSheetPreview = document.getElementById("characterSheetPreview");

if (!rawSetup || !croppedPhoto) {
  window.location.href = "setup.html";
}

const setupData = JSON.parse(rawSetup);

uploadedPhotoPreview.src = croppedPhoto;

function setActiveStep(stepElement, text) {
  [stepCharacter, stepStory, stepPreview].forEach((el) => el.classList.remove("active"));
  stepElement.classList.add("active");
  generateStatus.textContent = text;
}

function buildBookDataPayload(bookResponse, characterRef) {
  return {
    childName: setupData.childName || "",
    childAge: setupData.childAge || "",
    childGender: setupData.childGender || "",
    storyIdea: setupData.storyIdea || "",
    illustration_style: setupData.illustrationStyle || "Soft Storybook",
    title: bookResponse.title,
    subtitle: bookResponse.subtitle,
    pages: bookResponse.pages || [],
    characterDNA: characterRef.characterDNA,
    characterPromptCore: characterRef.characterPromptCore,
    characterSummary: characterRef.characterSummary,
    characterSheetBase64: characterRef.characterSheetBase64,
    croppedPhoto
  };
}

async function generateCharacterReference() {
  setActiveStep(stepCharacter, "Creating character reference...");

  const res = await fetch(`${API_BASE}/generate-character-reference`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      child_photo: croppedPhoto,
      child_name: setupData.childName || "",
      age: setupData.childAge || "",
      gender: setupData.childGender || "",
      illustration_style: setupData.illustrationStyle || "Soft Storybook"
    })
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || "Failed to create character reference");
  }

  if (data.characterSheetBase64) {
    characterSheetPreview.src = `data:image/png;base64,${data.characterSheetBase64}`;
  }

  localStorage.setItem("characterReference", JSON.stringify(data));
  return data;
}

async function generateBook(characterRef) {
  setActiveStep(stepStory, "Building the story structure...");

  const res = await fetch(`${API_BASE}/create-book`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      child_name: setupData.childName || "",
      age: setupData.childAge || "",
      gender: setupData.childGender || "",
      story_type: setupData.storyIdea || "A magical adventure",
      illustration_style: setupData.illustrationStyle || "Soft Storybook",
      character_reference: characterRef
    })
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || "Failed to generate book");
  }

  return data;
}

generateBookBtn.addEventListener("click", async () => {
  try {
    generateBookBtn.disabled = true;

    const characterRef = await generateCharacterReference();
    const bookResponse = await generateBook(characterRef);

    setActiveStep(stepPreview, "Preparing cover and preview...");

    const bookData = buildBookDataPayload(bookResponse, characterRef);
    localStorage.setItem("bookData", JSON.stringify(bookData));

    setTimeout(() => {
      window.location.href = "cover.html";
    }, 700);
  } catch (error) {
    generateStatus.textContent = error.message || "Something went wrong.";
    generateBookBtn.disabled = false;
  }
});

backToSetupBtn.addEventListener("click", () => {
  window.location.href = "setup.html";
});

backToCropBtn.addEventListener("click", () => {
  window.location.href = "crop.html";
});
