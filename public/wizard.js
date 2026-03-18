import { clearBookData, getBookData, updateBookData } from "./js/state.js";

const openPhotoModal = document.getElementById("openPhotoModal");
const photoModal = document.getElementById("photoModal");
const closePhotoModal = document.getElementById("closePhotoModal");
const goToSetupBtn = document.getElementById("goToSetupBtn");

const cameraInput = document.getElementById("cameraInput");
const galleryInput = document.getElementById("galleryInput");

const childNameInput = document.getElementById("childName");
const childAgeInput = document.getElementById("childAge");
const childGenderInput = document.getElementById("childGender");
const storyIdeaInput = document.getElementById("storyIdea");

const styleCards = document.querySelectorAll(".style-card");

function getSelectedStyle() {
  const activeStyle = document.querySelector(".style-card.active");
  return activeStyle?.dataset?.style || "Soft Storybook";
}

function saveSetupData() {
  const childName = childNameInput?.value.trim() || "";
  const childAge = childAgeInput?.value || "";
  const childGender = childGenderInput?.value || "";
  const storyIdea = storyIdeaInput?.value.trim() || "";
  const illustrationStyle = getSelectedStyle();

  return updateBookData({
    childName,
    childAge,
    childGender,
    storyIdea,
    illustrationStyle
  });
}

function validateSetupData() {
  const childName = childNameInput?.value.trim() || "";
  const childAge = childAgeInput?.value || "";
  const childGender = childGenderInput?.value || "";
  const storyIdea = storyIdeaInput?.value.trim() || "";

  if (!childName) {
    alert("Please enter the child name.");
    return false;
  }

  if (!childAge) {
    alert("Please select the child age.");
    return false;
  }

  if (!childGender) {
    alert("Please select the child gender.");
    return false;
  }

  if (!storyIdea) {
    alert("Please add a short story direction.");
    return false;
  }

  return true;
}

function restoreSetupData() {
  const data = getBookData();

  if (data.childName && childNameInput) {
    childNameInput.value = data.childName;
  }

  if (data.childAge && childAgeInput) {
    childAgeInput.value = data.childAge;
  }

  if (data.childGender && childGenderInput) {
    childGenderInput.value = data.childGender;
  }

  if (data.storyIdea && storyIdeaInput) {
    storyIdeaInput.value = data.storyIdea;
  }

  const selectedStyle = data.illustrationStyle || "Soft Storybook";

  styleCards.forEach((card) => {
    const isMatch = card.dataset.style === selectedStyle;
    card.classList.toggle("active", isMatch);
  });
}

function bindStyleSelection() {
  styleCards.forEach((card) => {
    card.addEventListener("click", () => {
      styleCards.forEach((item) => item.classList.remove("active"));
      card.classList.add("active");
      saveSetupData();
    });
  });
}

function openModal() {
  photoModal?.classList.remove("hidden");
}

function closeModal() {
  photoModal?.classList.add("hidden");
}

openPhotoModal?.addEventListener("click", () => {
  saveSetupData();
  openModal();
});

closePhotoModal?.addEventListener("click", closeModal);

photoModal?.addEventListener("click", (e) => {
  if (e.target === photoModal) {
    closeModal();
  }
});

goToSetupBtn?.addEventListener("click", () => {
  if (!validateSetupData()) return;
  saveSetupData();
  openModal();
});

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load selected image."));
    img.src = src;
  });
}

async function compressImageDataUrl(dataUrl, maxDimension = 1200, quality = 0.82) {
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

async function handleSelectedFile(file) {
  if (!file) return;

  try {
    const rawDataUrl = await fileToDataURL(file);
    const compressed = await compressImageDataUrl(rawDataUrl, 1200, 0.82);

    saveSetupData();

    updateBookData({
      originalPhoto: compressed,
      croppedPhoto: ""
    });

    closeModal();
    window.location.href = "crop.html";
  } catch (error) {
    alert(error.message || "Something went wrong while loading the image.");
  }
}

cameraInput?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  await handleSelectedFile(file);

  // reset so the same file can be chosen again if needed
  e.target.value = "";
});

galleryInput?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  await handleSelectedFile(file);

  // reset so the same file can be chosen again if needed
  e.target.value = "";
});

document.addEventListener("DOMContentLoaded", () => {
  clearBookData();
  restoreSetupData();
  bindStyleSelection();
});
