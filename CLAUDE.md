# Lifebook AI — Project Context & Status
*Last updated: April 15, 2026*

## ⚠️ DO NOT MODIFY — ALREADY DONE
These things are COMPLETE. Do not revert, replace, or remove them:
- `public/assets/branding/logo.svg` — new logo, correct viewBox, transparent bg
- All HTML pages use `<img src="assets/branding/logo.svg" style="height:48px;width:auto;display:block"/>` — NO mix-blend-mode, NO logo.png
- `public/accessibility.js` — accessibility widget, already added to ALL html pages
- `public/404.html` — Hebrew 404 page, already exists
- `<script src="accessibility.js"></script>` — already in every HTML page before `</body>`
- Two-email system in server.js — sendPaymentConfirmationEmail + sendBookReadyEmail
- `updateBookField()` function — DO NOT replace with `updateBook()` for image saves

---

## Project Overview
AI-powered personalized children's storybook generator.
User fills wizard → uploads photo → AI generates 15-page illustrated book → payment → PDF download + email.

## URLs
- **Live site:** https://lifebooks.online
- **Railway app:** https://romantic-patience-production.up.railway.app
- **Working directory:** this folder

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

**Key:** Both `crop.js` and `setup.js` call `/api/books/create` then kick `/api/books/:id/generate-full` (fire & forget background), then redirect to `preview.html?bookId=...`

---

## Design System
```css
--cream:#fdf6ec; --cream-deep:#f5e9d4; --parchment:#ede0c8;
--gold:#c8922a; --gold-light:#e8b84b; --gold-pale:#f5d98a;
--brown:#5c3d1e; --text:#3a2810; --text-muted:#7a6048;
--shadow-warm:0 8px 40px rgba(100,60,20,0.12);
```
- Fonts: Playfair Display (headings) + Lato (body)
- Logo: `assets/branding/logo.svg` (fixed viewBox: `430 466 639 514`, transparent background)

---

## Server Architecture

### Key Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/books/create` | POST | Creates book record in Supabase |
| `/api/books/:id/generate-full` | POST | Full pipeline: analyze photo → story → cover → page images. Returns immediately, background IIFE |
| `/api/books/:id/generate-images` | POST | Page images only. Background IIFE |
| `/api/books/:id` | GET | Fetch book data (used for polling) |
| `/api/books/:id/unlock` | POST | Manual unlock (dev/testing) |
| `/api/books/:id/resend-email` | POST | Resend book link email |
| `/api/create-checkout-session` | POST | Creates Stripe checkout session |
| `/webhooks/stripe` | POST | Stripe webhook — unlocks book + sends confirmation email |
| `/api/contact` | POST | Contact form |

### generate-full Pipeline (background IIFE)
1. Analyze photo with Vision API → `characterReference` saved to DB
2. Write story with GPT-4o-mini → `generatedBook` saved
3. Generate cover with gpt-image-1 → `coverImage` saved
4. Generate page images:
   - **Priority:** pages 0-1 in parallel first (for preview)
   - **Rest:** batches of 3, saved one-by-one with `updateBookField()` (not `updateBook()`)
5. Send "book ready" email — ONLY if `purchaseUnlocked === true`

### ⚠️ Critical: Image Saving
**MUST use `updateBookField()` for saving images** — NOT `updateBook()`.
`updateBook()` calls `.select().maybeSingle()` which returns the full row (up to 24MB with images) → Supabase statement timeout.
`updateBookField()` does update without `.select()` → safe.

### Email System
- **Mail 1:** "Payment confirmed — book being created" → sent immediately on Stripe webhook
- **Mail 2:** "Book ready!" → sent at end of generate-full ONLY when `purchaseUnlocked === true`
- Both from: `books@lifebooks.online`
- Edge case: if book already complete when payment arrives → both emails sent together

### Background IIFE Pattern (used throughout)
```javascript
res.json({ status: "ok" }); // respond immediately
(async () => {
  try { /* heavy work */ }
  catch (err) { console.error("error:", err.message); }
})();
return;
```

---

## Image Generation Details
- Model: `gpt-image-1`, size `1024x1024`
- Compressed to JPEG ~40-80KB before saving (was PNG ~1.5MB → caused Supabase timeout)
- BATCH_SIZE = 3 (parallel per batch)
- Each image saved individually to DB immediately after generation
- Total time: ~7-8 minutes for 15 pages

### Hebrew Support
- If child's name contains Hebrew characters → story written in Hebrew
- `imagePrompt` always in English (for image generation)
- wizard.html has 🌐 language toggle with full RTL

---

## Accessibility
- `public/accessibility.js` — floating widget on ALL pages
  - High contrast mode
  - Highlight links
  - Font size controls (12-24px)
  - Saved to localStorage
- All nav buttons have `aria-label`
- `lang="he-IL"` on index.html

---

## Known Issues Fixed
1. ✅ Supabase statement timeout — fixed with `updateBookField()` + JPEG compression
2. ✅ generate-full not triggered — `setup.js` was going to legacy `generate.html`
3. ✅ Stripe webhook 21% errors — returns 200 immediately, works in background
4. ✅ PDF emoji garbage — replaced with geometric shapes
5. ✅ Logo invisible — SVG viewBox fixed to `430 466 639 514`
6. ✅ SyntaxError crashes (orphaned `}`, broken backticks from Python edits)
7. ✅ Images stuck after cover — batch saving caused Supabase timeout
8. ✅ Hebrew story — auto-detected from child name

---

## Payments — Current Status
- **Stripe:** US account only — cannot use from Israel (no SSN)
- **Payoneer:** ✅ Approved — will receive funds from future payment processor
- **TODO:** Integrate LemonSqueezy OR PayPlus for live payments
  - LemonSqueezy: ~1 day work, ~5% fee, works immediately from Israel
  - PayPlus: ~1 week work, ~1-3% fee, Israeli, supports Bit

---

## TODO Before Launch
### 🔴 Critical
- [ ] Payment system: LemonSqueezy (fast) or PayPlus (cheaper)
- [ ] Preview UX: show first 2 images as they generate + progress indicator
- [ ] Delivery UX: live progress bar "X/16 pages ready" + ETA

### 🟡 Important  
- [ ] Terms & Refund policy page
- [ ] End-to-end test with real payment

### 🟢 Nice to have
- [ ] More pages in Hebrew
- [ ] Google Analytics / Meta Pixel
- [ ] OpenAI fallback if API down

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
public/
  index.html                 — Landing page
  wizard.html/js             — Child details + photo + style (Hebrew toggle)
  crop.html/js               — Crop photo → create book → generate-full → preview
  setup.html/js              — Review details → create book → generate-full → preview
  generate.html/js           — Legacy page (not used in normal flow)
  preview.html               — Loading screen + 2 priority images + unlock CTA
  checkout.html/js           — Payment page
  success.html/js            — Post-payment + resend email button
  delivery.html              — Flipbook + PDF download + polling every 2.5s
  reader.html/js             — Full-screen reader
  cover.html/js              — Cover display
  contact.html               — Contact form
  404.html                   — Error page (Hebrew)
  accessibility.js           — Accessibility widget (all pages)
  styles.css                 — Shared CSS
  js/state.js                — sessionStorage state management
  assets/branding/logo.svg   — Fixed SVG logo
```

---

## Important Code Patterns

### Supabase — safe image save (CRITICAL)
```javascript
// ✅ CORRECT — no .select(), won't timeout
await updateBookField(bookId, { fullImages });

// ❌ WRONG — returns full row, causes timeout with large images  
await updateBook(bookId, { fullImages });
```

### Client polling (delivery.html)
```javascript
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
res.status(200).send("ok"); // MUST respond immediately
(async () => {
  await updateBook(bookId, { purchaseUnlocked: true });
  await sendPaymentConfirmationEmail(book);
  // sendBookReadyEmail called separately by generate-full when done
})();
return;
```
