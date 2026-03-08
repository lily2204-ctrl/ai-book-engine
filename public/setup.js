const backToCropBtn = document.getElementById("backToCrop");
const previewCroppedPhoto = document.getElementById("previewCroppedPhoto");
const childNameInput = document.getElementById("childName");
const childAgeSelect = document.getElementById("childAge");
const childGenderSelect = document.getElementById("childGender");
const storyIdeaTextarea = document.getElementById("storyIdea");
const continueToStoryBtn = document.getElementById("continueToStoryBtn");
const setupError = document.getElementById("setupError");
const styleSelectorGrid = document.getElementById("styleSelectorGrid");

const croppedPhoto = localStorage.getItem("croppedPhoto");

if (!croppedPhoto) {
  window.location.href = "wizard.html";
}

previewCroppedPhoto.src = croppedPhoto;

for (let age = 1; age <= 10; age++) {
  const option = document.createElement("option");
  option.value = String(age);
  option.textContent = String(age);
  if (age === 5) option.selected = true;
  childAgeSelect.appendChild(option);
}

const illustrationStyles = [
  "Soft Storybook",
  "Pixar 3D",
  "Magical Fantasy",
  "Minimal Scandinavian",
  "Classic Fairytale",
  "Whimsical Watercolor",
  "Gentle Pastel",
  "Modern Picture Book"
];

let selectedStyle = "Soft Storybook";

function renderStyleOptions() {
  styleSelectorGrid.innerHTML = "";

  illustrationStyles.forEach((style) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "style-option";
    if (style === selectedStyle) {
      button.classList.add("active");
    }
    button.textContent = style;

    button.addEventListener("click", () => {
      selectedStyle = style;
      renderStyleOptions();
    });

    styleSelectorGrid.appendChild(button);
  });
}

renderStyleOptions();

const existingSetup = localStorage.getItem("bookSetupData");
if (existingSetup) {
  try {
    const parsed = JSON.parse(existingSetup);

    if (parsed.childName) childNameInput.value = parsed.childName;
    if (parsed.childAge) childAgeSelect.value = parsed.childAge;
    if (parsed.childGender) childGenderSelect.value = parsed.childGender;
    if (parsed.storyIdea) storyIdeaTextarea.value = parsed.storyIdea;
    if (parsed.illustrationStyle) {
      selectedStyle = parsed.illustrationStyle;
      renderStyleOptions();
    }
  } catch (error) {
    console.error("Failed to parse saved setup data");
  }
}

backToCropBtn.addEventListener("click", () => {
  window.location.href = "crop.html";
});

continueToStoryBtn.addEventListener("click", () => {
  const childName = childNameInput.value.trim();
  const childAge = childAgeSelect.value;
  const childGender = childGenderSelect.value;
  const storyIdea = storyIdeaTextarea.value.trim();

  setupError.textContent = "";

  if (!childName) {
    setupError.textContent = "Please enter the child's name.";
    return;
  }

  if (!childGender) {
    setupError.textContent = "Please select a gender.";
    return;
  }

  if (!storyIdea || storyIdea.length < 12) {
    setupError.textContent = "Please write at least a short story idea.";
    return;
  }

  const setupData = {
    childName,
    childAge,
    childGender,
    illustrationStyle: selectedStyle,
    storyIdea,
    croppedPhoto
  };

  localStorage.setItem("bookSetupData", JSON.stringify(setupData));

  alert("Stage 2 complete. Next step will generate the story structure.");
});
