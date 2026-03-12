const API_BASE = window.location.origin;

const stepCharacter = document.getElementById("stepCharacter");
const stepStory = document.getElementById("stepStory");
const stepCover = document.getElementById("stepCover");
const generateError = document.getElementById("generateError");

function setStepState(stepElement, state) {
  stepElement.classList.remove("active", "done");
  if (state === "active") stepElement.classList.add("active");
  if (state === "done") stepElement.classList.add("done");
}

function getFriendlyErrorMessage(errorMessage) {
  const raw = String(errorMessage || "").toLowerCase();

  if (raw.includes("quota") || raw.includes("billing") || raw.includes("insufficient_quota")) {
    return "The AI image/story quota has been exceeded. Please add credits or enable billing in OpenAI, then try again.";
  }

  if (raw.includes("missing child_photo")) {
    return "The uploaded child image was not found. Please go back and upload the photo again.";
  }

  if (raw.includes("character generation failed")) {
    return "Failed to generate the child character. Please try another image or try again in a moment.";
  }

  if (raw.includes("book generation failed")) {
    return "Failed to generate the story. Please try again in a moment.";
  }

  if (raw.includes("image generation failed")) {
    return "Failed to generate the illustration. Please try again in a moment.";
  }

  return errorMessage || "Something went wrong while generating the book.";
}

async function readIndexedDBCroppedPhoto() {
  try {
    const request = indexedDB.open("lifebookDB", 1);

    const db = await new Promise((resolve, reject) => {
      request.onupgradeneeded = function () {
        const upgradeDb = request.result;
        if (!upgradeDb.objectStoreNames.contains("images")) {
          upgradeDb.createObjectStore("images");
        }
      };

      request.onsuccess = function () {
        resolve(request.result);
      };

      request.onerror = function () {
        reject(request.error || new Error("Failed to open IndexedDB"));
      };
    });

    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("images", "readonly");
      const store = transaction.objectStore("images");
      const getRequest = store.get("croppedPhoto");

      getRequest.onsuccess = function () {
        resolve(getRequest.result || null);
      };

      getRequest.onerror = function () {
        reject(getRequest.error || new Error("Failed to read cropped photo"));
      };
    });
  } catch (error) {
    console.warn("Failed reading cropped photo from IndexedDB:", error);
    return null;
  }
}

async function runGenerationFlow() {
  const rawSetup = localStorage.getItem("bookSetupData");

  if (!rawSetup) {
    window.location.href = "setup.html";
    return;
  }

  const setupData = JSON.parse(rawSetup);

  try {
    let characterData = null;

    let childPhoto = setupData.croppedPhoto || localStorage.getItem("croppedPhoto");
    if (!childPhoto) {
      childPhoto = await readIndexedDBCroppedPhoto();
    }

    if (!childPhoto) {
      throw new Error("Missing child_photo");
    }

    setStepState(stepCharacter, "active");

    const charRes = await fetch(`${API_BASE}/generate-character`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        child_photo: childPhoto,
        illustration_style: setupData.illustrationStyle
      })
    });

    const charJson = await charRes.json();

    if (!charRes.ok) {
      throw new Error(charJson?.details || charJson?.message || "Character generation failed");
    }

    characterData = charJson;
    setStepState(stepCharacter, "done");

    setStepState(stepStory, "active");

    const bookRes = await fetch(`${API_BASE}/create-book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        child_name: setupData.childName,
        age: setupData.childAge,
        story_type: setupData.storyIdea,
        illustration_style: setupData.illustrationStyle,
        child_gender: setupData.childGender
      })
    });

    const bookJson = await bookRes.json();

    if (!bookRes.ok) {
      throw new Error(bookJson?.details || bookJson?.message || "Book generation failed");
    }

    if (characterData) {
      bookJson.characterImageBase64 = characterData.characterImageBase64;
      bookJson.characterDescription = characterData.characterDescription;
      bookJson.characterDNA = characterData.characterDNA;
    }

    bookJson.childName = setupData.childName;
    bookJson.childAge = setupData.childAge;
    bookJson.childGender = setupData.childGender;
    bookJson.storyIdea = setupData.storyIdea;
    bookJson.illustration_style = setupData.illustrationStyle;
    bookJson.croppedPhoto = childPhoto;

    localStorage.setItem("bookData", JSON.stringify(bookJson));

    setStepState(stepStory, "done");
    setStepState(stepCover, "active");

    setTimeout(() => {
      setStepState(stepCover, "done");
      window.location.href = "cover.html";
    }, 900);
  } catch (error) {
    console.error(error);
    generateError.textContent = getFriendlyErrorMessage(error?.message || "");
  }
}

runGenerationFlow();
