import { clearBookData, getBookData, updateBookData } from "./js/state.js";

const openPhotoModal = document.getElementById("openPhotoModal");
const photoModal = document.getElementById("photoModal");
const closePhotoModal = document.getElementById("closePhotoModal");
const takePhotoBtn = document.getElementById("takePhotoBtn");
const chooseGalleryBtn = document.getElementById("chooseGalleryBtn");
const goToSetupBtn = document.getElementById("goToSetupBtn");

function saveSetupData() {
  const childName = document.getElementById("childName")?.value.trim() || "";
  const childAge = document.getElementById("childAge")?.value || "";
  const childGender = document.getElementById("childGender")?.value || "";
  const storyIdea = document.getElementById("storyIdea")?.value.trim() || "";

  const activeStyle = document.querySelector(".style-card.active");
  const illustrationStyle = activeStyle?.dataset?.style || "Soft Storybook";

  return updateBookData({
    childName,
    childAge,
    childGender,
    storyIdea,
    illustrationStyle
  });
}

function validateSetupData() {
  const childName = document.getElementById("childName")?.value.trim() || "";
  const childAge = document.getElementById("childAge")?.value || "";
  const storyIdea = document.getElementById("storyIdea")?.value.trim() || "";

  if (!childName) {
    alert("Please enter the child name.");
    return false;
  }

  if (!childAge) {
    alert("Please select the child age.");
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

  if (data.childName && document.getElementById("childName")) {
    document.getElementById("childName").value = data.childName;
  }

  if (data.childAge && document.getElementById("childAge")) {
    document.getElementById("childAge").value = data.childAge;
  }

  if (data.childGender && document.getElementById("childGender")) {
    document.getElementById("childGender").value = data.childGender;
  }

  if (data.storyIdea && document.getElementById("storyIdea")) {
    document.getElementById("storyIdea").value = data.storyIdea;
  }

  if (data.illustrationStyle) {
    const target = document.querySelector(`.style-card[data-style="${data.illustrationStyle}"]`);
    if (target) {
      document.querySelectorAll(".style-card").forEach((card) => card.classList.remove("active"));
      target.classList.add("active");
    }
  }
}

function openModal() {
  photoModal?.classList.remove("hidden");
}

function closeModal() {
  photoModal?.classList.add("hidden");
}

openPhotoModal?.addEventListener("click", openModal);
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

function openNativePicker({ useCamera = false } = {}) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";

  if (useCamera) {
    input.setAttribute("capture", "environment");
  }

  input.style.position = "fixed";
  input.style.left = "-9999px";
  input.style.top = "-9999px";

  document.body.appendChild(input);

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    document.body.removeChild(input);
    await handleSelectedFile(file);
  });

  input.click();
}

takePhotoBtn?.addEventListener("click", () => {
  openNativePicker({ useCamera: true });
});

chooseGalleryBtn?.addEventListener("click", () => {
  openNativePicker({ useCamera: false });
});

document.addEventListener("DOMContentLoaded", () => {
  clearBookData();
  restoreSetupData();
});
