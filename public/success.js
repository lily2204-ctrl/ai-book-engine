import { clearBookData, getBookData } from "./js/state.js";

const data = getBookData();

if (!data.generatedBook || !Array.isArray(data.generatedBook.pages) || data.generatedBook.pages.length === 0) {
  window.location.href = "wizard.html";
}

const generatedBook = data.generatedBook;
const coverImage = data.coverImage || sessionStorage.getItem("coverImage") || "";

const successBookTitle = document.getElementById("successBookTitle");
const successBookSubtitle = document.getElementById("successBookSubtitle");
const successCoverImage = document.getElementById("successCoverImage");

const successChildName = document.getElementById("successChildName");
const successFormat = document.getElementById("successFormat");
const successPrice = document.getElementById("successPrice");
const successPages = document.getElementById("successPages");

const backToCheckoutBtn = document.getElementById("backToCheckoutBtn");
const goHomeBtn = document.getElementById("goHomeBtn");
const createAnotherBtn = document.getElementById("createAnotherBtn");

const successBrandLogo = document.getElementById("successBrandLogo");
const successMiniLogo = document.getElementById("successMiniLogo");

function hideBrokenLogo(img) {
  if (!img) return;
  img.addEventListener("error", () => {
    img.style.display = "none";
  });
}

hideBrokenLogo(successBrandLogo);
hideBrokenLogo(successMiniLogo);

if (successBookTitle) {
  successBookTitle.textContent = generatedBook.title || "Your Magical Adventure";
}

if (successBookSubtitle) {
  successBookSubtitle.textContent = generatedBook.subtitle || "A story where you are the hero";
}

if (successCoverImage) {
  if (coverImage) {
    successCoverImage.src = coverImage;
  } else if (data.croppedPhoto) {
    successCoverImage.src = data.croppedPhoto;
  } else if (data.originalPhoto) {
    successCoverImage.src = data.originalPhoto;
  } else {
    successCoverImage.style.display = "none";
  }
}

if (successChildName) {
  successChildName.textContent = data.childName || "-";
}

if (successFormat) {
  const formatLabel =
    data.selectedFormat === "printed"
      ? "Printed Book"
      : "Digital Book";
  successFormat.textContent = formatLabel;
}

if (successPrice) {
  const price = data.selectedPrice || (data.selectedFormat === "printed" ? 49 : 39);
  successPrice.textContent = `$${price}`;
}

if (successPages) {
  successPages.textContent = String(generatedBook.pages?.length || 0);
}

backToCheckoutBtn?.addEventListener("click", () => {
  window.location.href = "checkout.html";
});

goHomeBtn?.addEventListener("click", () => {
  window.location.href = "index.html";
});

createAnotherBtn?.addEventListener("click", () => {
  sessionStorage.removeItem("characterSheetImage");
  sessionStorage.removeItem("coverImage");
  clearBookData();
  window.location.href = "wizard.html";
});
