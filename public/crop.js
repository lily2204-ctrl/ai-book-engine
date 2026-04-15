import { getBookData, updateBookData } from "./js/state.js";

const cropCanvas   = document.getElementById("cropCanvas");
const cropCtx      = cropCanvas.getContext("2d");
const zoomSlider   = document.getElementById("zoomSlider");
const zoomValueEl  = document.getElementById("zoomValue");
const continueBtn  = document.getElementById("continueAfterCrop");
const resetBtn     = document.getElementById("resetCropBtn");
const backBtn      = document.getElementById("backToWizard");
const chooseNewBtn = document.getElementById("chooseNewPhotoBtn");

const bookData      = getBookData();
const uploadedPhoto = bookData.originalPhoto;

const sourceImage = new Image();
let scale = 1, offsetX = 0, offsetY = 0;
let isDragging = false, startDragX = 0, startDragY = 0;

if (!uploadedPhoto) { window.location.href = "wizard.html"; }

sourceImage.src = uploadedPhoto;
sourceImage.onload = function() { fitImageInitially(); drawCanvas(); earlyStartGeneration(); };

// ── Early generation: create book record + start generate-full in background
// This runs as soon as the user lands on crop page — saves ~90 seconds
var earlyBookId = null;
var earlyStarted = false;

async function earlyStartGeneration() {
  if (earlyStarted) return;
  earlyStarted = true;
  try {
    var data = getBookData();
    if (!data.childName || !data.storyIdea) return; // not enough info yet

    // Export a quick crop for early generation (center crop)
    var tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = tmpCanvas.height = 768;
    var tc = tmpCanvas.getContext('2d');
    var iw = sourceImage.width * scale, ih = sourceImage.height * scale;
    var cx = (tmpCanvas.width - iw) / 2 + offsetX;
    var cy = (tmpCanvas.height - ih) / 2 + offsetY;
    tc.save(); tc.beginPath(); tc.arc(384, 384, 320, 0, Math.PI * 2); tc.closePath(); tc.clip();
    tc.drawImage(sourceImage, cx, cy, iw, ih);
    tc.restore();
    var earlyCrop = tmpCanvas.toDataURL('image/jpeg', 0.9);

    var res = await fetch(window.location.origin + '/api/books/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        childName:         data.childName         || '',
        childAge:          data.childAge          || '',
        childGender:       data.childGender       || '',
        storyIdea:         data.storyIdea         || '',
        illustrationStyle: data.illustrationStyle || 'Soft Storybook',
        croppedPhoto:      earlyCrop,
        originalPhoto:     data.originalPhoto     || '',
        customerEmail:     data.customerEmail     || ''
      })
    });
    var json = await res.json();
    earlyBookId = json.bookId || null;
    if (earlyBookId) {
      updateBookData({ bookId: earlyBookId });
      // Kick generate-full immediately in background
      fetch(window.location.origin + '/api/books/' + earlyBookId + '/generate-full', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }
      }).catch(function(e) { console.warn('early generate-full:', e.message); });
      console.log('Early generation started for bookId:', earlyBookId);
    }
  } catch(e) {
    console.warn('Early generation failed (non-critical):', e.message);
    earlyBookId = null;
  }
}

function fitImageInitially() {
  var cw = cropCanvas.width, ch = cropCanvas.height;
  var ir = sourceImage.width / sourceImage.height;
  scale  = ir > cw/ch ? ch / sourceImage.height : cw / sourceImage.width;
  scale  = Math.max(scale, 0.9);
  zoomSlider.value = String(scale);
  zoomValueEl.textContent = Math.round(scale * 100) + "%";
  offsetX = 0; offsetY = 0;
}

function drawCanvas() {
  cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
  var iw = sourceImage.width * scale, ih = sourceImage.height * scale;
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

// Mouse drag
cropCanvas.addEventListener("mousedown",  function(e) { isDragging = true; startDragX = e.offsetX; startDragY = e.offsetY; });
cropCanvas.addEventListener("mousemove",  function(e) { if (!isDragging) return; offsetX += e.offsetX - startDragX; offsetY += e.offsetY - startDragY; startDragX = e.offsetX; startDragY = e.offsetY; drawCanvas(); });
cropCanvas.addEventListener("mouseup",    function() { isDragging = false; });
cropCanvas.addEventListener("mouseleave", function() { isDragging = false; });

// Touch drag
cropCanvas.addEventListener("touchstart", function(e) { var r = cropCanvas.getBoundingClientRect(), t = e.touches[0]; isDragging = true; startDragX = t.clientX - r.left; startDragY = t.clientY - r.top; }, { passive: true });
cropCanvas.addEventListener("touchmove",  function(e) { if (!isDragging) return; e.preventDefault(); var r = cropCanvas.getBoundingClientRect(), t = e.touches[0]; var x = t.clientX - r.left, y = t.clientY - r.top; offsetX += x - startDragX; offsetY += y - startDragY; startDragX = x; startDragY = y; drawCanvas(); }, { passive: false });
cropCanvas.addEventListener("touchend",   function() { isDragging = false; });

// ── Continue: use early bookId if ready, otherwise create new ────────────────
continueBtn.addEventListener("click", async function() {
  try {
    continueBtn.disabled = true;
    continueBtn.textContent = "Creating your book...";

    // 1. Export final cropped image
    var exportCanvas = document.createElement("canvas");
    exportCanvas.width = exportCanvas.height = 768;
    var ec  = exportCanvas.getContext("2d");
    var iw  = sourceImage.width  * scale, ih = sourceImage.height * scale;
    var cx  = (cropCanvas.width  - iw) / 2 + offsetX;
    var cy  = (cropCanvas.height - ih) / 2 + offsetY;
    var rat = exportCanvas.width / cropCanvas.width;
    ec.save(); ec.beginPath(); ec.arc(384, 384, 320, 0, Math.PI * 2); ec.closePath(); ec.clip();
    ec.drawImage(sourceImage, cx * rat, cy * rat, iw * rat, ih * rat);
    ec.restore();

    var croppedPhoto = exportCanvas.toDataURL("image/jpeg", 0.9);
    updateBookData({ croppedPhoto });

    var bookId = earlyBookId;

    if (bookId) {
      // Early generation already running! Just update the final crop photo
      console.log("Using early bookId:", bookId);
      fetch(window.location.origin + "/api/books/" + bookId + "/update-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ croppedPhoto })
      }).catch(function(e) { console.warn("update-photo:", e.message); });
    } else {
      // Fallback: create + kick now
      var data = getBookData();
      var createRes = await fetch(window.location.origin + "/api/books/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childName:          data.childName          || "",
          childAge:           data.childAge           || "",
          childGender:        data.childGender        || "",
          storyIdea:          data.storyIdea          || "",
          illustrationStyle:  data.illustrationStyle  || "Soft Storybook",
          croppedPhoto:       croppedPhoto,
          originalPhoto:      data.originalPhoto      || "",
          customerEmail:      data.customerEmail      || ""
        })
      });
      var createData = await createRes.json();
      bookId = createData.bookId || "";
      updateBookData({ bookId });
      if (bookId) {
        fetch(window.location.origin + "/api/books/" + bookId + "/generate-full", {
          method: "POST", headers: { "Content-Type": "application/json" }
        }).catch(function(e) { console.warn("generate-full kick:", e.message); });
      }
    }

    window.location.href = "preview.html?bookId=" + encodeURIComponent(bookId);

  } catch(err) {
    console.error("crop continue failed:", err);
    continueBtn.disabled = false;
    continueBtn.textContent = "✓ Create My Book";
    alert("Something went wrong. Please try again.");
  }
});


backBtn      && backBtn.addEventListener("click",      function() { window.location.href = "wizard.html"; });
chooseNewBtn && chooseNewBtn.addEventListener("click", function() { updateBookData({ originalPhoto: "", croppedPhoto: "" }); window.location.href = "wizard.html"; });
