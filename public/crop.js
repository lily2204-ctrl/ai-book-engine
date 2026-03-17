const cropCanvas = document.getElementById("cropCanvas");
const cropCtx = cropCanvas.getContext("2d");
const zoomSlider = document.getElementById("zoomSlider");
const zoomValue = document.getElementById("zoomValue");
const continueAfterCropBtn = document.getElementById("continueAfterCrop");
const resetCropBtn = document.getElementById("resetCropBtn");
const backToWizardBtn = document.getElementById("backToWizard");
const chooseNewPhotoBtn = document.getElementById("chooseNewPhotoBtn");

const uploadedPhoto =
  sessionStorage.getItem("uploadedPhoto") ||
  localStorage.getItem("uploadedPhoto");

const sourceImage = new Image();

let scale = 1;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let startDragX = 0;
let startDragY = 0;

if (!uploadedPhoto) {
  window.location.href = "wizard.html";
}

sourceImage.src = uploadedPhoto;

sourceImage.onload = () => {
  fitImageInitially();
  drawCanvas();
};

function fitImageInitially() {
  const canvasW = cropCanvas.width;
  const canvasH = cropCanvas.height;
  const imageRatio = sourceImage.width / sourceImage.height;
  const canvasRatio = canvasW / canvasH;

  if (imageRatio > canvasRatio) {
    scale = canvasH / sourceImage.height;
  } else {
    scale = canvasW / sourceImage.width;
  }

  scale = Math.max(scale, 0.9);
  zoomSlider.value = String(scale);
  zoomValue.textContent = `${Math.round(scale * 100)}%`;

  offsetX = 0;
  offsetY = 0;
}

function drawCanvas() {
  cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);

  const imageWidth = sourceImage.width * scale;
  const imageHeight = sourceImage.height * scale;

  const centerX = (cropCanvas.width - imageWidth) / 2 + offsetX;
  const centerY = (cropCanvas.height - imageHeight) / 2 + offsetY;

  cropCtx.drawImage(sourceImage, centerX, centerY, imageWidth, imageHeight);
}

function setZoom(val) {
  scale = parseFloat(val);
  zoomValue.textContent = `${Math.round(scale * 100)}%`;
  drawCanvas();
}

zoomSlider.addEventListener("input", (e) => {
  setZoom(e.target.value);
});

resetCropBtn.addEventListener("click", () => {
  fitImageInitially();
  drawCanvas();
});

function pointerDown(x, y) {
  isDragging = true;
  startDragX = x;
  startDragY = y;
}

function pointerMove(x, y) {
  if (!isDragging) return;

  offsetX += x - startDragX;
  offsetY += y - startDragY;

  startDragX = x;
  startDragY = y;

  drawCanvas();
}

function pointerUp() {
  isDragging = false;
}

cropCanvas.addEventListener("mousedown", (e) => {
  pointerDown(e.offsetX, e.offsetY);
});

cropCanvas.addEventListener("mousemove", (e) => {
  pointerMove(e.offsetX, e.offsetY);
});

cropCanvas.addEventListener("mouseup", pointerUp);
cropCanvas.addEventListener("mouseleave", pointerUp);

cropCanvas.addEventListener("touchstart", (e) => {
  const touch = e.touches[0];
  const rect = cropCanvas.getBoundingClientRect();
  pointerDown(touch.clientX - rect.left, touch.clientY - rect.top);
}, { passive: true });

cropCanvas.addEventListener("touchmove", (e) => {
  if (!isDragging) return;
  e.preventDefault();

  const touch = e.touches[0];
  const rect = cropCanvas.getBoundingClientRect();
  pointerMove(touch.clientX - rect.left, touch.clientY - rect.top);
}, { passive: false });

cropCanvas.addEventListener("touchend", pointerUp);

continueAfterCropBtn.addEventListener("click", () => {
  try {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = 768;
    exportCanvas.height = 768;
    const exportCtx = exportCanvas.getContext("2d");

    const imageWidth = sourceImage.width * scale;
    const imageHeight = sourceImage.height * scale;

    const centerX = (cropCanvas.width - imageWidth) / 2 + offsetX;
    const centerY = (cropCanvas.height - imageHeight) / 2 + offsetY;

    const ratio = exportCanvas.width / cropCanvas.width;

    exportCtx.save();
    exportCtx.beginPath();
    exportCtx.arc(384, 384, 320, 0, Math.PI * 2);
    exportCtx.closePath();
    exportCtx.clip();

    exportCtx.drawImage(
      sourceImage,
      centerX * ratio,
      centerY * ratio,
      imageWidth * ratio,
      imageHeight * ratio
    );

    exportCtx.restore();

    const croppedPhoto = exportCanvas.toDataURL("image/jpeg", 0.9);

    sessionStorage.setItem("croppedPhoto", croppedPhoto);
    localStorage.removeItem("croppedPhoto");

    window.location.href = "generate.html";
  } catch (error) {
    alert("Something went wrong while saving the cropped image. Please try again.");
  }
});

backToWizardBtn.addEventListener("click", () => {
  window.location.href = "wizard.html";
});

chooseNewPhotoBtn.addEventListener("click", () => {
  sessionStorage.removeItem("uploadedPhoto");
  sessionStorage.removeItem("croppedPhoto");
  localStorage.removeItem("uploadedPhoto");
  localStorage.removeItem("croppedPhoto");
  window.location.href = "wizard.html";
});

