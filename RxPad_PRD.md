# PRD: RxPad — Quick Prescription Generator for Doctors

**Version:** 0.1 (Draft)
**Author:** [Your Name]
**Last Updated:** March 2026
**Status:** Pre-development

---

## 1. Problem Statement

Doctors in India routinely provide informal medical guidance to friends and family — over phone calls, WhatsApp chats, or photos of symptoms. Despite this being a common and real service, there's no lightweight tool to generate a **proper, legally valid prescription** at the end of such an interaction.

The result: patients receive informal advice but no shareable prescription document they can take to a pharmacy or diagnostic lab — creating friction and risk.

### Who This Is For (Primary User)
A qualified doctor (MBBS/MD/specialist) who:
- Regularly consults friends/family informally
- Is often in a clinical setting (OPD, ward, OT breaks) and needs speed
- Already communicates via WhatsApp
- Does **not** want to maintain a full-blown EMR system

---

## 2. Goals & Non-Goals

### Goals
- Allow a doctor to generate a professional, shareable prescription in < 2 minutes
- Support voice input as the primary interaction mode (with text fallback/correction)
- Output: a clean PDF with embedded signature + stamp, shareable via WhatsApp
- Support multiple doctor profiles (for future sharing with peer group)
- Silently build a repeat patient database to speed up future prescriptions
- Validate drug spellings + dosage in the background via Gemini + search grounding

### Non-Goals (v1)
- Full EMR / patient health record system
- Aadhaar DSC / eSign integration (out of scope for v1)
- Patient-facing portal or login
- Insurance / billing workflows
- Scheduled reminders or follow-up notifications

---

## 3. User Stories

| # | As a... | I want to... | So that... |
|---|---------|--------------|------------|
| U1 | Doctor | Speak the prescription details by voice | I can dictate without typing mid-consultation |
| U2 | Doctor | Review and correct auto-filled fields before generating | Errors (especially patient names) don't go out on a prescription |
| U3 | Doctor | Generate a PDF prescription with my name, designation, reg. no., signature & stamp | It's legally valid and looks professional |
| U4 | Doctor | Share the prescription directly to WhatsApp | The patient can immediately forward it to a pharmacy/lab |
| U5 | Doctor | Start typing a known patient's name and have their details auto-fill | I don't repeat myself for repeat patients |
| U6 | Doctor | Create and switch between multiple doctor profiles | My friends can use their own credentials when needed |
| U7 | Doctor | Prescribe both medicines and lab tests in a single prescription | One document handles the full clinical instruction |

---

## 4. Platform Decision

**Progressive Web App (PWA)**

| Factor | Rationale |
|--------|-----------|
| No install friction | Share a link; works on any phone or desktop browser |
| WhatsApp share | Native Web Share API → opens WhatsApp with PDF attached |
| Offline capable | Service Worker caches the UI; prescriptions generated even with flaky connectivity |
| Avoids WhatsApp Bot | Skips session timeouts, structured form edge cases, media handling complexity |
| Multi-profile | Easy to log in/switch on any device |

---

## 5. Core Features (v1)

### 5.1 Doctor Profile Management

- Create profile: Full name, designation (e.g., MBBS, MD - General Medicine), MCI/NMC registration number, clinic/hospital name & address, contact number
- Upload or draw signature (canvas-based)
- Upload clinic stamp image (PNG with transparent background recommended)
- Multiple profiles supported; switch via profile picker on home screen
- Profiles stored locally (IndexedDB) + optional cloud backup

### 5.2 Patient Entry

**Text fields (always editable):**
- Patient name, age, gender, date

**Voice Input Flow:**
1. Doctor taps 🎙 button and speaks: *"Amit Shah, 45 year old male. Amoxicillin 500mg twice daily for 5 days. Paracetamol 650mg SOS. CBC and LFT tests."*
2. App transcribes via Web Speech API (or Whisper API fallback)
3. Gemini parses transcript → maps to structured fields (drug name, dose, frequency, duration, tests)
4. Structured fields shown in editable form — doctor reviews, corrects anything
5. Background: Gemini + search grounding validates drug name spelling + checks if dose/frequency is plausible (flags anomalies, does not block)

**Repeat Patient Detection:**
- On typing patient name, fuzzy match against local patient DB
- On match: auto-fill age, gender; show past prescription summary (date + key drugs) as a reference card
- New patients are silently saved after prescription is confirmed

### 5.3 Prescription Builder

**Medicines section:**
| Field | Input |
|-------|-------|
| Drug name | Voice / text (spell-checked in background) |
| Dose | e.g., 500mg |
| Route | Oral / Topical / IV (dropdown) |
| Frequency | OD / BD / TDS / QID / SOS / custom |
| Duration | e.g., 5 days |
| Instructions | e.g., after food (optional) |

Add multiple drugs. Drag to reorder.

**Lab Tests section:**
- Free-text or voice input
- Each test on a new line

**Doctor's note / advice (optional):**
- Short free-text field for instructions like "Rest for 3 days", "Review after 1 week"

### 5.4 PDF Generation

**Prescription Layout:**

```
┌─────────────────────────────────────────────┐
│  [STAMP]   Dr. [Name]                        │
│            [Designation]                    │
│            Reg. No: [NMC/MCI Number]        │
│            [Clinic Name & Address]           │
│            [Phone]                           │
├─────────────────────────────────────────────┤
│  Patient: ________  Age/Sex: ____/__        │
│  Date: __________                           │
├─────────────────────────────────────────────┤
│  Rx                                         │
│  1. Drug Name  Dose  Frequency  Duration    │
│     Instructions                            │
│  2. ...                                     │
├─────────────────────────────────────────────┤
│  Lab Investigations:                        │
│  □ CBC   □ LFT   □ ...                      │
├─────────────────────────────────────────────┤
│  Advice: ___________________________________│
├─────────────────────────────────────────────┤
│                        [Signature Image]    │
│                        Dr. [Name]           │
└─────────────────────────────────────────────┘
```

- Generated client-side using `pdf-lib` or `jsPDF` (no server round-trip for patient privacy)
- Stamp image embedded top-left
- Signature image embedded bottom-right
- Watermark / border styling for a professional look
- Unique prescription ID: `RX-YYYYMMDD-NNNN` (date + daily auto-increment, e.g., `RX-20260301-0003`); counter stored in IndexedDB, resets each day
- QR code embedded bottom of prescription — encodes HMAC-signed verification payload (see §15)

### 5.5 WhatsApp Share

- "Share via WhatsApp" button triggers Web Share API with PDF blob
- Fallback: Download PDF button if Web Share not available

---

## 6. AI Integration

| Function | Model / API | Notes |
|----------|-------------|-------|
| Voice transcription | Web Speech API (primary), Whisper API (fallback) | Whisper for better accuracy in noisy environments |
| Structured field extraction | Gemini 1.5 Flash | Fast, cost-effective; prompt: extract patient name, each drug (name, dose, freq, duration), lab tests |
| Drug spell-check + dosage validation | Gemini + Google Search Grounding | Background call; surface warnings, never block submission |

**Privacy note:** Transcription and extraction calls should strip/anonymize patient name before sending to external APIs. Patient name is entered/confirmed locally only.

---

## 7. Data Storage

| Data | Storage | Rationale |
|------|---------|-----------|
| Doctor profiles | IndexedDB (local) + optional encrypted cloud sync | Credentials stay on device by default |
| Patient DB | IndexedDB (local) | Privacy; no patient data leaves device |
| Prescriptions | Local only (not stored after PDF generated) | No PHI on servers |
| Signature / Stamp images | IndexedDB as base64 blobs | Embedded in PDF at generation time |

---

## 8. Technical Stack (Recommended)

| Layer | Choice | Reason |
|-------|--------|--------|
| Frontend | React + Vite PWA | Fast, component-driven, PWA plugin for offline |
| PDF generation | `pdf-lib` | Client-side, no server needed, supports image embedding |
| Voice | Web Speech API + Whisper fallback | Web Speech is free + instant; Whisper for accuracy |
| AI / LLM | Gemini 1.5 Flash via API | Multimodal, search grounding, cost-effective |
| Local DB | Dexie.js (IndexedDB wrapper) | Simple API over IndexedDB |
| Hosting | Vercel / Cloudflare Pages | Zero-config, HTTPS by default (required for PWA + mic access) |
| Auth (multi-profile) | Local profile switching (v1); Clerk/Firebase Auth (v2 if cloud sync needed) | Keep v1 simple |

---

## 9. UX Flow (Happy Path)

```
Open App
  → Select Doctor Profile (or create one)
  → Tap "New Prescription"
  → Enter / voice-dictate patient details
  → Voice-dictate drugs + tests
  → Review structured fields (edit if needed)
  → Tap "Generate Prescription"
  → Preview PDF
  → Tap "Share on WhatsApp"
```

Target time: **< 90 seconds** from open to WhatsApp share.

---

## 10. Edge Cases & Handling

| Edge Case | Handling |
|-----------|----------|
| Voice in noisy OT/ward | Whisper API fallback; always show editable transcript |
| Drug name not recognized by spell-check | Show warning; allow override — doctor's judgment final |
| Repeat patient name collision (two "Priya"s) | Show disambiguation card (age + last prescription date) |
| No internet (offline) | Prescription builder + PDF generation work offline; AI features gracefully degrade |
| Stamp/signature not uploaded | Placeholder box with doctor name; app nudges setup completion on first run |

---

## 11. Out of Scope (Future Versions)

- **v2:** Cloud backup of patient DB, sharing app with friend doctors (multi-user)
- **v2:** Photo input (patient forwards lab report photo → AI reads + references it)
- **v3:** Aadhaar DSC / eSign for institutions requiring cryptographic signature
- **v3:** Drug interaction checking
- **v3:** Template prescriptions (e.g., "Standard UTI regimen")

---

## 12. Success Metrics (v1)

| Metric | Target |
|--------|--------|
| Time to first prescription | < 90 seconds |
| Voice transcription accuracy (drug names) | > 90% correct without correction |
| PDF generation reliability | 100% (client-side, no server dependency) |
| Prescriptions generated in first month (dogfood) | 20+ |
| Doctor effort to onboard | < 5 minutes (profile setup) |

---

## 13. Decisions Log (from Open Questions)

| # | Question | Decision |
|---|----------|----------|
| 1 | Prescription ID format | **Date + auto-increment** — format: `RX-YYYYMMDD-NNNN` (e.g., `RX-20260301-0003`). Counter resets daily. Allows verbal reference ("Rx 3 from today") and easy chronological sorting. |
| 2 | Regional language support | **English only for v1.** Simplifies voice parsing, drug name validation, and PDF rendering significantly. |
| 3 | Stamp image | **Generative stamp** — on doctor profile setup, user enters clinic name, doctor name, city. App calls an image generation API (Ideogram or similar) with a prompt tuned to produce a professional Indian clinic rubber-stamp aesthetic (circular border, text, caduceus icon). Doctor can regenerate or upload their own. |
| 4 | QR code on prescription | **Yes, include in v1.** QR encodes a lightweight verification payload: `{prescriptionId, doctorName, regNo, date, patientInitials}` — signed with a local HMAC key per doctor profile. No server needed. Scanning shows a local verification page served by the PWA. Future v2 can upgrade to server-verified. |

---

## 14. Stamp Generation — Design Note

**Flow:**
1. Doctor fills profile (name, designation, clinic name, city)
2. App constructs a generation prompt:
   > *"Professional Indian medical prescription rubber stamp, circular border, doctor name '[Name]', designation '[Designation]', clinic '[Clinic]', city '[City]', caduceus symbol, blue ink on white, clean vector style"*
3. Image returned → shown as preview → doctor can **Regenerate** or **Upload own**
4. Stored in IndexedDB as base64; embedded in PDF bottom-left

**Fallback:** If generation API is unavailable, render stamp programmatically on canvas (SVG circle + text layout) — no hard dependency on external image generation.

---

## 15. QR Verification — Design Note

**QR payload (JSON, HMAC-signed):**
```json
{
  "rxId": "RX-20260301-0003",
  "doctorName": "Dr. Priya Sharma",
  "regNo": "MH-12345",
  "date": "2026-03-01",
  "patientInitials": "A.S.",
  "hmac": "a3f9..."
}
```

**Verification page** (PWA route `/verify?data=...`):
- Decodes payload, verifies HMAC
- Shows: ✅ *"Valid prescription issued by Dr. Priya Sharma (Reg: MH-12345) on 1 Mar 2026"*
- No patient name exposed on verification page — only initials

**Why HMAC locally?**
- Pharmacies / labs don't need to call a server
- Forgery requires knowing the per-doctor secret key stored only on the doctor's device
- Upgradeable to server-side PKI in v2 without changing the QR format
