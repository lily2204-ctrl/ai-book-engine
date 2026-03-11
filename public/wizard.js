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

function resetInputs() {
  cameraInput.value = "";
  galleryInput.value = "";
}

function goToCropWithFile(file) {
  if (!file) {
    return;
  }

  // סוגי קבצים מותרים
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif"
  ];

  if (file.type && !allowedTypes.includes(file.type)) {
    alert("Please choose a valid image file (JPG, PNG, WEBP, HEIC).");
    return;
  }

  const reader = new FileReader();

  reader.onload = function (event) {
    try {
      const result = event.target?.result;

      if (!result) {
        alert("Failed to read the image. Please try another photo.");
        return;
      }

      localStorage.setItem("uploadedPhoto", result);
      closeModal();

      // מעבר רק אחרי שמירת התמונה
      setTimeout(() => {
        window.location.href = "crop.html";
      }, 120);
    } catch (error) {
      console.error("Failed to save uploaded photo:", error);
      alert("Something went wrong while loading the image. Please try again.");
    }
  };

  reader.onerror = function () {
    alert("Failed to read the selected file. Please try another image.");
  };

  reader.readAsDataURL(file);
}

openPhotoModalBtn.addEventListener("click", openModal);
closePhotoModalBtn.addEventListener("click", closeModal);

photoModal.addEventListener("click", (e) => {
  if (e.target === photoModal) {
    closeModal();
  }
});

takePhotoBtn.addEventListener("click", () => {
  resetInputs();
  cameraInput.click();
});

chooseGalleryBtn.addEventListener("click", () => {
  resetInputs();
  galleryInput.click();
});

cameraInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
  goToCropWithFile(file);
});

galleryInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
  goToCropWithFile(file);
});
