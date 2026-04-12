import { getBookData, updateBookData } from "./js/state.js";

const API_BASE = window.location.origin;
const wizardData = getBookData();

if (!wizardData.croppedPhoto || !wizardData.childName || !wizardData.storyIdea || !wizardData.illustrationStyle) {
  window.location.href = "wizard.html";
}

const generateBookBtn  = document.getElementById("generateBookBtn");
const backToSetupBtn   = document.getElementById("backToSetupBtn");
const backToCropBtn    = document.getElementById("backToCropBtn");
const generateStatus   = document.getElementById("generateStatus");
const stepStory        = document.getElementById("stepStory");
const stepPreview      = document.getElementById("stepPreview");

if (document.getElementById("uploadedPhotoPreview")) {
  document.getElementById("uploadedPhotoPreview").src = wizardData.croppedPhoto;
}

// Progress bar
var progressWrap = document.createElement("div");
progressWrap.style.cssText = "display:none;margin-top:16px;background:rgba(255,255,255,0.06);border-radius:14px;overflow:hidden;height:22px;border:1px solid rgba(240,196,109,0.14);";
var progressBar = document.createElement("div");
progressBar.id = "progressBar";
progressBar.style.cssText = "height:100%;width:0%;border-radius:14px;background:linear-gradient(90deg,#f0c46d,#d08e2b);transition:width 0.6s ease;";
progressWrap.appendChild(progressBar);
if (generateStatus) generateStatus.parentElement.insertBefore(progressWrap, generateStatus.nextSibling);

function setStatus(text) {
  if (generateStatus) generateStatus.textContent = text;
}

function setProgress(pct) {
  progressWrap.style.display = "block";
  progressBar.style.width = Math.min(100, Math.round(pct)) + "%";
}

async function apiJson(url, options, timeoutMs) {
  if (!timeoutMs) timeoutMs = 90000;
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, timeoutMs);
  try {
    var res = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    clearTimeout(timer);
    var text = await res.text();
    var json;
    try { json = JSON.parse(text); } catch(e) { throw new Error("Non-JSON response from server"); }
    if (!res.ok) throw new Error((json && (json.message || json.details)) || "Request failed");
    return json;
  } catch(err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new Error("Request timed out - please try again");
    throw err;
  }
}

async function withRetry(fn, retries) {
  if (!retries) retries = 2;
  for (var i = 1; i <= retries; i++) {
    try { return await fn(); }
    catch(err) {
      if (i === retries) throw err;
      setStatus("Retrying... (" + (i+1) + "/" + retries + ")");
      await new Promise(function(r) { setTimeout(r, 2000); });
    }
  }
}

async function createBookRecord() {
  if (wizardData.bookId) return wizardData.bookId;
  var result = await apiJson(API_BASE + "/api/books/create", {
    method: "POST",
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
  updateBookData({ bookId: result.bookId });
  return result.bookId;
}

async function patchBook(bookId, patch) {
  if (!bookId) return;
  await apiJson(API_BASE + "/api/books/" + bookId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  }, 10000);
}

// Step 1: Generate story text (no images, fast ~10s)
async function generateStory(bookId) {
  setStatus("Writing the story...");
  setProgress(20);
  if (stepStory) stepStory.classList.add("active");

  var result = await withRetry(function() {
    return apiJson(API_BASE + "/create-book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        child_name:         wizardData.childName         || "",
        age:                wizardData.childAge          || "",
        gender:             wizardData.childGender       || "",
        story_type:         wizardData.storyIdea         || "A magical adventure",
        illustration_style: wizardData.illustrationStyle || "Soft Storybook",
        character_reference: {
          characterPromptCore: "A child named " + wizardData.childName + ", age " + wizardData.childAge,
          characterSummary:    wizardData.childName + " is a " + wizardData.childAge + " year old " + (wizardData.childGender || "child")
        }
      })
    }, 30000);
  });

  var generatedBook = {
    title:    result.title    || "",
    subtitle: result.subtitle || "",
    pages:    result.pages    || []
  };

  updateBookData({ generatedBook: generatedBook });
  await patchBook(bookId, { generatedBook: generatedBook });
  setProgress(40);
  return result;
}

// Step 2: Generate cover + kick off page images in background
async function generateCover(bookId, storyResult) {
  setStatus("Creating the cover...");
  setProgress(50);
  if (stepPreview) stepPreview.classList.add("active");

  var result = await withRetry(function() {
    return apiJson(API_BASE + "/generate-cover-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:               storyResult.title    || "",
        subtitle:            storyResult.subtitle || "",
        story_type:          wizardData.storyIdea || "",
        illustration_style:  wizardData.illustrationStyle || "Soft Storybook",
        characterPromptCore: "A child named " + wizardData.childName,
        characterSummary:    wizardData.childName + " the hero"
      })
    }, 60000);
  });

  if (result.coverImageBase64) {
    var coverSrc = "data:image/png;base64," + result.coverImageBase64;
    sessionStorage.setItem("coverImage", coverSrc);
    await patchBook(bookId, { coverImage: coverSrc });
  }

  setProgress(70);
}

// Step 3: Kick off page images (fire & forget — preview.html polls for them)
async function startPageImages(bookId) {
  setStatus("Generating illustrations...");
  setProgress(80);

  // Fire and forget — don't await
  apiJson(API_BASE + "/api/books/" + bookId + "/generate-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  }, 300000).catch(function(e) {
    console.warn("Page images batch error (partial ok):", e.message);
  });

  // Wait 8 seconds to let at least 1 image start
  await new Promise(function(r) { setTimeout(r, 8000); });
  setProgress(95);
}

if (generateBookBtn) {
  generateBookBtn.addEventListener("click", async function() {
    try {
      generateBookBtn.disabled    = true;
      generateBookBtn.textContent = "Generating...";
      setStatus("Starting...");
      setProgress(5);

      var bookId      = await createBookRecord();
      var storyResult = await generateStory(bookId);
      await generateCover(bookId, storyResult);
      await startPageImages(bookId);

      updateBookData({ purchaseUnlocked: false });
      setProgress(100);
      setStatus("Done! Opening preview...");

      setTimeout(function() {
        window.location.href = "preview.html?bookId=" + encodeURIComponent(bookId);
      }, 800);

    } catch(error) {
      console.error("generate.js error:", error);
      setStatus("Error: " + (error.message || "Something went wrong. Please try again."));
      generateBookBtn.disabled    = false;
      generateBookBtn.textContent = "Generate Book";
    }
  });
}

if (backToSetupBtn) backToSetupBtn.addEventListener("click", function() { window.location.href = "wizard.html"; });
if (backToCropBtn)  backToCropBtn.addEventListener("click",  function() { window.location.href = "crop.html"; });
