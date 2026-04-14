# Lifebook AI — Project Context & Status
*Last updated: April 14, 2026*

---

## Project Overview
AI-powered personalized children's storybook generator.
- User fills wizard → uploads photo → AI generates 15-page illustrated book → Stripe payment → PDF download + email

## URLs
- **Live site:** https://lifebooks.online
- **Railway app:** https://romantic-patience-production.up.railway.app
- **GitHub:** connected to Railway (auto-deploy on push)

## Stack
- **Backend:** Node.js / Express (`server.js`) — ES modules (`import`)
- **Frontend:** Plain HTML/CSS/JS in `public/` folder
- **DB:** Supabase (PostgreSQL)
- **Payments:** Stripe (checkout + webhooks)
- **Email:** Resend (`books@lifebooks.online`)
- **AI:** OpenAI `gpt-4o-mini` (story) + `gpt-image-1` (images)
- **Hosting:** Railway

## Working ZIP
`ai-book-engine-updated.zip` — updated from original `ai-book-engine-main.zip`

---

## User Flow
```
index.html → wizard.html → crop.html → [setup.html] → preview.html → checkout.html → success.html → delivery.html → reader.html
```

**Key:** `crop.js` and `setup.js` both call `/api/books/create` then kick `/api/books/:id/generate-full` (fire & forget), then redirect to `preview.html?bookId=...`

---

## Server Architecture

### Key Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/books/create` | POST | Creates book record in Supabase |
| `/api/books/:id/generate-full` | POST | Full pipeline: analyze photo → write story → cover → page images. Returns immediately, runs in background |
| `/api/books/:id/generate-images` | POST | Generates page images only. Returns immediately, runs in background |
| `/api/books/:id` | GET | Fetch book data (used for polling) |
| `/api/books/:id/unlock` | POST | Manual unlock (dev/testing) — also sends email |
| `/api/create-checkout-session` | POST | Creates Stripe session |
| `/webhooks/stripe` | POST | Stripe webhook — unlocks book + sends email after payment |
| `/api/contact` | POST | Contact form — sends email via Resend |
| `/create-book` | POST | Legacy: generates story text only (no character analysis) |
| `/generate-cover-image` | POST | Legacy: generates cover only |

### generate-full Pipeline (server-side, background)
1. Analyze child photo with Vision API → extract hair/skin/eyes/face → save `characterReference`
2. Write 15-page story with GPT-4o-mini → save `generatedBook`
3. Generate cover image with gpt-image-1 → save `coverImage`
4. Generate page images in batches of 3 (parallel) → save `fullImages` progressively
5. Email sent AFTER PAYMENT (Stripe webhook), not here

### Image Generation Details
- Model: `gpt-image-1`, size `1024x1024`
- BATCH_SIZE = 3 (parallel per batch)
- Saves to DB after each batch → clients poll and see images appear progressively
- Total time: ~5-7 minutes for 15 images

---

## Email System
- **Provider:** Resend
- **From address:** `books@lifebooks.online` (ALL emails use this domain)
- **Trigger:** Stripe `checkout.session.completed` webhook
- **Flow:** Stripe fires webhook → server returns 200 immediately → email sent in background IIFE
- **Webhook URL:** `https://romantic-patience-production.up.railway.app/webhooks/stripe`
- **Contains:** book title, child name, delivery link, "Read & Download" CTA button

---

## Design System
All pages use the same CSS variables (defined in `styles.css` and inline in each page):
```css
:root {
  --cream:       #fdf6ec;
  --cream-deep:  #f5e9d4;
  --parchment:   #ede0c8;
  --gold:        #c8922a;
  --gold-light:  #e8b84b;
  --gold-pale:   #f5d98a;
  --brown:       #5c3d1e;
  --text:        #3a2810;
  --text-muted:  #7a6048;
  --white:       #ffffff;
  --shadow-warm: 0 8px 40px rgba(100,60,20,0.12);
  --shadow-gold: 0 4px 24px rgba(200,146,42,0.22);
}
```
- Fonts: Playfair Display (headings) + Lato (body)
- Background: cream (`#fdf6ec`) — NOT dark/navy
- Logo: `assets/branding/logo.png` with `mix-blend-mode: multiply` on ALL pages

### Skill file
`/mnt/skills/user/lifebook-design/SKILL.md` — contains exact nav HTML, button CSS, card patterns. Always read before editing any page.

---

## PDF Generation (`delivery.html` → `generatePDF()`)
- Library: jsPDF 2.5.1 (loaded from cdnjs)
- **NO EMOJIS** — jsPDF doesn't support them. Use geometric shapes instead.
  - Book icon → `drawBookSymbol()` function (lines)
  - Stars/ornaments → `drawDiamond()` function (filled triangles)
  - Gold dots → `pdf.circle()`
- Waits for ALL images before starting (polls up to 3 min)
- Structure: Cover page → 15 story pages → Back cover (dark with stars)

---

## Hebrew / RTL Support
- `wizard.html` has 🌐 language toggle button (`nav-lang`)
- `toggleLang()` function switches between EN/HE
- Sets `dir="rtl"` on `<html>` element
- All text strings defined in `HE` and `EN` objects

---

## Known Issues Fixed in Current ZIP
1. ✅ `setup.js` was sending users to old `generate.html` (legacy flow without character analysis) — now uses `generate-full`
2. ✅ `generate-images` was synchronous (caused Railway timeout) — now async/background
3. ✅ Stripe webhook was waiting for email before returning 200 (21% error rate) — now returns immediately
4. ✅ Email sent before payment (premature) — now only sent after Stripe confirms payment
5. ✅ PDF had emoji garbage (`Ø=ÜÖ`) — replaced with geometric shapes
6. ✅ Cover image cropped in flipbook (wrong aspect ratio) — fixed to `object-fit: contain`
7. ✅ SyntaxError crash (orphaned `}`) — fixed
8. ✅ Logo appears as white box on cream background — added `mix-blend-mode: multiply`
9. ✅ Contact page (`contact.html`) + `/api/contact` endpoint added
10. ✅ Polling interval: 4s → 2.5s (images appear faster)

---

## Remaining TODO

### Urgent (before launch)
- [ ] **Test end-to-end** with latest ZIP — confirm images generate correctly
- [ ] **Confirm email arrives** after payment
- [ ] **New logo** — user is creating new logo (SVG/PNG with dark colors on transparent background, NOT white-on-transparent). Replace `assets/branding/logo.png` in all pages.

### Before Launch
- [ ] **Stripe live mode webhook** — currently only sandbox webhook exists. Need to add webhook in Stripe live account pointing to `https://romantic-patience-production.up.railway.app/webhooks/stripe` with event `checkout.session.completed`
- [ ] **Resend DNS verification** — confirm all 3 DNS records for `lifebooks.online` show ✅ green in Resend Dashboard (SPF, DKIM, DMARC)
- [ ] **Railway env vars** — confirm `STRIPE_WEBHOOK_SECRET` matches the LIVE webhook secret (not sandbox)
- [ ] **APP_URL** env var = `https://lifebooks.online`

### Nice to Have
- [ ] Flipbook page-turn animation enhancement
- [ ] Generation time still ~5-7 min (can't reduce without changing AI model)
- [ ] Hebrew support on more pages (currently only wizard.html)

---

## Railway Environment Variables Required
```
OPENAI_API_KEY=...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...  (must match LIVE webhook, not sandbox)
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
RESEND_API_KEY=...
APP_URL=https://lifebooks.online
ADMIN_EMAIL=books@lifebooks.online  (optional, defaults to books@lifebooks.online)
```

---

## File Structure
```
ai-book-engine-main/
├── server.js                 # Main Express server (ES modules)
├── package.json
└── public/
    ├── index.html            # Landing page
    ├── wizard.html           # Step 1: Child details + photo + style selection (has Hebrew toggle)
    ├── wizard.js
    ├── crop.html             # Step 2: Crop photo
    ├── crop.js               # Creates book record + kicks generate-full → preview
    ├── setup.html            # Step 2b: Review details (UPDATED: now also uses generate-full)
    ├── setup.js              # UPDATED: uses generate-full, not legacy generate.html
    ├── generate.html         # Legacy page (no longer reached in normal flow)
    ├── generate.js           # Legacy (no longer used in normal flow)
    ├── preview.html          # Step 3: Preview book + unlock CTA
    ├── preview.js
    ├── checkout.html         # Payment page
    ├── checkout.js
    ├── success.html          # Post-payment confirmation
    ├── success.js
    ├── delivery.html         # Main book viewer: flipbook + PDF download
    ├── reader.html           # Full-screen reader
    ├── reader.js
    ├── cover.html            # Cover display
    ├── cover.js
    ├── contact.html          # NEW: Contact form page
    ├── print.html
    ├── open-book.html
    ├── styles.css            # Shared CSS variables + nav styles
    ├── js/
    │   └── state.js          # localStorage state management
    └── assets/
        ├── branding/
        │   └── logo.png      # NEEDS REPLACEMENT with new logo (dark on transparent)
        ├── previews/         # Style preview images
        ├── backgrounds/
        ├── hero/
        ├── books/
        └── photo-tips/
```

---

## Important Code Patterns

### Background IIFE pattern (used throughout server.js)
```javascript
// Return response immediately
res.json({ status: "ok", message: "Started in background" });

// Do heavy work in background
(async () => {
  try {
    // ... long running work
  } catch (err) {
    console.error("background error:", err.message);
  }
})();
return; // already sent response
```

### Client polling pattern (delivery.html)
```javascript
// Poll every 2.5s for new images
const iv = setInterval(async () => {
  if (++n > 60) { clearInterval(iv); return; }
  const b2 = await loadBook();
  const r2 = (b2.fullImages||[]).filter(Boolean).length;
  if (r2 > ready) { ready = r2; book = b2; renderSpread(idx); }
  if (ready >= pages.length) clearInterval(iv);
}, 2500);
```

### Stripe webhook pattern
```javascript
// CRITICAL: Return 200 IMMEDIATELY, then do work in background
res.status(200).send("ok");

(async () => {
  await updateBook(bookId, { purchaseUnlocked: true });
  const paidBook = await getBook(bookId);
  await sendBookReadyEmail(paidBook);
})();

return; // already sent
```
