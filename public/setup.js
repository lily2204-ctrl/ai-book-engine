import { getBookData, updateBookData } from "./js/state.js";

const backToCropBtn = document.getElementById("backToCrop");
const previewCroppedPhoto = document.getElementById("previewCroppedPhoto");
const childNameInput = document.getElementById("childName");
const childAgeSelect = document.getElementById("childAge");
const childGenderSelect = document.getElementById("childGender");
const storyIdeaTextarea = document.getElementById("storyIdea");
const continueToStoryBtn = document.getElementById("continueToStoryBtn");
const setupError = document.getElementById("setupError");
const styleSelectorGrid = document.getElementById("styleSelectorGrid");

const data = getBookData();
const croppedPhoto = data.croppedPhoto;

if (!croppedPhoto) {
  window.location.href = "crop.html";
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
  "Modern Picture Book",
];

let selectedStyle = data.illustrationStyle || "Soft Storybook";

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

if (data.childName) childNameInput.value = data.childName;
if (data.childAge) childAgeSelect.value = data.childAge;
if (data.childGender) childGenderSelect.value = data.childGender;
if (data.storyIdea) storyIdeaTextarea.value = data.storyIdea;

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

  updateBookData({
    childName,
    childAge,
    childGender,
    illustrationStyle: selectedStyle,
    storyIdea,
    croppedPhoto,
  });

  window.location.href = "generate.html";
});
