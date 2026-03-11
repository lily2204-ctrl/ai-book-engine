const openPhotoModalBtn = document.getElementById("openPhotoModal");
const photoModal = document.getElementById("photoModal");
const closePhotoModalBtn = document.getElementById("closePhotoModal");
const takePhotoBtn = document.getElementById("takePhotoBtn");
const chooseGalleryBtn = document.getElementById("chooseGalleryBtn");
const cameraInput = document.getElementById("cameraInput");
const galleryInput = document.getElementById("galleryInput");

const DB_NAME = "lifebookDB";
const STORE_NAME = "images";
const IMAGE_KEY = "uploadedPhoto";

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

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = function () {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = function () {
      resolve(request.result);
    };

    request.onerror = function () {
      reject(request.error || new Error("Failed to open IndexedDB"));
    };
  });
}

async function saveImageToDB(dataUrl) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const request = store.put(dataUrl, IMAGE_KEY);

    request.onsuccess = function () {
      resolve(true);
    };

    request.onerror = function () {
      reject(request.error || new Error("Failed to save image"));
    };
  });
}

async function clearStoredImages() {
  try {
    const db = await openDatabase();

    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      const deleteUploaded = store.delete("uploadedPhoto");
      const deleteCropped = store.delete("croppedPhoto");

      let doneCount = 0;
      function handleDone() {
        doneCount++;
        if (doneCount === 2) resolve();
      }

      deleteUploaded.onsuccess = handleDone;
      deleteCropped.onsuccess = handleDone;

      deleteUploaded.onerror = function () {
        reject(deleteUploaded.error || new Error("Failed clearing uploaded photo"));
      };

      deleteCropped.onerror = function () {
        reject(deleteCropped.error || new Error("Failed clearing cropped photo"));
      };
    });
  } catch (error) {
    console.warn("Failed to clear IndexedDB images:", error);
  }

  localStorage.removeItem("uploadedPhoto");
  localStorage.removeItem("croppedPhoto");
}

function compressImage(file, maxSize = 1000, quality = 0.68) {
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
    const compressedImage = await compressImage(file, 1000, 0.68);

    if (!compressedImage) {
      alert("Failed to process the image. Please try another photo.");
      return;
    }

    await clearStoredImages();
    await saveImageToDB(compressedImage);

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
