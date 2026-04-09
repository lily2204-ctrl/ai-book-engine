import { getBookData, updateBookData } from "./js/state.js";

const cropCanvas      = document.getElementById("cropCanvas");
const cropCtx         = cropCanvas.getContext("2d");
const zoomSlider      = document.getElementById("zoomSlider");
const zoomValueEl     = document.getElementById("zoomValue");
const continueBtn     = document.getElementById("continueAfterCrop");
const resetBtn        = document.getElementById("resetCropBtn");
const backBtn         = document.getElementById("backToWizard");
const chooseNewBtn    = document.getElementById("chooseNewPhotoBtn");

const bookData      = getBookData();
const uploadedPhoto = bookData.originalPhoto;

const sourceImage = new Image();
let scale     = 1;
let offsetX   = 0;
let offsetY   = 0;
let isDragging   = false;
let startDragX   = 0;
let startDragY   = 0;

if (!uploadedPhoto) {
  window.location.href = "wizard.html";
}

sourceImage.src = uploadedPhoto;
sourceImage.onload = function() { fitImageInitially(); drawCanvas(); };

function fitImageInitially() {
  var cw = cropCanvas.width;
  var ch = cropCanvas.height;
  var ir = sourceImage.width / sourceImage.height;
  var cr = cw / ch;
  scale  = ir > cr ? ch / sourceImage.height : cw / sourceImage.width;
  scale  = Math.max(scale, 0.9);
  zoomSlider.value    = String(scale);
  zoomValueEl.textContent = Math.round(scale * 100) + "%";
  offsetX = 0; offsetY = 0;
}

function drawCanvas() {
  cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
  var iw = sourceImage.width * scale;
  var ih = sourceImage.height * scale;
  var cx = (cropCanvas.width  - iw) / 2 + offsetX;
  var cy = (cropCanvas.height - ih) / 2 + offsetY;
  cropCtx.drawImage(sourceImage, cx, cy, iw, ih);
}

zoomSlider.addEventListener("input", function(e) {
  scale = parseFloat(e.target.value);
  zoomValueEl.textContent = Math.round(scale * 100) + "%";
  drawCanvas();
});

resetBtn.addEventListener("click", function() { fitImageInitially(); drawCanvas(); });

cropCanvas.addEventListener("mousedown",  function(e) { isDragging = true; startDragX = e.offsetX; startDragY = e.offsetY; });
cropCanvas.addEventListener("mousemove",  function(e) {
  if (!isDragging) return;
  offsetX += e.offsetX - startDragX; offsetY += e.offsetY - startDragY;
  startDragX = e.offsetX; startDragY = e.offsetY;
  drawCanvas();
});
cropCanvas.addEventListener("mouseup",    function() { isDragging = false; });
cropCanvas.addEventListener("mouseleave", function() { isDragging = false; });

cropCanvas.addEventListener("touchstart", function(e) {
  var r = cropCanvas.getBoundingClientRect();
  var t = e.touches[0];
  isDragging = true;
  startDragX = t.clientX - r.left;
  startDragY = t.clientY - r.top;
}, { passive: true });

cropCanvas.addEventListener("touchmove", function(e) {
  if (!isDragging) return;
  e.preventDefault();
  var r = cropCanvas.getBoundingClientRect();
  var t = e.touches[0];
  var x = t.clientX - r.left;
  var y = t.clientY - r.top;
  offsetX += x - startDragX; offsetY += y - startDragY;
  startDragX = x; startDragY = y;
  drawCanvas();
}, { passive: false });

cropCanvas.addEventListener("touchend", function() { isDragging = false; });

// --- Continue -- crop, save, start background generation, go to preview --------
continueBtn.addEventListener("click", async function() {
  try {
    continueBtn.disabled    = true;
    continueBtn.textContent = "Preparing...";

    // 1. Export cropped image
    var exportCanvas = document.createElement("canvas");
    exportCanvas.width  = 768;
    exportCanvas.height = 768;
    var ec  = exportCanvas.getContext("2d");
    var iw  = sourceImage.width  * scale;
    var ih  = sourceImage.height * scale;
    var cx  = (cropCanvas.width  - iw) / 2 + offsetX;
    var cy  = (cropCanvas.height - ih) / 2 + offsetY;
    var rat = exportCanvas.width / cropCanvas.width;

    ec.save();
    ec.beginPath();
    ec.arc(384, 384, 320, 0, Math.PI * 2);
    ec.closePath();
    ec.clip();
    ec.drawImage(sourceImage, cx * rat, cy * rat, iw * rat, ih * rat);
    ec.restore();

    var croppedPhoto = exportCanvas.toDataURL("image/jpeg", 0.9);
    updateBookData({ croppedPhoto: croppedPhoto });

    // 2. Create book record on server immediately
    var data = getBookData();
    var createRes = await fetch(window.location.origin + "/api/books/create", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        childName:         data.childName         || "",
        childAge:          data.childAge          || "",
        childGender:       data.childGender       || "",
        storyIdea:         data.storyIdea         || "",
        illustrationStyle: data.illustrationStyle || "Soft Storybook",
        croppedPhoto:      croppedPhoto,
        originalPhoto:     data.originalPhoto     || ""
      })
    });
    var createData = await createRes.json();
    var bookId = createData.bookId || "";
    updateBookData({ bookId: bookId });

    // 3. Kick off background generation (fire and forget -- don't await)
    if (bookId) {
      startBackgroundGeneration(bookId, croppedPhoto, data);
    }

    // 4. Go straight to preview page
    window.location.href = "preview.html?bookId=" + encodeURIComponent(bookId);

  } catch(err) {
    console.error("crop continue failed:", err);
    continueBtn.disabled    = false;
    continueBtn.textContent = "Continue";
    alert("Something went wrong. Please try again.");
  }
});

// --- Background generation -- runs after redirect -----------------------------
// Stores progress in sessionStorage so preview.html can poll it
function startBackgroundGeneration(bookId, croppedPhoto, data) {
  var API = window.location.origin;

  sessionStorage.setItem("bg_bookId", bookId);
  sessionStorage.setItem("bg_status", "generating");
  sessionStorage.setItem("bg_previewReady", "false");

  (async function() {
    try {
      // Step 1: Character reference (text only -- skip image sheet for speed)
      var charRes = await fetch(API + "/generate-character-reference", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          child_photo:        croppedPhoto,
          child_name:         data.childName         || "",
          age:                data.childAge          || "",
          gender:             data.childGender       || "",
          illustration_style: data.illustrationStyle || "Soft Storybook"
        })
      });
      var charData = await charRes.json();
      var characterRef = {
        characterDNA:        charData.characterDNA        || {},
        characterPromptCore: charData.characterPromptCore || "",
        characterSummary:    charData.characterSummary    || ""
      };

      // Save character ref to server
      await fetch(API + "/api/books/" + bookId, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ characterReference: characterRef })
      });

      // Step 2: Story text
      var storyRes = await fetch(API + "/create-book", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          child_name:         data.childName         || "",
          age:                data.childAge          || "",
          gender:             data.childGender       || "",
          story_type:         data.storyIdea         || "A magical adventure",
          illustration_style: data.illustrationStyle || "Soft Storybook",
          character_reference: characterRef
        })
      });
      var storyData = await storyRes.json();
      var generatedBook = {
        title:               storyData.title    || "",
        subtitle:            storyData.subtitle || "",
        pages:               storyData.pages    || [],
        characterDNA:        characterRef.characterDNA,
        characterPromptCore: characterRef.characterPromptCore,
        characterSummary:    characterRef.characterSummary
      };

      await fetch(API + "/api/books/" + bookId, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ generatedBook: generatedBook })
      });

      sessionStorage.setItem("bg_title",    generatedBook.title);
      sessionStorage.setItem("bg_subtitle", generatedBook.subtitle);

      // Step 3: First 2 page images + cover in parallel
      var pages = generatedBook.pages || [];

      var [coverResult, page0Result, page1Result] = await Promise.allSettled([
        fetch(API + "/generate-cover-image", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title:               generatedBook.title,
            subtitle:            generatedBook.subtitle,
            story_type:          data.storyIdea || "",
            illustration_style:  data.illustrationStyle || "Soft Storybook",
            characterPromptCore: characterRef.characterPromptCore,
            characterSummary:    characterRef.characterSummary
          })
        }).then(function(r) { return r.json(); }),

        pages[0] ? fetch(API + "/generate-image", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt:              pages[0].imagePrompt || "",
            illustration_style:  data.illustrationStyle || "Soft Storybook",
            characterPromptCore: characterRef.characterPromptCore
          })
        }).then(function(r) { return r.json(); }) : Promise.resolve(null),

        pages[1] ? fetch(API + "/generate-image", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt:              pages[1].imagePrompt || "",
            illustration_style:  data.illustrationStyle || "Soft Storybook",
            characterPromptCore: characterRef.characterPromptCore
          })
        }).then(function(r) { return r.json(); }) : Promise.resolve(null)
      ]);

      // Save cover
      if (coverResult.status === "fulfilled" && coverResult.value && coverResult.value.coverImageBase64) {
        var coverSrc = "data:image/png;base64," + coverResult.value.coverImageBase64;
        sessionStorage.setItem("bg_coverImage", coverSrc);
        await fetch(API + "/api/books/" + bookId, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ coverImage: coverSrc })
        });
      }

      // Save first 2 page images
      var fullImages = new Array(pages.length).fill(null);

      if (page0Result.status === "fulfilled" && page0Result.value && page0Result.value.imageBase64) {
        fullImages[0] = "data:image/png;base64," + page0Result.value.imageBase64;
      }
      if (page1Result.status === "fulfilled" && page1Result.value && page1Result.value.imageBase64) {
        fullImages[1] = "data:image/png;base64," + page1Result.value.imageBase64;
      }

      await fetch(API + "/api/books/" + bookId, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ fullImages: fullImages })
      });

      // Signal preview is ready
      sessionStorage.setItem("bg_previewReady", "true");
      sessionStorage.setItem("bg_status", "preview_ready");

      // Step 4: Continue remaining pages in background (don't block)
      fetch(API + "/api/books/" + bookId + "/generate-images", {
        method:  "POST",
        headers: { "Content-Type": "application/json" }
      }).catch(function(e) { console.warn("bg remaining pages:", e.message); });

      sessionStorage.setItem("bg_status", "done");

    } catch(err) {
      console.error("Background generation error:", err);
      sessionStorage.setItem("bg_status", "error");
      sessionStorage.setItem("bg_error", err.message || "Generation failed");
    }
  })();
}

backBtn && backBtn.addEventListener("click", function() { window.location.href = "wizard.html"; });
chooseNewBtn && chooseNewBtn.addEventListener("click", function() {
  updateBookData({ originalPhoto: "", croppedPhoto: "" });
  window.location.href = "wizard.html";
});
