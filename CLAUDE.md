# Lifebook AI — Project Context & Status
*Last updated: April 15, 2026*

## ⚠️ DO NOT MODIFY — ALREADY DONE
These things are COMPLETE. Do not revert, replace, or remove them:
- `public/assets/branding/logo.svg` — new logo, correct viewBox `430 466 639 514`, transparent bg
- All HTML pages use `<img src="assets/branding/logo.svg" style="height:48px;width:auto;display:block"/>` — NO mix-blend-mode, NO logo.png
- `public/accessibility.js` — accessibility widget, already added to ALL html pages via `<script src="accessibility.js"></script>` before `</body>`
- `public/404.html` — Hebrew 404 page, already exists
- Two-email system in server.js — `sendPaymentConfirmationEmail` + `sendBookReadyEmail`
- `updateBookField()` function — DO NOT replace with `updateBook()` for image saves
- `CLAUDE.md` — this file, do not overwrite

---

## Project Overview
AI-powered personalized children's storybook generator.
User fills wizard → uploads photo → AI generates 15-page illustrated book → payment → PDF download + email.

## URLs
- **Live site:** https://lifebooks.online
- **Railway app:** https://romantic-patience-production.up.railway.app

## Stack
- **Backend:** Node.js / Express (`server.js`) — ES modules (`import`)
- **Frontend:** Plain HTML/CSS/JS in `public/` folder
- **DB:** Supabase (PostgreSQL) — Pro plan
- **Payments:** Stripe (sandbox only — live not yet configured)
- **Email:** Resend (`books@lifebooks.online`) — ✅ Verified
- **AI:** OpenAI `gpt-4o-mini` (story) + `gpt-image-1` (images)
- **Hosting:** Railway

---

## User Flow
```
index.html → wizard.html → crop.html → [setup.html] → preview.html → checkout.html → success.html → delivery.html → reader.html
```
Both `crop.js` and `setup.js` call `/api/books/create` then kick `/api/books/:id/generate-full` (fire & forget), then redirect to `preview.html?bookId=...`

---

## Design System
```css
--cream:#fdf6ec; --cream-deep:#f5e9d4; --parchment:#ede0c8;
--gold:#c8922a; --gold-light:#e8b84b; --gold-pale:#f5d98a;
--brown:#5c3d1e; --text:#3a2810; --text-muted:#7a6048;
--shadow-warm:0 8px 40px rgba(100,60,20,0.12);
```
- Fonts: Playfair Display (headings) + Lato (body)
- Logo: `assets/branding/logo.svg` (viewBox: `430 466 639 514`, transparent bg, color `#8b6e6e`)

---

## Server Architecture

### Key Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/books/create` | POST | Creates book record in Supabase |
| `/api/books/:id/generate-full` | POST | Full pipeline — background IIFE, returns immediately |
| `/api/books/:id/generate-images` | POST | Page images only — background IIFE |
| `/api/books/:id` | GET | Fetch book data (used for polling every 2.5s) |
| `/api/books/:id/unlock` | POST | Manual unlock (dev/testing) |
| `/api/books/:id/resend-email` | POST | Resend book link email |
| `/api/books/:id/update-photo` | POST | Update cropped photo after early generation |
| `/api/create-checkout-session` | POST | Creates Stripe checkout session |
| `/webhooks/stripe` | POST | Stripe webhook — unlocks book + sends confirmation email |
| `/api/contact` | POST | Contact form |

### generate-full Pipeline (background IIFE)
```
STEP 1: Analyze photo with Vision API → characterReference saved (~30s)
STEP 2: Write story with GPT-4o-mini → generatedBook saved (~60s)
STEP 3+4a: Cover + pages 0,1 IN PARALLEL → saved individually (~60s)
STEP 4b: Remaining pages in batches of 5 → each saved immediately on completion (~5min)
STEP 5: Send "book ready" email — ONLY if purchaseUnlocked === true
```

### ⚠️ Critical: Image Saving
**MUST use `updateBookField()` for saving images** — NOT `updateBook()`.
`updateBook()` returns full row via `.select().maybeSingle()` → row up to 24MB → Supabase timeout.
`updateBookField()` does update without `.select()` → safe for large data.

### Email System
- **Mail 1:** "Payment confirmed — book being created" → sent immediately on Stripe webhook
- **Mail 2:** "Book ready!" → sent at end of generate-full ONLY when `purchaseUnlocked === true`
- Edge case: if book already complete when payment arrives → both emails sent together
- All from: `books@lifebooks.online`

### Background IIFE Pattern
```javascript
res.json({ status: "ok" }); // respond immediately
(async () => {
  try { /* heavy work */ }
  catch (err) { console.error("error:", err.message); }
})();
return;
```

---

## Image Generation
- Model: `gpt-image-1`, size `1024x1024`
- Compressed to JPEG ~40-80KB before saving (was PNG ~1.5MB)
- Cover + pages 0,1 generated IN PARALLEL after story is done
- Each image saved to DB immediately when ready (not batch)
- BATCH_SIZE = 5 for remaining pages
- Total time: ~7-8 minutes for full book

---

## Frontend — Key Behaviors

### preview.html
- Polls every 2.5s for book updates
- Shows story text immediately when `generatedBook` exists
- Shows images as they arrive (placeholders "Illustrating..." until ready)
- **Unlock button** enabled only after cover + 2 page images exist
- Progress counter: "✨ X/16 pages illustrated"
- Message: "You can close this tab — we'll email you when ready"

### delivery.html
- Live progress bar: "X/16 pages ready — ~N min remaining"
- ETA = remaining pages × 25 seconds
- Images fade in as they arrive via polling
- "✅ Your book is complete!" when done, bar hides after 3s
- Polls every 2.5s, up to 60 times (2.5 min)
- After timeout: "Close the browser — we'll email you"

### success.html
- "Resend book link to my email" button
- Calls `/api/books/:id/resend-email`

---

## Accessibility (public/accessibility.js)
Floating widget on ALL pages with:
- High contrast mode
- Highlight links
- Font size controls (12-24px)
- Saves preferences to localStorage
- All nav buttons have `aria-label`

---

## Hebrew Support
- wizard.html has 🌐 language toggle with full RTL
- If child's name contains Hebrew characters → story written entirely in Hebrew
- `imagePrompt` always in English (required for image generation API)

---

## Payments — Current Status
- **Stripe:** US account sandbox only — live requires SSN (not available)
- **Payoneer:** ✅ Approved — will receive funds from future payment processor
- **TODO:** Integrate LemonSqueezy OR PayPlus
  - LemonSqueezy: ~1 day, ~5% fee, works immediately from Israel ← recommended for launch
  - PayPlus: ~1 week, ~1-3% fee, Israeli, supports Bit

---

## Known Issues Fixed
1. ✅ Supabase statement timeout — `updateBookField()` + JPEG compression
2. ✅ generate-full not triggered — `setup.js` was going to legacy `generate.html`
3. ✅ Stripe webhook 21% errors — returns 200 immediately, works in background
4. ✅ PDF emoji garbage (`Ø=ÜÖ`) — replaced with geometric shapes
5. ✅ Logo invisible — SVG viewBox fixed to `430 466 639 514`
6. ✅ SyntaxError crashes — orphaned `}`, broken backticks from Python edits
7. ✅ Images stuck after cover — batch saving caused Supabase timeout
8. ✅ Hebrew story — auto-detected from child name
9. ✅ Cover + pages 0,1 now parallel — saves ~60s
10. ✅ Each image saves immediately — user sees them appear one by one

---

## TODO Before Launch
### 🔴 Critical
- [ ] Payment system: LemonSqueezy (fast) or PayPlus (cheaper)
- [ ] Reduce preview load time further (target <90s for first images)
- [ ] End-to-end test with real payment

### 🟡 Important
- [ ] Terms & Refund policy page
- [ ] Consider reducing to 12 pages for faster generation

### 🟢 Nice to have
- [ ] More pages in Hebrew
- [ ] Google Analytics / Meta Pixel
- [ ] OpenAI fallback if API down
- [ ] Voice narration

---

## Railway Environment Variables
```
OPENAI_API_KEY=...
STRIPE_SECRET_KEY=sk_test_... (sandbox only)
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
RESEND_API_KEY=...
APP_URL=https://lifebooks.online
ADMIN_EMAIL=books@lifebooks.online
```

---

## File Structure
```
server.js                    — Express, ES modules
CLAUDE.md                    — This file
package.json
public/
  index.html                 — Landing page
  wizard.html/js             — Child details + photo + style (Hebrew toggle)
  crop.html/js               — Crop photo → create book → generate-full → preview
  setup.html/js              — Review details → same flow as crop
  generate.html/js           — Legacy (not used in normal flow)
  preview.html               — Loading + 2 priority images + unlock CTA
  checkout.html/js           — Payment page (Stripe)
  success.html/js            — Post-payment + resend email button
  delivery.html              — Flipbook + PDF + live progress bar
  reader.html/js             — Full-screen reader
  cover.html/js              — Cover display
  contact.html               — Contact form
  404.html                   — Hebrew error page ← DO NOT REMOVE
  accessibility.js           — Accessibility widget ← DO NOT REMOVE
  print.html
  open-book.html
  styles.css                 — Shared CSS variables
  js/state.js                — sessionStorage state management
  assets/
    branding/
      logo.svg               — Fixed SVG logo ← DO NOT REPLACE
```

---

## Critical Code Patterns

### Supabase image save (CRITICAL — use this, not updateBook)
```javascript
// ✅ CORRECT — no .select(), won't timeout
await updateBookField(bookId, { fullImages: [...fullImages] });

// ❌ WRONG — returns full row, causes Supabase timeout with large images
await updateBook(bookId, { fullImages });
```

### Cover + priority images parallel (already implemented)
```javascript
const [coverResult, page0Result, page1Result] = await Promise.allSettled([
  openai.images.generate({ model: "gpt-image-1", prompt: coverPrompt, size: "1024x1024" }),
  generatePageImage(0),
  generatePageImage(1),
]);
// Save each immediately after
```

### Each remaining image saves immediately (already implemented)
```javascript
await Promise.allSettled(batch.map(async (pageIndex) => {
  const base64 = await generatePageImage(pageIndex);
  fullImages[pageIndex] = `data:image/jpeg;base64,${base64}`;
  await updateBookField(bookId, { fullImages: [...fullImages] }); // save immediately
}));
```

### Stripe webhook — return 200 immediately
```javascript
res.status(200).send("ok"); // MUST be first
(async () => {
  await updateBook(bookId, { purchaseUnlocked: true });
  await sendPaymentConfirmationEmail(book);
  // sendBookReadyEmail called by generate-full when complete
})();
return;
```
