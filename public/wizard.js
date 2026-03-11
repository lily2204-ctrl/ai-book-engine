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

function showUnsupportedFormatMessage(fileName = "") {
  const label = fileName ? ` (${fileName})` : "";
  alert(
    `This image format is not supported right now${label}.\n\nPlease choose a JPG, JPEG, PNG, or WEBP image.`
  );
}

function isSupportedImage(file) {
  if (!file) return false;

  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();

  const supportedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp"
  ];

  const supportedExtensions = [".jpg", ".jpeg", ".png", ".webp"];

  const hasSupportedMime = supportedMimeTypes.includes(type);
  const hasSupportedExtension = supportedExtensions.some((ext) => name.endsWith(ext));

  return hasSupportedMime || hasSupportedExtension;
}

function compressImage(file, maxSize = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();

    fileReader.onload = () => {
      const img = new Image();

      img.onload = () => {
        try {
          let { width, height } = img;

          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(compressedDataUrl);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error("Image could not be loaded"));
      };

      img.src = fileReader.result;
    };

    fileReader.onerror = () => {
      reject(new Error("File could not be read"));
    };

    fileReader.readAsDataURL(file);
  });
}

async function goToCropWithFile(file) {
  if (!file) return;

  if (!isSupportedImage(file)) {
    showUnsupportedFormatMessage(file.name || "");
    return;
  }

  try {
    const compressedImage = await compressImage(file);

    if (!compressedImage) {
      alert("Failed to process the image. Please try another photo.");
      return;
    }

    localStorage.removeItem("uploadedPhoto");
    localStorage.removeItem("croppedPhoto");

    localStorage.setItem("uploadedPhoto", compressedImage);

    closeModal();

    setTimeout(() => {
      window.location.href = "crop.html";
    }, 120);
  } catch (error) {
    console.error("Failed to process uploaded photo:", error);
    alert("Something went wrong while loading the image. Please try again.");
  }
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

cameraInput.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
  await goToCropWithFile(file);
});

galleryInput.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
  await goToCropWithFile(file);
});
