import { getBookData, updateBookData } from "./js/state.js";

const data = getBookData();

if (!data.generatedBook || !Array.isArray(data.generatedBook.pages) || data.generatedBook.pages.length === 0) {
  window.location.href = "preview.html";
}

const generatedBook = data.generatedBook;
const coverImage = sessionStorage.getItem("coverImage") || "";

const checkoutBookTitle = document.getElementById("checkoutBookTitle");
const checkoutBookSubtitle = document.getElementById("checkoutBookSubtitle");
const checkoutCoverFill = document.getElementById("checkoutCoverFill");

const summaryChildName = document.getElementById("summaryChildName");
const summaryAge = document.getElementById("summaryAge");
const summaryStyle = document.getElementById("summaryStyle");
const summaryStory = document.getElementById("summaryStory");
const summaryPages = document.getElementById("summaryPages");

const formatDigital = document.getElementById("formatDigital");
const formatPrinted = document.getElementById("formatPrinted");

const backToPreviewBtn = document.getElementById("backToPreviewBtn");
const saveAndContinueBtn = document.getElementById("saveAndContinueBtn");
const goToSuccessPreviewBtn = document.getElementById("goToSuccessPreviewBtn");

const checkoutBrandLogo = document.getElementById("checkoutBrandLogo");

let selectedFormat = data.selectedFormat || "digital";
let selectedPrice = selectedFormat === "printed" ? 49 : 39;

function hideBrokenLogo(img) {
  if (!img) return;
  img.addEventListener("error", () => {
    img.style.display = "none";
  });
}

hideBrokenLogo(checkoutBrandLogo);

if (checkoutBookTitle) {
  checkoutBookTitle.textContent = generatedBook.title || "Your Magical Adventure";
}

if (checkoutBookSubtitle) {
  checkoutBookSubtitle.textContent = generatedBook.subtitle || "A story where you are the hero";
}

if (checkoutCoverFill) {
  if (coverImage) {
    checkoutCoverFill.src = coverImage;
  } else if (data.croppedPhoto) {
    checkoutCoverFill.src = data.croppedPhoto;
  } else if (data.originalPhoto) {
    checkoutCoverFill.src = data.originalPhoto;
  } else {
    checkoutCoverFill.style.display = "none";
  }
}

if (summaryChildName) {
  summaryChildName.textContent = data.childName || "-";
}

if (summaryAge) {
  summaryAge.textContent = data.childAge || "-";
}

if (summaryStyle) {
  summaryStyle.textContent = data.illustrationStyle || "-";
}

if (summaryStory) {
  summaryStory.textContent = data.storyIdea || "-";
}

if (summaryPages) {
  summaryPages.textContent = String(generatedBook.pages?.length || 0);
}

function syncFormatUI() {
  const isDigital = selectedFormat === "digital";

  formatDigital?.classList.toggle("active", isDigital);
  formatPrinted?.classList.toggle("active", !isDigital);

  selectedPrice = isDigital ? 39 : 49;

  updateBookData({
    selectedFormat,
    selectedPrice
  });
}

formatDigital?.addEventListener("click", () => {
  selectedFormat = "digital";
  syncFormatUI();
});

formatPrinted?.addEventListener("click", () => {
  selectedFormat = "printed";
  syncFormatUI();
});

backToPreviewBtn?.addEventListener("click", () => {
  window.location.href = "preview.html";
});

saveAndContinueBtn?.addEventListener("click", () => {
  updateBookData({
    selectedFormat,
    selectedPrice,
    purchaseUnlocked: true
  });

  window.location.href = "success.html";
});

goToSuccessPreviewBtn?.addEventListener("click", () => {
  updateBookData({
    selectedFormat,
    selectedPrice,
    purchaseUnlocked: true
  });

  window.location.href = "success.html";
});

syncFormatUI();
