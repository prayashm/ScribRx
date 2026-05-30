# ScribRx

A prescription generator PWA for doctors in India. Dictate or type a prescription, review the structured output, generate a PDF, and share it via WhatsApp — all in under 90 seconds.

**No backend. No patient data leaves the device.**

## How It Works

1. Set up your doctor profile (name, designation, registration number, clinic details, signature)
2. Start a new prescription — type or dictate patient details and medications in natural language
3. Gemini extracts structured fields (drugs, dosage, frequency, lab tests) from your input
4. Review and edit the parsed prescription
5. Generate a signed PDF with QR verification code
6. Share directly to WhatsApp

## Features

- **Chat-style input** — describe the prescription naturally, AI extracts the structure
- **Client-side PDF generation** — professional layout with signature, stamp, and QR code
- **QR verification** — each prescription gets an HMAC-signed QR code for authenticity
- **Offline capable** — PWA with service worker; works without internet (AI features degrade gracefully)
- **BYOK (Bring Your Own Key)** — uses your Gemini API key, no server middleman
- **Repeat patient detection** — fuzzy name matching auto-fills returning patient details
- **Prescription history** — browse, cancel, or re-share past prescriptions
- **Zero cost to host** — static site on Cloudflare Pages

## Tech Stack

| | |
|---|---|
| **UI** | Preact + Tailwind CSS v4 |
| **Build** | Vite + TypeScript |
| **AI** | Vercel AI SDK + Gemini Flash (via `@ai-sdk/google`) |
| **Storage** | IndexedDB (via `idb`) — all data stays on device |
| **PDF** | jsPDF (client-side) |
| **QR** | `qrcode` + Web Crypto API (HMAC signing) |
| **Validation** | Zod v4 |

## Getting Started

```bash
cd rxpad
npm install
npm run dev
```

Open `http://localhost:5173`. You'll need a [Gemini API key](https://aistudio.google.com/apikey) — paste it in Settings.

### Build for Production

```bash
npm run build
npm run preview
```

Deploy the `dist/` folder to any static host (Cloudflare Pages, Vercel, Netlify).

## Optional cloud backend (PocketBase)

ScribRx runs fully on-device by default. An **optional** PocketBase backend adds
accounts, cross-device sync, a server-side AI proxy (so doctors don't bring their
own key), and hosted QR verification. It activates only when you set
`VITE_PB_URL` (see `rxpad/.env.example`); leave it empty to keep the original
zero-backend behaviour. Setup lives in [`backend/README.md`](backend/README.md).

> Enabling it stores patient data on a server — review the compliance notes in
> the backend README before going live.

## Project Structure

```
rxpad/
├── src/
│   ├── components/     # UI components (ChatInput, MedicineRow, PrescriptionView, etc.)
│   ├── hooks/          # Custom hooks (useInstallPrompt)
│   ├── lib/            # Core logic (pdf, gemini, db, qr, signature, stamp, audio)
│   ├── pages/          # Route pages (NewRx, History, Settings, Onboarding, Verify)
│   ├── schemas/        # Zod schemas (profile, prescription)
│   └── styles/         # Global CSS
├── public/             # Static assets, PWA icons
└── index.html
```

## Privacy

- All patient data is stored in IndexedDB on the doctor's device
- No server, no database, no analytics
- Gemini API calls send prescription text for parsing — patient names can be stripped before sending
- QR verification uses local HMAC keys; no server needed to verify

## License

MIT
