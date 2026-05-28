# ScribRx PocketBase backend

This optional backend turns ScribRx from a fully on-device PWA into a synced,
account-based app. The frontend stays on Cloudflare Pages (free); only this
PocketBase server needs an always-on host (Fly.io / a small VPS / Cloudflare
Containers). When the frontend's `VITE_PB_URL` is left empty, the app ignores
all of this and runs in its original local-only mode.

> ⚠️ **Patient data.** Enabling this stores prescriptions (health data) on a
> server. Pick a region close to your users (the sample `fly.toml` uses Mumbai,
> `bom`) and review your obligations under India's DPDP Act before going live.

## What the backend provides

| Goal | Mechanism |
|---|---|
| Accounts & login | Built-in `users` auth collection (email/password + Google OAuth2) |
| Cloud sync & backup | `profiles` + `prescriptions` collections, owner-scoped API rules |
| Hide the AI key | `POST /api/parse-rx` hook calls Gemini server-side (`pb_hooks/main.pb.js`) |
| Hosted QR verification | Public `GET /api/verify/{rxId}` hook returns only safe fields |

## 1. Run / deploy

```bash
# Local
docker build -t scribrx-pb .
docker run -p 8090:8090 -e GEMINI_API_KEY=sk-... -v $PWD/pb_data:/pb/pb_data scribrx-pb
# open http://127.0.0.1:8090/_/ to create the first superuser

# Fly.io
fly launch --no-deploy
fly volumes create pb_data --region bom --size 1
fly secrets set GEMINI_API_KEY=...
fly deploy
```

Then point the frontend at it: in `rxpad/.env`, `VITE_PB_URL=https://<your-host>`.

## 2. Create collections (Admin UI → Collections → New)

### `profiles` (Base)
One record per user.

| Field | Type | Notes |
|---|---|---|
| `user` | Relation → `users` | required, max-select 1, **unique** |
| `fullName`, `designation`, `regNumber` | Text | |
| `clinicName`, `phone` | Text | optional |
| `signatureFont`, `signatureStyle`, `hmacSecret` | Text | |
| `stampBase64`, `signatureBase64` | Text (or JSON) | base64 image data |

**API rules** (all five — list/view/create/update/delete):
```
@request.auth.id != "" && user = @request.auth.id
```

### `prescriptions` (Base)

| Field | Type | Notes |
|---|---|---|
| `user` | Relation → `users` | required, max-select 1 |
| `rxId` | Text | the human `RX-YYYYMMDD-0001` id; add a unique index |
| `status` | Select | `draft`, `finalized`, `cancelled` |
| `createdAt`, `finalizedAt`, `cancelledAt` | Text | ISO strings (app-controlled) |
| `data` | JSON | structured prescription (patient, medicines, labTests, …, qrPayload) |
| `pdf` | File | single file, `application/pdf` |
| `doctorName`, `regNo`, `patientInitials` | Text | public-safe verification fields |

**API rules** for list/view/create/update/delete:
```
@request.auth.id != "" && user = @request.auth.id
```
The public verification fields are exposed **only** through the
`GET /api/verify/{rxId}` hook, so the collection itself stays private.

## 3. Google OAuth (optional)

Admin UI → Collections → `users` → Options → OAuth2 → enable **Google**, paste
the client id/secret from Google Cloud Console, and add the redirect URL
`https://<your-host>/api/oauth2-redirect`.

## 4. CORS

Add your frontend origin (e.g. `https://scribrx.pages.dev`) under
Settings → Application, or run with `--origins=https://scribrx.pages.dev`.

## 5. File storage on Cloudflare R2 (free tier)

To keep uploaded PDFs/images on Cloudflare's free tier instead of the server disk:
Admin UI → Settings → Files storage → **Use S3 storage** and fill in your R2
bucket (endpoint `https://<account>.r2.cloudflarestorage.com`, the bucket name,
an R2 access key/secret, region `auto`). R2's free tier includes 10 GB storage
with no egress fees.

## Notes

- `pb_hooks/main.pb.js` targets PocketBase ≥ 0.23 (tested against 0.28). If you
  pin a different `PB_VERSION` in the Dockerfile, re-check the hooks API.
- The Gemini key lives only in the `GEMINI_API_KEY` server env — it is never
  shipped to the browser.
