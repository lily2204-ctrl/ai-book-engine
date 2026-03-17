import { getBookData } from "./js/state.js";

const backToCropBtn = document.getElementById("backToCrop");
const continueToStoryBtn = document.getElementById("continueToStoryBtn");
const previewCroppedPhoto = document.getElementById("previewCroppedPhoto");
const setupSummary = document.getElementById("setupSummary");

const data = getBookData();

if (!data.croppedPhoto) {
  window.location.href = "crop.html";
}

if (previewCroppedPhoto) {
  previewCroppedPhoto.src = data.croppedPhoto;
}

if (setupSummary) {
  setupSummary.innerHTML = `
    <div class="summary-row">
      <span class="summary-label">Child name</span>
      <span class="summary-value">${data.childName || "-"}</span>
    </div>

    <div class="summary-row">
      <span class="summary-label">Age</span>
      <span class="summary-value">${data.childAge || "-"}</span>
    </div>

    <div class="summary-row">
      <span class="summary-label">Gender</span>
      <span class="summary-value">${data.childGender || "-"}</span>
    </div>

    <div class="summary-row">
      <span class="summary-label">Illustration style</span>
      <span class="summary-value">${data.illustrationStyle || "-"}</span>
    </div>

    <div class="summary-row summary-row-text">
      <span class="summary-label">Story direction</span>
      <span class="summary-value">${data.storyIdea || "-"}</span>
    </div>
  `;
}

backToCropBtn?.addEventListener("click", () => {
  window.location.href = "crop.html";
});

continueToStoryBtn?.addEventListener("click", () => {
  window.location.href = "generate.html";
});
