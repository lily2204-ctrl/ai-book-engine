import { getBookData, updateBookData } from "./js/state.js";

const API_BASE = window.location.origin;

const wizardData = getBookData();

if (
  !wizardData.croppedPhoto ||
  !wizardData.childName ||
  !wizardData.storyIdea ||
  !wizardData.illustrationStyle
) {
  window.location.href = "setup.html";
}

const generateBookBtn       = document.getElementById("generateBookBtn");
const backToSetupBtn        = document.getElementById("backToSetupBtn");
const backToCropBtn         = document.getElementById("backToCropBtn");
const generateStatus        = document.getElementById("generateStatus");
const stepCharacter         = document.getElementById("stepCharacter");
const stepStory             = document.getElementById("stepStory");
const stepPreview           = document.getElementById("stepPreview");
const uploadedPhotoPreview  = document.getElementById("uploadedPhotoPreview");
const characterSheetPreview = document.getElementById("characterSheetPreview");

// Progress bar
const progressWrap = document.createElement("div");
progressWrap.id = "progressWrap";
progressWrap.style.cssText = "display:none; margin-top:16px; background:rgba(255,255,255,0.06); border-radius:14px; overflow:hidden; height:22px; border:1px solid rgba(240,196,109,0.14);";
const progressBar = document.createElement("div");
progressBar.id = "progressBar";
progressBar.style.cssText = "height:100%; width:0%; border-radius:14px; background:linear-gradient(90deg,#f0c46d,#d08e2b); transition:width 0.6s ease;";
progressWrap.appendChild(progressBar);
generateStatus?.parentElement?.insertBefore(progressWrap, generateStatus.nextSibling);

if (uploadedPhotoPreview) {
  uploadedPhotoPreview.src = wizardData.croppedPhoto;
}

function setActiveStep(stepElement, text) {
  [stepCharacter, stepStory, stepPreview].forEach(function(el) {
    if (el) el.classList.remove("active");
  });
  if (stepElement) stepElement.classList.add("active");
  if (generateStatus) generateStatus.textContent = text;
}

function setProgress(pct) {
  progressWrap.style.display = "block";
  progressBar.style.width = Math.min(100, Math.round(pct)) + "%";
}

function buildGeneratedBookData(bookResponse, characterRef) {
  return {
    title:               bookResponse.title    || "",
    subtitle:            bookResponse.subtitle || "",
    pages:               bookResponse.pages    || [],
    characterDNA:        characterRef.characterDNA        || {},
    characterPromptCore: characterRef.characterPromptCore || "",
    characterSummary:    characterRef.characterSummary    || ""
  };
}

function loadImage(src) {
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload  = function() { resolve(img); };
    img.onerror = function() { reject(new Error("Failed to load generated image.")); };
    img.src = src;
  });
}

async function compressDataUrl(dataUrl, maxDimension, quality) {
  if (maxDimension === undefined) maxDimension = 700;
  if (quality === undefined) quality = 0.72;
  var img    = await loadImage(dataUrl);
  var width  = img.width;
  var height = img.height;
  var scale  = Math.min(1, maxDimension / Math.max(width, height));
  width  = Math.round(width  * scale);
  height = Math.round(height * scale);
  var canvas = document.createElement("canvas");
  canvas.width  = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

async function safeStoreImage(key, dataUrl, maxDimension, quality) {
  if (maxDimension === undefined) maxDimension = 700;
  if (quality === undefined) quality = 0.72;
  var compressed = await compressDataUrl(dataUrl, maxDimension, quality);
  sessionStorage.setItem(key, compressed);
  return compressed;
}

async function apiJson(url, options, timeoutMs) {
  if (timeoutMs === undefined) timeoutMs = 90000;
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, timeoutMs);
  try {
    var fetchOptions = Object.assign({}, options, { signal: controller.signal });
    var res = await fetch(url, fetchOptions);
    clearTimeout(timer);
    var rawText = await res.text();
    var result;
    try { result = JSON.parse(rawText); }
    catch(e) { throw new Error("Server returned non-JSON from " + url); }
    if (!res.ok) throw new Error((result && (result.message || result.details)) || ("Request failed: " + url));
    return result;
  } catch(err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new Error("Request timed out -- please try again");
    throw err;
  }
}

async function withRetry(fn, retries, delayMs) {
  if (retries === undefined) retries = 3;
  if (delayMs === undefined) delayMs = 1500;
  for (var attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch(err) {
      if (attempt === retries) throw err;
      console.warn("Attempt " + attempt + " failed: " + err.message + ". Retrying...");
      if (generateStatus) generateStatus.textContent = "Retrying... (" + (attempt+1) + "/" + retries + ")";
      await new Promise(function(r) { setTimeout(r, delayMs); });
    }
  }
}

async function createBookRecordIfNeeded() {
  if (wizardData.bookId) return wizardData.bookId;
  var result = await apiJson(API_BASE + "/api/books/create", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      childName:         wizardData.childName         || "",
      childAge:          wizardData.childAge          || "",
      childGender:       wizardData.childGender       || "",
      storyIdea:         wizardData.storyIdea         || "",
      illustrationStyle: wizardData.illustrationStyle || "Soft Storybook",
      croppedPhoto:      wizardData.croppedPhoto      || "",
      originalPhoto:     wizardData.originalPhoto     || "",
      customerEmail:     wizardData.customerEmail     || ""
    })
  }, 10000);
  var newBookId = result.bookId || "";
  updateBookData({ bookId: newBookId });
  return newBookId;
}

async function patchBook(bookId, patch) {
  if (!bookId) return;
  await apiJson(API_BASE + "/api/books/" + bookId, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(patch)
  }, 10000);
}

async function generateCharacterReference(bookId) {
  setActiveStep(stepCharacter, "Creating character reference...");
  setProgress(5);
  var result = await withRetry(function() {
    return apiJson(API_BASE + "/generate-character-reference", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        child_photo:        wizardData.croppedPhoto,
        child_name:         wizardData.childName         || "",
        age:                wizardData.childAge          || "",
        gender:             wizardData.childGender       || "",
        illustration_style: wizardData.illustrationStyle || "Soft Storybook"
      })
    }, 60000);
  });
  var characterRef = {
    characterDNA:        result.characterDNA        || {},
    characterPromptCore: result.characterPromptCore || "",
    characterSummary:    result.characterSummary    || ""
  };
  if (result.characterSheetBase64) {
    var src = "data:image/png;base64," + result.characterSheetBase64;
    if (characterSheetPreview) characterSheetPreview.src = src;
    await safeStoreImage("characterSheetImage", src, 650, 0.68);
  }
  updateBookData({ characterReference: characterRef });
  await patchBook(bookId, { characterReference: characterRef });
  setProgress(20);
  return characterRef;
}

async function generateBookStory(bookId, characterRef) {
  setActiveStep(stepStory, "Building the story...");
  setProgress(25);
  var result = await withRetry(function() {
    return apiJson(API_BASE + "/create-book", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        child_name:         wizardData.childName         || "",
        age:                wizardData.childAge          || "",
        gender:             wizardData.childGender       || "",
        story_type:         wizardData.storyIdea         || "A magical adventure",
        illustration_style: wizardData.illustrationStyle || "Soft Storybook",
        character_reference: {
          characterDNA:        characterRef.characterDNA        || {},
          characterPromptCore: characterRef.characterPromptCore || "",
          characterSummary:    characterRef.characterSummary    || ""
        }
      })
    }, 30000);
  });
  var generatedBook = buildGeneratedBookData(result, characterRef);
  updateBookData({ generatedBook: generatedBook });
  await patchBook(bookId, { generatedBook: generatedBook });
  setProgress(35);
  return result;
}

async function generateCoverImage(bookId, characterRef, bookResponse) {
  setActiveStep(stepPreview, "Creating the cover...");
  setProgress(40);
  var result = await withRetry(function() {
    return apiJson(API_BASE + "/generate-cover-image", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:               bookResponse.title    || "",
        subtitle:            bookResponse.subtitle || "",
        story_type:          wizardData.storyIdea  || "",
        illustration_style:  wizardData.illustrationStyle || "Soft Storybook",
        characterPromptCore: characterRef.characterPromptCore || "",
        characterSummary:    characterRef.characterSummary    || ""
      })
    }, 60000);
  });
  if (result.coverImageBase64) {
    var rawCover = "data:image/png;base64," + result.coverImageBase64;
    var stored   = await safeStoreImage("coverImage", rawCover, 700, 0.7);
    await patchBook(bookId, { coverImage: stored });
    setProgress(50);
    return true;
  }
  if (wizardData.croppedPhoto) {
    sessionStorage.setItem("coverImage", wizardData.croppedPhoto);
    await patchBook(bookId, { coverImage: wizardData.croppedPhoto });
  }
  setProgress(50);
  return false;
}

async function generateAllPageImages(bookId) {
  setActiveStep(stepPreview, "Generating illustrations...");
  setProgress(52);

  var batchPromise = (async function() {
    try {
      await apiJson(API_BASE + "/api/books/" + bookId + "/generate-images", {
        method:  "POST",
        headers: { "Content-Type": "application/json" }
      }, 300000);
    } catch(err) {
      console.warn("Batch ended (may be partial):", err.message);
    }
  })();

  var done       = false;
  var lastReady  = 0;
  var stallCount = 0;

  while (!done) {
    await new Promise(function(r) { setTimeout(r, 4000); });
    try {
      var status = await apiJson(
        API_BASE + "/api/books/" + bookId + "/image-status",
        { method: "GET" },
        8000
      );
      var ready = status.ready || 0;
      var total = status.total || 10;
      if (ready === lastReady) { stallCount++; }
      else { stallCount = 0; lastReady = ready; }
      setProgress(52 + (ready / Math.max(1, total)) * 46);
      if (generateStatus) generateStatus.textContent = "Generating illustrations... " + ready + "/" + total;
      if (status.done || ready >= total) done = true;
      if (stallCount >= 15) {
        console.warn("Image generation stalled -- proceeding with partial results");
        done = true;
      }
    } catch(pollErr) {
      console.warn("Poll error:", pollErr.message);
    }
  }

  await batchPromise.catch(function() {});
  setProgress(98);
  if (generateStatus) generateStatus.textContent = "Almost ready...";
}

generateBookBtn?.addEventListener("click", async function() {
  try {
    generateBookBtn.disabled    = true;
    generateBookBtn.textContent = "Generating...";
    if (generateStatus) generateStatus.textContent = "Starting...";
    setProgress(2);

    var bookId       = await createBookRecordIfNeeded();
    var characterRef = await generateCharacterReference(bookId);
    var bookResponse = await generateBookStory(bookId, characterRef);
    await generateCoverImage(bookId, characterRef, bookResponse);
    await generateAllPageImages(bookId);

    updateBookData({ purchaseUnlocked: false });
    setProgress(100);
    if (generateStatus) generateStatus.textContent = "Done! Opening your book...";
    setTimeout(function() {
      window.location.href = "cover.html?bookId=" + encodeURIComponent(bookId);
    }, 800);

  } catch(error) {
    console.error("generate.js failed:", error);
    if (generateStatus) generateStatus.textContent = "Error: " + (error.message || "Something went wrong. Please try again.");
    generateBookBtn.disabled    = false;
    generateBookBtn.textContent = "Generate Book";
  }
});

if (backToSetupBtn) {
  backToSetupBtn.addEventListener("click", function() { window.location.href = "setup.html"; });
}
if (backToCropBtn) {
  backToCropBtn.addEventListener("click", function() { window.location.href = "crop.html"; });
}
