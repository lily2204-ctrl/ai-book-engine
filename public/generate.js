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

function getFriendlyErrorMessage(error) {
  const raw = String(error?.message || "").toLowerCase();

  if (raw.includes("quota") || raw.includes("billing") || raw.includes("insufficient_quota")) {
    return "The AI image/story quota has been exceeded. Please add credits or enable billing in OpenAI, then try again.";
  }

  if (raw.includes("character generation failed")) {
    return "Failed to generate the character from the uploaded image. Please go back and try another photo.";
  }

  if (raw.includes("book generation failed")) {
    return "Failed to generate the story. Please try again in a moment.";
  }

  return error?.message || "Something went wrong while generating the book.";
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

    if (setupData.croppedPhoto) {
      setStepState(stepCharacter, "active");

      const charRes = await fetch(`${API_BASE}/generate-character`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          child_photo: setupData.croppedPhoto,
          illustration_style: setupData.illustrationStyle
        })
      });

      const charJson = await charRes.json();

      if (!charRes.ok) {
        throw new Error(charJson?.message || "Character generation failed");
      }

      characterData = charJson;
      setStepState(stepCharacter, "done");
    } else {
      setStepState(stepCharacter, "done");
    }

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
      throw new Error(bookJson?.message || "Book generation failed");
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
    bookJson.croppedPhoto = setupData.croppedPhoto;

    localStorage.setItem("bookData", JSON.stringify(bookJson));

    setStepState(stepStory, "done");
    setStepState(stepCover, "active");

    setTimeout(() => {
      setStepState(stepCover, "done");
      window.location.href = "cover.html";
    }, 900);

  } catch (error) {
    console.error(error);
    generateError.textContent = getFriendlyErrorMessage(error);
  }
}

runGenerationFlow();
