import { clearBookData, updateBookData } from "./js/state.js";

const API_BASE = window.location.origin;

function getBookId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("bookId");
}

const bookId = getBookId();

if (!bookId) {
  window.location.href = "wizard.html";
}

const successBookTitle = document.getElementById("successBookTitle");
const successBookSubtitle = document.getElementById("successBookSubtitle");
const successCoverFill = document.getElementById("successCoverFill");

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

async function loadBook() {
  try {
    const res = await fetch(`${API_BASE}/api/books/${bookId}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Failed to load book");
    }

    return data.book;
  } catch (err) {
    console.error("loadBook failed:", err);
    alert("Failed to load confirmation page");
    window.location.href = "checkout.html?bookId=" + encodeURIComponent(bookId);
    return null;
  }
}

function renderBook(book) {
  if (!book) return;

  if (successBookTitle) {
    successBookTitle.textContent = book.generatedBook?.title || "Your Magical Adventure";
  }

  if (successBookSubtitle) {
    successBookSubtitle.textContent = book.generatedBook?.subtitle || "A story where you are the hero";
  }

  if (successCoverFill) {
    if (book.coverImage) {
      successCoverFill.src = book.coverImage;
    } else if (book.croppedPhoto) {
      successCoverFill.src = book.croppedPhoto;
    } else if (book.originalPhoto) {
      successCoverFill.src = book.originalPhoto;
    } else {
      successCoverFill.style.display = "none";
    }
  }

  if (successChildName) {
    successChildName.textContent = book.childName || "-";
  }

  if (successFormat) {
    successFormat.textContent =
      book.selectedFormat === "printed" ? "Printed Book" : "Digital Book";
  }

  if (successPrice) {
    const price = book.selectedPrice || (book.selectedFormat === "printed" ? 49 : 39);
    successPrice.textContent = `$${price}`;
  }

  if (successPages) {
    successPages.textContent = String(book.generatedBook?.pages?.length || 0);
  }

  updateBookData({
    bookId: book.bookId,
    childName: book.childName || "",
    childAge: book.childAge || "",
    childGender: book.childGender || "",
    storyIdea: book.storyIdea || "",
    illustrationStyle: book.illustrationStyle || "",
    croppedPhoto: book.croppedPhoto || "",
    originalPhoto: book.originalPhoto || "",
    generatedBook: book.generatedBook || null,
    characterReference: book.characterReference || null,
    purchaseUnlocked: book.purchaseUnlocked === true,
    selectedFormat: book.selectedFormat || "digital",
    selectedPrice: book.selectedPrice || 39
  });
}

backToCheckoutBtn?.addEventListener("click", () => {
  window.location.href = "checkout.html?bookId=" + encodeURIComponent(bookId);
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

(async () => {
  const book = await loadBook();
  renderBook(book);
})();
