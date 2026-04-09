import { getBookData } from "./js/state.js";
var data = getBookData();
if (!data.croppedPhoto) { window.location.href = "crop.html"; }
var photo   = document.getElementById("previewCroppedPhoto");
var summary = document.getElementById("setupSummary");
var backBtns = [document.getElementById("backToCropBtn"), document.getElementById("backToCropBtn2")];
var continueBtn = document.getElementById("continueToStoryBtn");
if (photo) photo.src = data.croppedPhoto;
if (summary) {
  var rows = [["Child name", data.childName || "-"], ["Age", data.childAge || "-"], ["Gender", data.childGender || "-"], ["Illustration style", data.illustrationStyle || "-"], ["Story direction", data.storyIdea || "-"]];
  summary.innerHTML = rows.map(function(r) {
    return '<div class="summary-row"><span class="summary-label">' + r[0] + '</span><span class="summary-value">' + r[1] + '</span></div>';
  }).join("");
}
backBtns.forEach(function(b) { b && b.addEventListener("click", function() { window.location.href = "crop.html"; }); });
continueBtn && continueBtn.addEventListener("click", function() { window.location.href = "generate.html"; });
