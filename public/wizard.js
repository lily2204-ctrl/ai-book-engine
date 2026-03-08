const openPhotoModalBtn = document.getElementById("openPhotoModal");
const photoModal = document.getElementById("photoModal");
const closePhotoModalBtn = document.getElementById("closePhotoModal");
const takePhotoBtn = document.getElementById("takePhotoBtn");
const chooseGalleryBtn = document.getElementById("chooseGalleryBtn");
const cameraInput = document.getElementById("cameraInput");
const galleryInput = document.getElementById("galleryInput");

function openModal() {
  photoModal.classList.remove("hidden");
}

function closeModal() {
  photoModal.classList.add("hidden");
}

openPhotoModalBtn.addEventListener("click", openModal);
closePhotoModalBtn.addEventListener("click", closeModal);

photoModal.addEventListener("click", (e) => {
  if (e.target === photoModal) {
    closeModal();
  }
});

takePhotoBtn.addEventListener("click", () => {
  cameraInput.click();
});

chooseGalleryBtn.addEventListener("click", () => {
  galleryInput.click();
});

function handleSelectedFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (event) {
    localStorage.setItem("uploadedPhoto", event.target.result);
    window.location.href = "crop.html";
  };
  reader.readAsDataURL(file);
}

cameraInput.addEventListener("change", (e) => {
  handleSelectedFile(e.target.files?.[0]);
});

galleryInput.addEventListener("change", (e) => {
  handleSelectedFile(e.target.files?.[0]);
});
