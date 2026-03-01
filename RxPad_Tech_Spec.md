# RxPad — Technical Specification (Agent-Ready)

> Prescription generation PWA for Indian doctors. Voice/text → structured prescription → PDF → WhatsApp share.

---

## 1. Architecture

```
┌──────────────────────────────────────────────────────┐
│  Preact + Vite PWA  (Cloudflare Pages — static)      │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Zod Schemas │  │ Vercel AI SDK│  │ IndexedDB   │ │
│  │ (Rx model)  │  │ generateObj  │  │ (idb)       │ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘ │
│         │                │                  │        │
│         └───► Gemini API ◄──────────────────┘        │
│              (BYOK key)                              │
│                                                      │
│  MediaRecorder → audio blob → base64 → AI SDK        │
│  AI SDK → validated Prescription → form → PDF         │
│  PDF → Web Share API → WhatsApp                       │
└──────────────────────────────────────────────────────┘
```

**Backend:** None. All logic runs in the browser.
**Auth:** BYOK — doctor pastes their own Gemini API key (from ai.google.dev) once in Settings.
**Hosting:** Cloudflare Pages (static deploy from GitHub repo). $0 cost.
**Prescription Lifecycle:** Draft → Finalize (immutable, QR signed) → Cancel (watermarked, void). "Cancelled check" model — no edits, no versioning. Mistakes = cancel + write new.

---

## 2. Tech Stack

| Layer | Package | Version | Purpose |
|-------|---------|---------|---------|
| UI Framework | `preact` | latest | Lightweight React alternative (3KB) |
| Build | `vite` | latest | Fast HMR, native ESM |
| Routing | `preact-router` | latest | Client-side routing |
| Styling | `tailwindcss` | v4+ | Utility-first CSS |
| LLM Client | `ai` (Vercel AI SDK) | v6+ | `generateObject` for structured output |
| LLM Provider | `@ai-sdk/google` | latest | Gemini Flash connector |
| Schema | `zod` | v4+ | Runtime validation + TypeScript types |
| Storage | `idb` | latest | Promise-based IndexedDB wrapper |
| PWA | `workbox-webpack-plugin` or `vite-plugin-pwa` | latest | Service worker generation |
| Audio | Browser `MediaRecorder` API | native | Voice capture (webm/opus) |
| PDF | `jspdf` | latest | Client-side PDF generation |
| QR Code | `qrcode` | latest | QR generation for verification |
| HMAC | `Web Crypto API` (SubtleCrypto) | native | Prescription signing at finalize |
| Icons | `lucide-preact` or inline SVG | — | UI icons |

### npm install command

```bash
npm create vite@latest rxpad -- --template preact-ts
cd rxpad
npm install preact-router ai @ai-sdk/google zod idb jspdf qrcode
npm install -D tailwindcss @tailwindcss/vite vite-plugin-pwa
```

---

## 3. Data Models (Zod Schemas)

These schemas are the **single source of truth** for all prescription data. They are used by the AI SDK for structured LLM output AND by the app for runtime validation.

### File: `src/schemas/prescription.ts`

```typescript
import { z } from 'zod';

export const MedicineSchema = z.object({
  name: z.string().describe('Medicine name — Indian brand name or generic name'),
  dosage: z.string().describe('Dosage amount, e.g. "500mg", "650mg", "10ml"'),
  frequency: z.string().describe('Dosing frequency. Indian convention: "1-0-1" means morning-skip-evening. Also accept: OD (once daily), BD (twice daily), TDS (thrice daily), SOS (as needed), HS (at bedtime)'),
  duration: z.string().describe('Duration of course, e.g. "3 days", "5 days", "1 week", "2 weeks"'),
  instructions: z.string().optional().describe('Optional instructions, e.g. "after food", "before bed", "empty stomach", "with warm water"'),
});

export const PatientSchema = z.object({
  name: z.string().describe('Full name of the patient'),
  age: z.number().int().positive().describe('Age in years'),
  gender: z.enum(['M', 'F', 'Other']).describe('Gender'),
  phone: z.string().optional().describe('Phone number (optional)'),
});

export const PrescriptionDraftSchema = z.object({
  patient: PatientSchema,
  medicines: z.array(MedicineSchema).min(1).describe('List of prescribed medicines — must have at least one'),
  lab_tests: z.array(z.string()).default([]).describe('Lab tests to order, e.g. "CBC", "Lipid Profile", "HbA1c"'),
  notes: z.string().optional().describe('Additional instructions for the patient, e.g. "Drink plenty of fluids", "Follow up in 1 week"'),
});

export type Medicine = z.infer<typeof MedicineSchema>;
export type Patient = z.infer<typeof PatientSchema>;
export type PrescriptionDraft = z.infer<typeof PrescriptionDraftSchema>;

// Full prescription (stored in IndexedDB after creation)
export const PrescriptionSchema = z.object({
  id: z.string(),                                    // RX-YYYYMMDD-NNNN
  status: z.enum(['draft', 'finalized', 'cancelled']),
  createdAt: z.string().datetime(),
  finalizedAt: z.string().datetime().optional(),
  cancelledAt: z.string().datetime().optional(),
  patient: PatientSchema,
  medicines: z.array(MedicineSchema),
  labTests: z.array(z.string()).default([]),
  notes: z.string().optional(),
  pdfBlob: z.instanceof(Blob).optional(),            // stored after finalize
  qrPayload: z.string().optional(),                  // HMAC-signed JSON string
});

export type Prescription = z.infer<typeof PrescriptionSchema>;
```

### File: `src/schemas/profile.ts`

```typescript
import { z } from 'zod';

export const DoctorProfileSchema = z.object({
  fullName: z.string().min(1),
  designation: z.string().min(1),        // e.g. "MBBS, MD (Medicine)"
  regNumber: z.string().min(1),          // e.g. "MH-12345"
  clinicName: z.string().optional(),
  phone: z.string().optional(),
  stampBase64: z.string().optional(),     // generated SVG-to-base64
  hmacSecret: z.string().optional(),     // generated on first profile save, used for QR signing
});

export type DoctorProfile = z.infer<typeof DoctorProfileSchema>;
```

---

## 4. IndexedDB Schema

### File: `src/lib/db.ts`

```typescript
import { openDB, IDBPDatabase } from 'idb';

interface RxPadDB {
  prescriptions: {
    key: string;       // prescription.id (e.g. "RX-20260301-0003")
    value: Prescription;
    indexes: {
      'by-status': string;
      'by-date': string;
    };
  };
  profile: {
    key: string;       // always "doctor" (single-user)
    value: DoctorProfile;
  };
  config: {
    key: string;
    value: unknown;    // "geminiApiKey" → string, "counter-YYYYMMDD" → number
  };
}
```

Stores:
- `prescriptions` — indexed by `status` and `createdAt`
- `profile` — single record, key `"doctor"`
- `config` — key-value pairs: `"geminiApiKey"`, `"counter-YYYYMMDD"` (daily counter for Rx IDs)

---

## 5. Gemini Integration (Vercel AI SDK)

### File: `src/lib/gemini.ts`

The core LLM integration. Uses `generateObject` from Vercel AI SDK for **schema-enforced structured output** with automatic validation and retry.

```typescript
import { generateObject } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { PrescriptionDraftSchema } from '../schemas/prescription';

// Initialize with BYOK key from IndexedDB
function getGeminiModel(apiKey: string) {
  const google = createGoogleGenerativeAI({ apiKey });
  return google('gemini-2.5-flash');
}

const SYSTEM_PROMPT = `You are a medical prescription assistant for qualified Indian doctors.
You parse the doctor's voice notes or text messages into structured prescription data.

Rules:
- Use Indian medicine naming conventions (brand names like Azee, Dolo, Crocin are valid)
- "1-0-1" means morning-skip-evening. "0-0-1" means evening only. Interpret accordingly.
- OD = once daily, BD = twice daily, TDS = thrice daily, QID = four times daily, SOS = as needed, HS = at bedtime
- "x/7" notation: "3/7" means "3 days", "5/7" means "5 days", "2/52" means "2 weeks"
- If the doctor says "Tab" assume tablet, "Cap" assume capsule, "Syp" assume syrup, "Inj" assume injection
- Preserve ALL existing prescription data unless the doctor explicitly changes it
- If something is ambiguous, keep it as the doctor said — do not guess dosages`;

// Parse a new voice note or text update into prescription structure
export async function parsePrescriptionUpdate(
  apiKey: string,
  currentState: PrescriptionDraft | null,
  input: { type: 'audio'; data: string; mimeType: string } | { type: 'text'; text: string }
): Promise<PrescriptionDraft> {
  const model = getGeminiModel(apiKey);

  const userContent = [];

  if (currentState) {
    userContent.push({
      type: 'text' as const,
      text: `Current prescription state:\n${JSON.stringify(currentState, null, 2)}\n\nThe doctor has provided an update. Merge it with the existing state.`,
    });
  } else {
    userContent.push({
      type: 'text' as const,
      text: 'The doctor is starting a new prescription. Parse the following into a complete prescription.',
    });
  }

  if (input.type === 'audio') {
    userContent.push({
      type: 'file' as const,
      data: input.data,          // base64 string
      mimeType: input.mimeType,  // 'audio/webm'
    });
  } else {
    userContent.push({
      type: 'text' as const,
      text: `Doctor's update: "${input.text}"`,
    });
  }

  const { object } = await generateObject({
    model,
    schema: PrescriptionDraftSchema,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  return object;
}
```

**Key behavior:**
- `generateObject` sends the Zod schema to Gemini as a JSON schema constraint
- Gemini returns JSON matching the schema
- Vercel AI SDK validates the response against Zod
- If validation fails, the SDK retries automatically
- The returned `object` is fully typed as `PrescriptionDraft`

---

## 6. Project Structure

```
rxpad/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── public/
│   ├── manifest.json              # PWA manifest
│   ├── icons/
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   └── sw.js                      # service worker (generated by vite-plugin-pwa)
├── src/
│   ├── index.tsx                   # Preact entry point
│   ├── app.tsx                     # Router + app shell
│   ├── schemas/
│   │   ├── prescription.ts         # Zod schemas (§3 above)
│   │   └── profile.ts
│   ├── lib/
│   │   ├── db.ts                   # IndexedDB wrapper (§4 above)
│   │   ├── gemini.ts               # Vercel AI SDK integration (§5 above)
│   │   ├── pdf.ts                  # PDF generation logic
│   │   ├── qr.ts                   # QR code + HMAC signing
│   │   ├── stamp.ts                # Programmatic stamp SVG generation
│   │   ├── audio.ts                # MediaRecorder wrapper
│   │   └── id.ts                   # Prescription ID generation (RX-YYYYMMDD-NNNN)
│   ├── pages/
│   │   ├── NewRx.tsx               # Main prescription creation screen
│   │   ├── History.tsx             # Prescription history list
│   │   ├── Settings.tsx            # API key + doctor profile
│   │   ├── Onboarding.tsx          # First-launch wizard
│   │   └── Verify.tsx              # QR verification (public, no auth)
│   ├── components/
│   │   ├── Shell.tsx               # App shell with bottom nav
│   │   ├── MedicineRow.tsx         # Single medicine entry/display
│   │   ├── VoiceRecorder.tsx       # Mic button + recording UI
│   │   ├── PrescriptionCard.tsx    # History list item
│   │   ├── PrescriptionView.tsx    # Read-only prescription view
│   │   ├── StampPreview.tsx        # Doctor stamp preview
│   │   └── ConfirmDialog.tsx       # Reusable confirmation modal
│   └── styles/
│       └── globals.css             # Tailwind imports + custom styles
```

---

## 7. Task Specs (Agent-Ready)

Each task is a self-contained unit with clear inputs, outputs, acceptance criteria, and dependencies. Tasks are ordered for sequential execution — each task's dependencies are completed by earlier tasks.

---

### TASK-01: Project Scaffold

**Description:** Initialize the project with Preact + Vite + TypeScript + Tailwind + PWA support.

**Input:** None (greenfield project)

**Actions:**
1. Create project with `npm create vite@latest rxpad -- --template preact-ts`
2. Install all dependencies listed in §2
3. Configure Tailwind CSS v4 with Vite plugin
4. Configure `vite-plugin-pwa` with:
   - `registerType: 'autoUpdate'`
   - `manifest`: name "RxPad", short_name "RxPad", display "standalone", theme_color "#2563EB", background_color "#FFFFFF"
   - `workbox.runtimeCaching`: cache-first for static assets, network-first for API calls
5. Create placeholder `public/icons/icon-192.png` and `icon-512.png` (blue circle with "Rx" text)
6. Create `src/app.tsx` with `preact-router`: routes for `/`, `/history`, `/settings`, `/verify`
7. Create `src/components/Shell.tsx` with bottom navigation (3 tabs: New Rx, History, Settings)
8. Create placeholder page components that render tab name

**Output:** Project that builds (`npm run build`), runs locally (`npm run dev`), installs as PWA on mobile.

**Acceptance Criteria:**
- `npm run build` completes with zero errors
- `npm run dev` shows app shell with working tab navigation
- Lighthouse PWA audit passes installability check
- App installs on iOS Safari home screen and opens in standalone mode
- Bottom nav highlights active tab

**Dependencies:** None

---

### TASK-02: IndexedDB Storage Layer

**Description:** Create a typed IndexedDB wrapper for all persistent storage.

**Input:** Zod schemas from §3

**Actions:**
1. Create `src/schemas/prescription.ts` and `src/schemas/profile.ts` exactly as specified in §3
2. Create `src/lib/db.ts` implementing:
   - `initDB()` — opens/creates database with stores: `prescriptions` (indexed by status, createdAt), `profile`, `config`
   - `saveProfile(profile: DoctorProfile)` — upserts to profile store, key "doctor"
   - `getProfile(): Promise<DoctorProfile | null>`
   - `saveConfig(key: string, value: unknown)`
   - `getConfig<T>(key: string): Promise<T | null>`
   - `savePrescription(rx: Prescription)`
   - `getPrescription(id: string): Promise<Prescription | null>`
   - `listPrescriptions(status?: string): Promise<Prescription[]>` — sorted by createdAt desc
   - `getNextRxId(): Promise<string>` — generates `RX-YYYYMMDD-NNNN` using daily counter from config store
3. Create `src/lib/id.ts` with `generateRxId()` that reads/increments daily counter

**Output:** Fully typed database layer that can be imported and used by all pages.

**Acceptance Criteria:**
- All CRUD operations work: save profile, read profile, save prescription, list prescriptions
- `getNextRxId()` returns `RX-YYYYMMDD-0001` on first call of the day, increments on subsequent calls
- Counter resets on a new day
- Zod schemas compile and export correct TypeScript types
- Round-trip test: save a Prescription object, read it back, validate with Zod — passes

**Dependencies:** TASK-01

---

### TASK-03: Settings & Doctor Profile

**Description:** Settings page with API key configuration and doctor profile form.

**Input:** DB layer from TASK-02

**Actions:**
1. Create `src/pages/Settings.tsx` with two sections:
   - **API Key section:** Text input for Gemini API key, "Test Connection" button, status indicator (untested / ✅ valid / ❌ invalid). Test makes a minimal `generateObject` call with a trivial Zod schema (e.g. `z.object({ ok: z.boolean() })`). Saves to IndexedDB config store on successful test.
   - **Doctor Profile section:** Form fields for fullName, designation, regNumber, clinicName (optional), phone (optional). Save button writes to IndexedDB profile store.
2. Create `src/lib/stamp.ts`:
   - `generateStamp(profile: DoctorProfile): string` — creates SVG circle stamp with doctor name around the arc, reg number in center. Returns base64-encoded PNG (render SVG to canvas, export as base64). Stamp is blue/dark blue.
3. Create `src/components/StampPreview.tsx` — renders the generated stamp image from base64
4. On profile save, auto-generate stamp and store base64 in profile
5. On profile save, if no `hmacSecret` exists, generate one with `crypto.getRandomValues(new Uint8Array(32))` and store as hex string

**Output:** Working settings page where doctor enters API key and profile, sees stamp preview.

**Acceptance Criteria:**
- API key test: valid key shows green checkmark, invalid key shows red X with error message
- Profile form validates required fields (fullName, designation, regNumber) before save
- Stamp generates and renders visually — circular, readable text, professional appearance
- HMAC secret is generated once and persists across sessions
- All data persists in IndexedDB across page reloads

**Dependencies:** TASK-01, TASK-02

---

### TASK-04: Onboarding Flow

**Description:** First-launch wizard that guides the doctor through initial setup.

**Input:** Settings components from TASK-03

**Actions:**
1. Create `src/pages/Onboarding.tsx` — multi-step wizard:
   - Step 1: Welcome screen with brief explanation ("Generate prescriptions from voice notes")
   - Step 2: API key input (reuse component from Settings) with link to ai.google.dev to get a key
   - Step 3: Doctor profile form (reuse component from Settings)
   - Step 4: Stamp preview + "Looks good!" confirmation
   - Step 5: "You're all set" → navigate to New Rx
2. Wizard state tracked with `useState` (current step index)
3. On app load (`src/app.tsx`), check IndexedDB for profile and API key. If either missing → redirect to Onboarding instead of New Rx
4. "Skip" option on each step (except API key — required for functionality)

**Output:** New users see onboarding flow. Returning users go straight to New Rx.

**Acceptance Criteria:**
- Fresh install (cleared IndexedDB) → shows onboarding
- Completing onboarding → all subsequent visits go to New Rx
- Back button works between steps
- API key step won't proceed until key is tested and valid
- Profile step won't proceed until required fields are filled

**Dependencies:** TASK-03

---

### TASK-05: Manual Prescription Entry (Text)

**Description:** The New Rx screen with manual text-based prescription creation.

**Input:** DB layer, Zod schemas

**Actions:**
1. Create `src/pages/NewRx.tsx`:
   - **Patient section:** name (text), age (number), gender (select: M/F/Other)
   - **Medicines section:** List of medicine rows. Each row: name, dosage, frequency, duration, instructions (optional). "Add Medicine" button appends a row. Swipe-to-delete or X button removes a row.
   - **Lab Tests section:** Free-text input, "Add" button appends to list. X to remove.
   - **Notes section:** Textarea
   - **Action bar:** "Finalize" button (prominent), "Clear" button
2. Create `src/components/MedicineRow.tsx` — controlled form for one medicine entry
3. Form state managed with `useState` holding a `PrescriptionDraft` object
4. All fields editable while in draft
5. "Finalize" → opens `ConfirmDialog` → on confirm:
   - Generate Rx ID via `getNextRxId()`
   - Create full `Prescription` object with status "finalized", finalizedAt = now
   - Generate QR + HMAC (TASK-07)
   - Generate PDF (TASK-06)
   - Save to IndexedDB
   - Show success state with share options
6. Create `src/components/ConfirmDialog.tsx` — modal with "Are you sure? This cannot be edited." + Cancel/Finalize buttons

**Output:** Doctor can manually create a prescription, finalize it.

**Acceptance Criteria:**
- At least 1 medicine required before Finalize is enabled
- Patient name, age, gender required before Finalize is enabled
- Medicine rows can be added/removed dynamically
- Form state persists during the session (not lost on tab switch)
- Finalize creates a Prescription record in IndexedDB with status "finalized"
- After finalize, form resets to empty for next prescription

**Dependencies:** TASK-02

---

### TASK-06: PDF Generation

**Description:** Client-side PDF rendering of a finalized prescription.

**Input:** Prescription object, DoctorProfile, stamp base64

**Actions:**
1. Create `src/lib/pdf.ts`:
   - `generatePrescriptionPDF(rx: Prescription, profile: DoctorProfile): Promise<Blob>`
   - Uses `jspdf` to render:
     - **Header:** Doctor name, designation, reg number, clinic name, phone. Right-aligned or centered.
     - **Divider line**
     - **Patient section:** "Patient: [name], [age]y/[gender]" + Date
     - **Rx symbol:** ℞ (large, left margin)
     - **Medicines table:** Serial number, Medicine name, Dosage, Frequency, Duration, Instructions. Clean table layout.
     - **Lab Tests:** Bulleted list (if any)
     - **Notes:** Italic text (if any)
     - **Footer:** Doctor stamp image (bottom-left), QR code image (bottom-right), Prescription ID (bottom-center)
   - Page size: A5 (standard Indian prescription pad size, 148mm × 210mm)
   - Font: Helvetica (built into jsPDF)
2. Create `src/lib/qr.ts`:
   - `generateQRCode(payload: string): Promise<string>` — returns base64 PNG of QR code
   - Uses `qrcode` package with `toDataURL()`
3. PDF blob is stored in the Prescription record in IndexedDB (for re-download from history)

**Output:** Professional-looking prescription PDF matching Indian medical prescription format.

**Acceptance Criteria:**
- PDF renders correctly with all prescription data
- A5 page size (148mm × 210mm)
- Doctor stamp visible and legible in bottom-left
- QR code visible and scannable in bottom-right
- Prescription ID and date visible in footer
- PDF text is selectable (not image-based)
- File size under 200KB for typical prescription
- Generates in under 2 seconds

**Dependencies:** TASK-03 (profile + stamp), TASK-05 (prescription data), TASK-08 (QR/HMAC)

---

### TASK-07: Share Flow

**Description:** Share finalized prescription via WhatsApp or other apps.

**Input:** Generated PDF blob

**Actions:**
1. After finalize in NewRx, show a share panel:
   - "Share via WhatsApp" button → uses Web Share API with PDF file attachment
   - "Download PDF" button → triggers browser download
   - Fallback: if Web Share API unavailable, show download only
2. Implementation in `src/pages/NewRx.tsx` (post-finalize state):
   ```typescript
   async function sharePDF(blob: Blob, rxId: string) {
     const file = new File([blob], `${rxId}.pdf`, { type: 'application/pdf' });
     if (navigator.share && navigator.canShare({ files: [file] })) {
       await navigator.share({ files: [file], title: rxId });
     } else {
       // Fallback: download
       const url = URL.createObjectURL(blob);
       const a = document.createElement('a');
       a.href = url; a.download = `${rxId}.pdf`; a.click();
       URL.revokeObjectURL(url);
     }
   }
   ```

**Output:** Doctor can share PDF directly to WhatsApp or download it.

**Acceptance Criteria:**
- On iOS Safari: share sheet opens with PDF attached, WhatsApp is an option
- On Android Chrome: share sheet opens with PDF attached
- On desktop: falls back to file download
- PDF filename is the prescription ID (e.g. `RX-20260301-0003.pdf`)

**Dependencies:** TASK-06

---

### TASK-08: QR Code + HMAC Verification

**Description:** Generate signed QR codes at finalize time. Build verification page.

**Input:** Prescription data, HMAC secret from profile

**Actions:**
1. Create HMAC signing in `src/lib/qr.ts`:
   ```typescript
   async function signPrescription(rx: Prescription, secret: string): Promise<string> {
     const payload = {
       rxId: rx.id,
       doctorName: profile.fullName,
       regNo: profile.regNumber,
       date: rx.finalizedAt,
       patientInitials: getInitials(rx.patient.name),
       status: rx.status,
     };
     const key = await crypto.subtle.importKey('raw', hexToBuffer(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
     const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(JSON.stringify(payload)));
     return JSON.stringify({ ...payload, hmac: bufferToHex(signature) });
   }
   ```
2. QR code encodes the full signed payload as a URL: `https://<app-domain>/verify?data=<base64-encoded-payload>`
3. Create `src/pages/Verify.tsx`:
   - Reads `data` query param from URL
   - Decodes and displays prescription info (doctor name, reg no, date, patient initials)
   - Shows status badge: ✅ Valid / 🚫 Cancelled
   - **No HMAC verification on this page** (would require the doctor's secret key, which only lives on her device). The verification page only displays the signed data. Future v2 can add server-side verification.
   - Page is publicly accessible — no auth required

**Output:** QR codes on prescriptions. Scannable verification page.

**Acceptance Criteria:**
- QR code on PDF is scannable by any QR reader
- Scanning opens verification page in browser
- Verification page shows: doctor name, registration number, date, patient initials, status
- Cancelled prescriptions show "CANCELLED" status
- Page works without being logged in to the app

**Dependencies:** TASK-02

---

### TASK-09: Voice Recording

**Description:** Audio capture component using browser MediaRecorder API.

**Input:** None (browser API)

**Actions:**
1. Create `src/lib/audio.ts`:
   - `startRecording(): Promise<{ stop: () => Promise<AudioResult> }>` — requests mic permission, starts MediaRecorder
   - `AudioResult = { blob: Blob; base64: string; mimeType: string; durationMs: number }`
   - Captures as `audio/webm;codecs=opus` (best browser support)
   - Converts blob to base64 for Gemini API
2. Create `src/components/VoiceRecorder.tsx`:
   - Idle state: mic button (large, centered)
   - Recording state: pulsing red indicator + duration timer + stop button
   - Processing state: spinner/loading
   - Props: `onResult(audio: AudioResult)`, `disabled: boolean`
3. Handle mic permission denial gracefully — show message with instructions

**Output:** Reusable voice recording component.

**Acceptance Criteria:**
- Tap mic → starts recording with visual feedback (pulsing indicator, timer counting up)
- Tap stop → returns audio blob + base64
- Works on iOS Safari and Chrome Android
- Mic permission denied → shows clear error message, doesn't crash
- Audio captured is under 1MB for a 60-second recording
- Component disabled when `disabled=true` (e.g. while processing)

**Dependencies:** TASK-01

---

### TASK-10: Gemini Integration (Voice + Text → Structured Rx)

**Description:** Wire up Vercel AI SDK with Gemini to parse voice/text into structured prescription data.

**Input:** Audio from TASK-09, Zod schemas from TASK-02, AI SDK integration from §5

**Actions:**
1. Create `src/lib/gemini.ts` exactly as specified in §5
2. Integrate into `src/pages/NewRx.tsx`:
   - Add VoiceRecorder component above the manual form
   - Add text input field for typed updates ("Change Azithromycin to 5 days")
   - On voice recording complete → call `parsePrescriptionUpdate(apiKey, currentDraft, { type: 'audio', ... })`
   - On text update submit → call `parsePrescriptionUpdate(apiKey, currentDraft, { type: 'text', ... })`
   - Returned `PrescriptionDraft` replaces current form state
   - Show loading state during API call
   - Show error toast if API call fails, with retry button
   - **Current draft state is always sent as context** so Gemini can merge updates
3. Error handling:
   - Network error → "No internet connection. Use manual entry."
   - Invalid API key → "API key invalid. Check Settings."
   - Rate limit → "Too many requests. Wait a moment."
   - Schema validation failure after retries → "Couldn't parse. Please try again or enter manually."

**Output:** Voice notes and text updates are parsed into structured prescription form fields.

**Acceptance Criteria:**
- Record "Patient Rahul Sharma, male 35, fever since 3 days, Tab Azithromycin 500 OD for 3 days, Tab Paracetamol 650 SOS" → form shows all fields correctly populated
- Text update "add CBC test" on an existing draft → lab tests section gets "CBC" appended, medicines unchanged
- Text update "change Azithromycin to 5 days" → duration field updates, everything else unchanged
- API errors show user-friendly messages, not raw error objects
- Draft is never lost on API error — form retains its previous state
- Loading state shown during API call, form is not editable while loading

**Dependencies:** TASK-02, TASK-05, TASK-09

---

### TASK-11: Prescription History

**Description:** History page showing all past prescriptions with status.

**Input:** DB layer

**Actions:**
1. Create `src/pages/History.tsx`:
   - Fetches all prescriptions from IndexedDB, sorted by createdAt descending
   - Each item rendered with `PrescriptionCard` component
   - Search bar: filters by patient name (client-side filter)
2. Create `src/components/PrescriptionCard.tsx`:
   - Shows: patient name, date, medicine count, status badge
   - Status badges: Draft (yellow), Finalized (green), Cancelled (red with strikethrough)
   - Tap → navigates to detail view
3. Create `src/components/PrescriptionView.tsx`:
   - Read-only display of full prescription
   - If finalized: "Share" button (re-share PDF), "Cancel" button
   - If draft: "Continue editing" button → opens NewRx with this draft loaded
   - If cancelled: shows CANCELLED watermark, "Share" still available (cancelled PDF)
4. Cancel flow:
   - "Cancel Prescription" → ConfirmDialog → sets status to "cancelled", cancelledAt = now
   - Re-generates PDF with "CANCELLED" watermark
   - Updates record in IndexedDB

**Output:** Browsable history with search, detail view, and cancel functionality.

**Acceptance Criteria:**
- All prescriptions show in list, newest first
- Search by patient name works (case-insensitive)
- Status badges correctly colored
- Tapping a card opens the full prescription
- Cancel updates status in DB and regenerates PDF with watermark
- "Continue editing" for drafts opens NewRx pre-filled with draft data
- Empty state: "No prescriptions yet" message

**Dependencies:** TASK-02, TASK-06

---

### TASK-12: Offline Support & Error Handling

**Description:** Service worker caching, offline UI states, global error handling.

**Input:** Working app from all previous tasks

**Actions:**
1. Configure `vite-plugin-pwa` workbox settings:
   - Precache: all static assets (JS, CSS, HTML, icons)
   - Runtime cache: network-first for Gemini API calls (no cache — these should always be fresh)
2. Add offline detection in `src/app.tsx`:
   - Listen to `navigator.onLine` and `online`/`offline` events
   - When offline: show subtle banner "You're offline. Voice/text parsing unavailable."
   - Manual text entry still works offline (all form + IndexedDB operations are local)
   - Finalize still works offline (PDF generation is local)
   - Only voice/text-to-Gemini parsing requires network
3. Global error boundary in `src/app.tsx`:
   - Catch unhandled errors, show "Something went wrong" with reload button
   - Never lose draft data — save to IndexedDB on error

**Output:** App works offline for manual entry. Graceful degradation for LLM features.

**Acceptance Criteria:**
- App loads when offline (service worker serves cached shell)
- Offline banner appears/disappears correctly
- Manual text entry → finalize → PDF → save works fully offline
- Voice recording attempt while offline shows "Requires internet" message
- IndexedDB data survives app crashes and service worker updates

**Dependencies:** All previous tasks

---

### TASK-13: Deploy to Cloudflare Pages

**Description:** Configure deployment pipeline.

**Input:** Complete built app

**Actions:**
1. Create GitHub repository for the project
2. Connect to Cloudflare Pages:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node.js version: 20
3. Configure `_redirects` or `_headers` file for SPA routing:
   - `/* /index.html 200` (all routes serve index.html for client-side routing)
4. Custom domain (optional): configure in Cloudflare dashboard
5. Verify deployment:
   - App loads from Cloudflare Pages URL
   - PWA installs correctly
   - All routes work (including `/verify?data=...`)

**Output:** Live, deployed app accessible via Cloudflare Pages URL.

**Acceptance Criteria:**
- `git push` to main → auto-deploys to Cloudflare Pages
- App loads from deployed URL in under 3 seconds
- PWA installable from deployed URL
- All client-side routes work (no 404s on direct navigation)
- HTTPS enabled (Cloudflare default)

**Dependencies:** All previous tasks

---

## 8. Task Dependency Graph

```
TASK-01 (Scaffold)
  ├── TASK-02 (DB + Schemas)
  │     ├── TASK-03 (Settings + Profile)
  │     │     ├── TASK-04 (Onboarding)
  │     │     └── TASK-06 (PDF) ────┐
  │     ├── TASK-05 (Manual Entry)   │
  │     │     └── TASK-10 (Gemini) ──┤
  │     ├── TASK-08 (QR/HMAC)        │
  │     └── TASK-11 (History) ───────┤
  ├── TASK-09 (Voice Recording)      │
  │     └── TASK-10 (Gemini)         │
  └── TASK-07 (Share) ◄─────────────┘
       └── TASK-12 (Offline + Errors)
            └── TASK-13 (Deploy)
```

**Critical path:** TASK-01 → 02 → 05 → 10 → 06 → 07 → 12 → 13

**Parallelizable:**
- TASK-03 and TASK-05 can run in parallel after TASK-02
- TASK-08 and TASK-09 can run in parallel after TASK-01/02
- TASK-04 can run after TASK-03 (independent of prescription flow)
- TASK-11 can run after TASK-02 + TASK-06

---

## 9. What's NOT in v1

- Multi-doctor support / user accounts
- Cloud sync / backup
- Live dictation (would need Gemini Live API + backend for ephemeral tokens)
- AI-generated stamp (programmatic SVG is sufficient)
- Drug interaction warnings
- Prescription templates / favorites
- Analytics / usage tracking
- Server-side QR verification (would need backend holding HMAC secrets)

These are all future features that require adding a backend. Current architecture supports adding a Cloudflare Worker proxy in front of Gemini with zero PWA changes when the time comes.
