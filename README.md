# Room Presenter

A privacy-first, no-login presentation room for classrooms. A presenter opens a room on the smart board, shares a QR code or upload link, and a student sends a `.ppt`, `.pptx`, or `.pdf` file from their phone. The board opens the deck in a reader-only slide view with zoom, trackpad/wheel, touch-swipe, keyboard, and corner navigation controls. The uploader phone doubles as a remote with next/previous, slide scrubbing, swipe gestures, first/last, and zoom controls.

## Requirements

- Node.js 22 or newer
- No PowerPoint or LibreOffice installation required; PowerPoint files are parsed in the browser
- A modern Chromium, Firefox, or Safari browser
- Board and phone on the same local network for a private, self-hosted classroom setup

## Run locally

```bash
npm install
```

PowerPoint rendering runs in the browser through `@web-ppt/core`; PDFs are displayed directly with PDF.js. No LibreOffice install and no server-side format conversion are required. The source `.ppt` / `.pptx` / `.pdf` file is temporarily relayed by the room server so the smart board can download and render it.

Start both the API and development UI:

```bash
npm run dev
```

Open `http://localhost:5173` on the machine connected to the smart board, then select **Start a presentation**. The QR URL preserves the browser-facing origin and uses the machine's LAN IPv4 address when the board is opened through `localhost`. If the phone cannot load the QR link, open the board page from the machine's LAN address instead (for example, `http://192.168.1.25:5173`). Ensure the firewall permits the chosen port on the trusted classroom network.

For a production-style single-server run:

```bash
npm run build
npm start
```

Open `http://localhost:4173`. On a local network, other devices should use the host machine's LAN IP and port `4173`.

### Troubleshooting PowerPoint uploads

- If a PDF opens but a PowerPoint deck does not, check the browser console for a rendering error and try the sample file in `tests/fixtures/browser-render-smoke.pptx`.
- The PowerPoint renderer runs on the smart-board browser and does not require LibreOffice. Very complex effects, uncommon fonts, legacy charts, or unsupported embedded objects may render differently from native PowerPoint; use PDF when exact static layout is essential.
- Uploaded files still pass through the room server and are stored temporarily so the board and phone can share the same deck. Use a trusted self-hosted backend for sensitive class presentations.

### Environment variables

Copy `.env.example` values into your shell or deployment environment as needed:

- `PORT` — server port (default `4173`)
- `PUBLIC_BASE_URL` — optional canonical base URL, required if a reverse proxy or public domain is in use
- `MAX_UPLOAD_MB` — file size limit (default `75`)
- `ROOM_TTL_HOURS` — room lifetime and temporary deck retention (default `3`)
- `DATA_DIR` — optional directory for temporary original uploads and room files

For a public deployment, set `PUBLIC_BASE_URL` to the external HTTPS origin and deploy behind HTTPS. If multiple server instances are used, room state and temporary files need a shared session/storage service; this MVP keeps rooms in process memory and is intended for a single instance.

### Vercel deployment (frontend) + persistent API backend

The screenshot error `Something went wrong` with a 404 happens when Vercel serves the Vite frontend but `/api/rooms` is not present on that deployment. This project uses an Express API, in-memory room sessions, disk-backed temporary uploads, and Socket.IO; these are not created by deploying the static `dist` folder alone.

Recommended split deployment:

1. Deploy the `ppt-presenter` folder to Vercel as a Vite app (Build command `npm run build`, Output Directory `dist`). The included `vercel.json` rewrites `/present/:roomId` and `/upload/:roomId` to the SPA entry point.
2. Deploy the same project as a persistent Node/Docker web service on Render, Railway, or a university server. Use the included `Dockerfile`; do not deploy only `dist` as the backend.
3. On the backend host, set `PUBLIC_BASE_URL` to the HTTPS backend origin, `PUBLIC_APP_URL` to the HTTPS Vercel origin, and `FRONTEND_ORIGINS` to the allowed Vercel origin (comma-separated if there are multiple domains).
4. In Vercel → Project → Settings → Environment Variables, set these **build-time** variables to the backend/frontend origins (no trailing slash):

   - `VITE_API_BASE_URL=https://your-room-presenter-api.onrender.com`
   - `VITE_SOCKET_URL=https://your-room-presenter-api.onrender.com`
   - `VITE_PUBLIC_APP_URL=https://your-room-presenter.vercel.app`

5. Redeploy Vercel after setting the variables. Test the backend directly at `https://your-room-presenter-api.onrender.com/api/health`; it should return JSON such as `{"ok":true,...}`. Then click Start a presentation on the Vercel site. QR links should use the Vercel origin, while uploads, deck downloads, and Socket.IO use the backend origin.

Use the exact origins shown in your deployments rather than the example hostnames. Keep one backend instance for this MVP because room state is in memory; restarting the backend expires active rooms and its temporary files. The 75 MB upload is sent directly to the persistent backend, not through a Vercel Function (which has a 4.5 MB request/response limit). See [Vercel function limits](https://vercel.com/docs/functions/limitations).

## Docker

```bash
docker build -t room-presenter .
docker run --rm -p 4173:4173 -e PUBLIC_BASE_URL=http://192.168.1.25:4173 room-presenter
```

Replace the example URL with the address that the board and phones can actually reach. For production, use HTTPS and a real hostname. The Docker image does not install LibreOffice; PowerPoint rendering runs in the client browser.

## Tests

```bash
npm test
```

The smoke tests check health, room creation, raw PDF and PPTX upload/download, private-path non-disclosure, socket room join, remote commands, slide-state broadcast, spoofed-PDF rejection, and unknown-room rejection. The PPTX test fixture confirms original file bytes are passed through unchanged; browser rendering should additionally be tested with representative class decks.

## Privacy and security model

- No Google account, OAuth, or student account is used.
- A high-entropy room code is the upload capability; share it only with the class.
- Uploads are size-limited, restricted to `.ppt`, `.pptx`, and `.pdf`, and checked against basic file signatures. These checks reduce accidental and trivial spoofing but are not a malware scanner.
- Original uploads are stored under generated names outside the web root and are served only through the matching room's deck ID.
- Room state and original presentation files are deleted when the room expires (default three hours); orphaned temporary files older than one hour are cleaned up.
- The app does not use analytics or remote fonts.
- **For strict privacy, self-host this on the university's trusted local network.** A QR upload necessarily sends the selected file to the server hosting this app; with an internet-hosted server, the file passes through that server. The QR link is not an end-to-end device-to-device transfer.

## Reader-mode rendering note

PDF uploads are rendered directly with PDF.js. `.ppt` and `.pptx` uploads are parsed in the smart-board browser with `@web-ppt/core` and rendered as SVG; the server never converts them to PDF and does not need LibreOffice. This app currently renders each PowerPoint slide as a static view: it does not replay native per-object animations or slide transitions. Fonts, some charts/effects, and embedded audio/video may also differ from desktop PowerPoint. Use PDF for the most predictable static layout.


## Chalkboard presenter UI and PowerPoint text fix

- The board presenter route uses the provided green chalkboard / wooden-frame asset (`public/chalkboard-frame.webp`) as its full-screen surface. Before a deck arrives, the board shows the QR and local-upload options. Once a deck is loaded, the upload/QR rail and thumbnail filmstrip are hidden so the current slide can use the available canvas; the right-side chalk remote retains navigation, zoom, fit-to-screen, reset, and replace actions. The top-bar invite action can reopen the QR modal for replacements. Compact layouts adapt the controls for narrow screens.
- Fixed missing PowerPoint text: Web-PPT uses SVG `foreignObject` elements for browser-native text layout. The previous sanitizer deleted all `foreignObject` nodes, removing text from every affected slide. The sanitizer now preserves them while stripping script/object/embed nodes, event handlers, and untrusted external resource references.
- The chalkboard background is a compressed WebP derivative of the user-supplied blank board image. No external font assets or analytics are loaded.

## Mobile remote controls

After a deck is uploaded, phones switch to a mobile-first remote view automatically. On screens at or below 820px, a sticky **Upload deck / Remote control** switch lets the presenter move between the uploader and remote without scrolling. The uploader remains available to replace the current deck. Layouts adapt down to 320px, buttons have larger touch targets, long file names wrap safely, and the swipe area captures gestures without scrolling the page. Previous/Next controls, a slide scrubber, swipe pad, first/last navigation, and zoom buttons send commands through the room's Socket.IO channel. The board broadcasts its current slide and zoom to connected phones. Keep the phone page open for the duration of the presentation.

## Implementation references

- [Mozilla PDF.js examples](https://github.com/mozilla/pdf.js/blob/master/docs/contents/examples/index.md) — browser-side PDF page rendering on canvas.
- [Web-PPT renderer](https://github.com/unStone/web-ppt) — browser-side `.ppt` / `.pptx` parsing and SVG rendering.
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) — allowlisted extensions, generated storage names, upload limits, and defense-in-depth validation.


## Active presentation canvas expansion (2026-10-16)

- Removed the left **Upload Presentation** and **Scan to Present** cards from the active-deck layout so they do not compete with the slide once a phone has uploaded a presentation.
- Reconfigured the desktop presentation grid to two columns: an expanded slide/canvas/filmstrip/control column on the left (taking over the former upload-and-QR region) and the chalkboard remote rail on the right, matching the marked target region in the supplied screenshot.
- Updated tablet rules so the removed column does not leave an empty grid gap. At mobile widths, the presentation canvas remains full width and the right-side remote rail continues to collapse as before.
- Uploading a replacement is still available through the **Replace** control; the top-bar **Invite presenter** opens the QR/link modal again when another phone needs access.
- Validation: TypeScript JSX transpilation passed; `tinycss2` found no CSS parse errors. Browser visual/end-to-end testing remains outstanding because dependencies are not installed in this environment.

## Latest presenter layout update

The live-deck view now hides the thumbnail filmstrip and the old bottom toolbar so the current slide can use the full available board height. Slide navigation and zoom remain in the right-side remote panel. Reset presentation and Replace deck are placed beneath the LIVE PRESENTATION status. The top bar has additional top inset below the wooden frame and a wider title region to prevent the room/deck title from being clipped. Mobile layout keeps the deck canvas full-screen and hides desktop-only rail/toolbar elements.
