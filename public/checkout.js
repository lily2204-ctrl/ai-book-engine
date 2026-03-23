import { getBookData } from "./js/state.js";

const data = getBookData();

const urlParams = new URLSearchParams(window.location.search);
const bookId = urlParams.get("bookId");

if (!bookId) {
  alert("Missing bookId");
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

// ===== BUILD SHOPIFY URL =====
function buildCheckoutUrl() {
  const variantId = VARIANTS[selectedFormat];

  const properties = {
    _bookId: bookId,
    _childName: data.childName || "",
    _style: data.illustrationStyle || "",
    _story: data.storyIdea || "",
    _format: selectedFormat
  };

  const encodedProps = btoa(JSON.stringify(properties));

  return `https://${SHOP_DOMAIN}/cart/${variantId}:1?properties=${encodedProps}`;
}

// ===== CLICK =====
proceedBtn?.addEventListener("click", () => {
  const checkoutUrl = buildCheckoutUrl();

  statusBox.textContent = "Redirecting to secure checkout...";

  window.location.href = checkoutUrl;
});
