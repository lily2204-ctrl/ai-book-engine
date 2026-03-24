import { getBookData } from "./js/state.js";

const data = getBookData();

const urlParams = new URLSearchParams(window.location.search);
const bookId = urlParams.get("bookId");

if (!bookId) {
  alert("Missing bookId");
  window.location.href = "wizard.html";
}

// ===== Shopify CONFIG =====
const SHOP_DOMAIN = "lifebook-464.myshopify.com";

const VARIANTS = {
  digital: "43110468845634",
  printed: "43110480674882"
};

// ===== UI ELEMENTS =====
const proceedBtn = document.getElementById("proceedToPaymentBtn");
const statusBox = document.getElementById("checkoutStatus");

// ===== DATA =====
let selectedFormat = data.selectedFormat || "digital";

// ===== HELPERS =====
function toBase64UrlUtf8(obj) {
  const json = JSON.stringify(obj);

  const utf8Bytes = new TextEncoder().encode(json);
  let binary = "";

  utf8Bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildCheckoutUrl() {
  const variantId = VARIANTS[selectedFormat];

  const properties = {
    _bookId: bookId,
    _childName: data.childName || "",
    _style: data.illustrationStyle || "",
    _story: data.storyIdea || "",
    _format: selectedFormat
  };

  const encodedProps = toBase64UrlUtf8(properties);

  return `https://${SHOP_DOMAIN}/cart/${variantId}:1?properties=${encodedProps}`;
}

// ===== CLICK =====
proceedBtn?.addEventListener("click", () => {
  try {
    const checkoutUrl = buildCheckoutUrl();

    if (statusBox) {
      statusBox.textContent = "Redirecting to secure Shopify checkout...";
    }

    window.location.href = checkoutUrl;
  } catch (error) {
    console.error("Shopify redirect failed:", error);

    if (statusBox) {
      statusBox.textContent = "Failed to open Shopify checkout.";
    }

    alert("Failed to open Shopify checkout.");
  }
});
