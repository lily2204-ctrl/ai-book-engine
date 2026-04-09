import { clearBookData, getBookData, updateBookData } from "./js/state.js";

const openPhotoModal  = document.getElementById("openPhotoModal");
const photoModal      = document.getElementById("photoModal");
const closePhotoModal = document.getElementById("closePhotoModal");
const goToSetupBtn    = document.getElementById("goToSetupBtn");

const cameraInput  = document.getElementById("cameraInput");
const galleryInput = document.getElementById("galleryInput");

const childNameInput   = document.getElementById("childName");
const childAgeInput    = document.getElementById("childAge");
const childGenderInput = document.getElementById("childGender");
const storyIdeaInput   = document.getElementById("storyIdea");

const styleCards = document.querySelectorAll(".style-card");

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getSelectedStyle() {
  const activeStyle = document.querySelector(".style-card.active");
  return activeStyle?.dataset?.style || "Soft Storybook";
}

function saveSetupData() {
  return updateBookData({
    bookId:            "",
    childName:         childNameInput?.value.trim()  || "",
    childAge:          childAgeInput?.value          || "",
    childGender:       childGenderInput?.value       || "",
    storyIdea:         storyIdeaInput?.value.trim()  || "",
    illustrationStyle: getSelectedStyle()
  });
}

function validateSetupData() {
  const childName   = childNameInput?.value.trim()  || "";
  const childAge    = childAgeInput?.value          || "";
  const childGender = childGenderInput?.value       || "";
  const storyIdea   = storyIdeaInput?.value.trim()  || "";

  if (!childName)   { showError("Please enter the child's name.");      return false; }
  if (!childAge)    { showError("Please select the child's age.");      return false; }
  if (!childGender) { showError("Please select the child's gender.");   return false; }
  if (!storyIdea)   { showError("Please add a short story direction."); return false; }

  return true;
}

// ─── Friendly inline error instead of alert ───────────────────────────────────
function showError(msg) {
  let el = document.getElementById("wizardError");
  if (!el) {
    el = document.createElement("div");
    el.id = "wizardError";
    el.style.cssText = `
      margin-top:14px; padding:14px 18px; border-radius:16px;
      background:rgba(220,60,60,0.12); border:1px solid rgba(220,60,60,0.3);
      color:#ffb3b3; font-size:15px; font-weight:600;
    `;
    goToSetupBtn?.parentElement?.insertBefore(el, goToSetupBtn);
  }
  el.textContent = "⚠️  " + msg;
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 4000);
}

function restoreSetupData() {
  const data = getBookData();
  if (data.childName    && childNameInput)   childNameInput.value   = data.childName;
  if (data.childAge     && childAgeInput)    childAgeInput.value    = data.childAge;
  if (data.childGender  && childGenderInput) childGenderInput.value = data.childGender;
  if (data.storyIdea    && storyIdeaInput)   storyIdeaInput.value   = data.storyIdea;

  const selectedStyle = data.illustrationStyle || "Soft Storybook";
  styleCards.forEach(card => card.classList.toggle("active", card.dataset.style === selectedStyle));
}

function bindStyleSelection() {
  styleCards.forEach(card => {
    card.addEventListener("click", () => {
      styleCards.forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      saveSetupData();
    });
  });
}

// ─── Modal ────────────────────────────────────────────────────────────────────
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
photoModal?.addEventListener("click", e => {
  if (e.target === photoModal) closeModal();
});

// ─── FIX: Continue button ─────────────────────────────────────────────────────
// OLD: opened modal again after validation (blocked users without photo)
// NEW: validates → if photo exists go to crop, else open modal to pick photo
goToSetupBtn?.addEventListener("click", () => {
  if (!validateSetupData()) return;
  saveSetupData();

  const existing = getBookData();

  if (existing.originalPhoto) {
    window.location.href = "crop.html";
    return;
  }

  openModal();
});

// ─── File handling ────────────────────────────────────────────────────────────
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load selected image."));
    img.src = src;
  });
}

async function compressImageDataUrl(dataUrl, maxDimension = 1200, quality = 0.82) {
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

async function handleSelectedFile(file) {
  if (!file) return;

  const uploadDrop  = document.getElementById("openPhotoModal");
  const uploadTitle = uploadDrop?.querySelector(".upload-title");

  if (uploadDrop)  uploadDrop.style.opacity = "0.6";
  if (uploadTitle) uploadTitle.textContent  = "Loading photo…";

  try {
    const rawDataUrl = await fileToDataURL(file);
    const compressed = await compressImageDataUrl(rawDataUrl, 1200, 0.82);

    saveSetupData();

    updateBookData({
      bookId:             "",
      originalPhoto:      compressed,
      croppedPhoto:       "",
      characterReference: null,
      generatedBook:      null,
      purchaseUnlocked:   false
    });

    closeModal();

    setTimeout(() => {
      window.location.href = "crop.html";
    }, 150);

  } catch (error) {
    if (uploadDrop)  uploadDrop.style.opacity  = "1";
    if (uploadTitle) uploadTitle.textContent   = "Add photo";
    showError(error.message || "Something went wrong loading the image.");
  }
}

cameraInput?.addEventListener("change", async e => {
  const file = e.target.files?.[0];
  await handleSelectedFile(file);
  e.target.value = "";
});

galleryInput?.addEventListener("change", async e => {
  const file = e.target.files?.[0];
  await handleSelectedFile(file);
  e.target.value = "";
});

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  clearBookData();
  restoreSetupData();
  bindStyleSelection();
});
