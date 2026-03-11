const cropCanvas = document.getElementById("cropCanvas");
const cropCtx = cropCanvas.getContext("2d");
const zoomSlider = document.getElementById("zoomSlider");
const continueAfterCropBtn = document.getElementById("continueAfterCrop");
const resetCropBtn = document.getElementById("resetCropBtn");
const backToWizardBtn = document.getElementById("backToWizard");

const uploadedPhoto = localStorage.getItem("uploadedPhoto");
const sourceImage = new Image();

let scale = 1;
let baseScale = 1;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let startDragX = 0;
let startDragY = 0;
let imageLoadedSuccessfully = false;

if (!uploadedPhoto) {
  window.location.href = "wizard.html";
}

sourceImage.onload = () => {
  imageLoadedSuccessfully = true;
  initializeImageFit();
  drawCanvas();
};

sourceImage.onerror = () => {
  imageLoadedSuccessfully = false;
  alert("Something went wrong while loading the image. Please try again with a JPG, PNG, or WEBP photo.");
  localStorage.removeItem("uploadedPhoto");
  localStorage.removeItem("croppedPhoto");
  window.location.href = "wizard.html";
};

sourceImage.src = uploadedPhoto;

function initializeImageFit() {
  const fitScaleX = cropCanvas.width / sourceImage.width;
  const fitScaleY = cropCanvas.height / sourceImage.height;

  baseScale = Math.min(fitScaleX, fitScaleY);

  // מתחילים קצת יותר קרוב אבל לא מוגזם
  scale = baseScale * 1.15;

  // טווח זום חדש, מותאם לתמונה עצמה
  zoomSlider.min = String(baseScale);
  zoomSlider.max = String(baseScale * 3.2);
  zoomSlider.step = String(baseScale * 0.01);
  zoomSlider.value = String(scale);

  offsetX = 0;
  offsetY = 0;
}

function drawCanvas() {
  if (!imageLoadedSuccessfully) return;

  cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);

  const imageWidth = sourceImage.width * scale;
  const imageHeight = sourceImage.height * scale;

  const centerX = (cropCanvas.width - imageWidth) / 2 + offsetX;
  const centerY = (cropCanvas.height - imageHeight) / 2 + offsetY;

  cropCtx.drawImage(sourceImage, centerX, centerY, imageWidth, imageHeight);

  cropCtx.fillStyle = "rgba(0,0,0,0.35)";
  cropCtx.beginPath();
  cropCtx.rect(0, 0, cropCanvas.width, cropCanvas.height);
  cropCtx.arc(160, 160, 140, 0, Math.PI * 2, true);
  cropCtx.fill("evenodd");

  cropCtx.beginPath();
  cropCtx.arc(160, 160, 140, 0, Math.PI * 2);
  cropCtx.strokeStyle = "#E4AB4B";
  cropCtx.lineWidth = 4;
  cropCtx.stroke();
}

zoomSlider.addEventListener("input", (e) => {
  if (!imageLoadedSuccessfully) return;
  scale = parseFloat(e.target.value);
  drawCanvas();
});

resetCropBtn.addEventListener("click", () => {
  if (!imageLoadedSuccessfully) return;
  initializeImageFit();
  drawCanvas();
});

cropCanvas.addEventListener("mousedown", (e) => {
  if (!imageLoadedSuccessfully) return;
  isDragging = true;
  startDragX = e.offsetX;
  startDragY = e.offsetY;
});

cropCanvas.addEventListener("mousemove", (e) => {
  if (!isDragging || !imageLoadedSuccessfully) return;

  offsetX += e.offsetX - startDragX;
  offsetY += e.offsetY - startDragY;

  startDragX = e.offsetX;
  startDragY = e.offsetY;

  drawCanvas();
});

cropCanvas.addEventListener("mouseup", () => {
  isDragging = false;
});

cropCanvas.addEventListener("mouseleave", () => {
  isDragging = false;
});

cropCanvas.addEventListener("touchstart", (e) => {
  if (!imageLoadedSuccessfully) return;
  const touch = e.touches[0];
  const rect = cropCanvas.getBoundingClientRect();
  startDragX = touch.clientX - rect.left;
  startDragY = touch.clientY - rect.top;
  isDragging = true;
});

cropCanvas.addEventListener(
  "touchmove",
  (e) => {
    if (!isDragging || !imageLoadedSuccessfully) return;
    e.preventDefault();

    const touch = e.touches[0];
    const rect = cropCanvas.getBoundingClientRect();
    const currentX = touch.clientX - rect.left;
    const currentY = touch.clientY - rect.top;

    offsetX += currentX - startDragX;
    offsetY += currentY - startDragY;

    startDragX = currentX;
    startDragY = currentY;

    drawCanvas();
  },
  { passive: false }
);

cropCanvas.addEventListener("touchend", () => {
  isDragging = false;
});

continueAfterCropBtn.addEventListener("click", () => {
  if (!imageLoadedSuccessfully) {
    alert("Please upload a valid image first.");
    return;
  }

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = 1024;
  exportCanvas.height = 1024;
  const exportCtx = exportCanvas.getContext("2d");

  const imageWidth = sourceImage.width * scale;
  const imageHeight = sourceImage.height * scale;

  const centerX = (cropCanvas.width - imageWidth) / 2 + offsetX;
  const centerY = (cropCanvas.height - imageHeight) / 2 + offsetY;

  const ratio = 1024 / 320;

  exportCtx.save();
  exportCtx.beginPath();
  exportCtx.arc(512, 512, 448, 0, Math.PI * 2);
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

  const croppedPhoto = exportCanvas.toDataURL("image/png");
  localStorage.setItem("croppedPhoto", croppedPhoto);

  window.location.href = "setup.html";
});

backToWizardBtn.addEventListener("click", () => {
  window.location.href = "wizard.html";
});
