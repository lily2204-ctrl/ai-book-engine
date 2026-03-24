const API_BASE = window.location.origin;

function getBookId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("bookId");
}

const bookId = getBookId();

if (!bookId) {
  window.location.href = "wizard.html";
}

const coverImage = document.getElementById("coverImage");
const bookTitle = document.getElementById("bookTitle");
const bookSubtitle = document.getElementById("bookSubtitle");
const pagesContainer = document.getElementById("pagesContainer");
const goToCheckoutBtn = document.getElementById("goToCheckoutBtn");
const unlockNote = document.getElementById("unlockNote");

async function loadBook() {
  const res = await fetch(`${API_BASE}/api/books/${bookId}`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Failed to load book");
  }

  return data.book;
}

function createPageCard(page, index) {
  const article = document.createElement("article");
  article.className = "page";

  const pageNumber = index + 1;

  article.innerHTML = `
    <div class="page-label">Page ${pageNumber}</div>
    <div class="image-box" id="image-box-${pageNumber}">Loading...</div>
    <div class="page-text">${page.text || ""}</div>
  `;

  return article;
}

async function generatePageImage(book, page, index, article) {
  const pageNumber = index + 1;
  const imageBox = article.querySelector(`#image-box-${pageNumber}`);

  try {
    const res = await fetch(`${API_BASE}/generate-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: page.imagePrompt || "",
        illustration_style: book.illustrationStyle || "Soft Storybook",
        characterPromptCore: book.characterReference?.characterPromptCore || ""
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Failed to generate page image");
    }

    imageBox.innerHTML = `<img src="data:image/png;base64,${data.imageBase64}" alt="Page ${pageNumber}" style="width:100%;display:block;border-radius:20px;">`;
  } catch (error) {
    console.error(`Failed image for page ${pageNumber}:`, error);
    imageBox.textContent = "Failed to generate page image.";
  }
}

async function renderBook() {
  try {
    const book = await loadBook();

    if (coverImage) {
      if (book.coverImage) {
        coverImage.src = book.coverImage;
      } else if (book.croppedPhoto) {
        coverImage.src = book.croppedPhoto;
      }
    }

    if (bookTitle) {
      bookTitle.textContent = book.generatedBook?.title || "Your Magical Adventure";
    }

    if (bookSubtitle) {
      bookSubtitle.textContent = book.generatedBook?.subtitle || "A story where you are the hero";
    }

    const allPages = book.generatedBook?.pages || [];
    const isUnlocked = book.purchaseUnlocked === true || book.paymentStatus === "paid";
    const visiblePages = isUnlocked ? allPages : allPages.slice(0, 2);

    if (unlockNote) {
      unlockNote.style.display = isUnlocked ? "none" : "block";
    }

    if (goToCheckoutBtn) {
      goToCheckoutBtn.style.display = isUnlocked ? "none" : "inline-block";
      goToCheckoutBtn.onclick = () => {
        window.location.href = `checkout.html?bookId=${encodeURIComponent(bookId)}`;
      };
    }

    pagesContainer.innerHTML = "";

    for (let i = 0; i < visiblePages.length; i += 1) {
      const page = visiblePages[i];
      const article = createPageCard(page, i);
      pagesContainer.appendChild(article);
      await generatePageImage(book, page, i, article);
    }
  } catch (error) {
    console.error("Preview load failed:", error);
    alert(error.message || "Failed to load preview");
  }
}

renderBook();
