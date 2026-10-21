# Room Presenter — implementation and QA notes

## Product goal

A classroom-first presentation room where a student can send a PowerPoint or PDF from their phone and present it on a university smart board without Google sign-in, a student account, or editing features.

## Main user journey

1. On the board, open **Start a presentation**.
2. Scan the room QR code or open its upload link on a phone.
3. Choose `.ppt`, `.pptx`, or `.pdf`; the server checks the file signature and temporarily relays the original file.
4. The board renders PDFs directly with PDF.js or parses PowerPoint in the browser with `@web-ppt/core`; no server-side format conversion occurs.
5. Use board controls, wheel, swipe, or keyboard—or keep the phone page open and use it as a remote.
6. The room and original uploaded file expire and are removed after the configured retention window.

## UX and interaction requirements

- Full-screen, dark presentation board with corner up/down controls, progress, slide count, zoom, reset, replace, and fullscreen.
- Responsive light upload page designed for one-handed use.
- QR and copyable URL on the board before and during a presentation.
- A mobile remote panel appears after a deck is available and auto-scrolls into view after a phone upload.
- Remote panel includes previous/next, swipe pad, slide scrubber, first/last, and zoom controls.
- Board slide/zoom state is reflected on connected phones through Socket.IO.
- Reduced-motion preferences are respected; GSAP is used for restrained page and slide transitions.

## Architecture

- **Client:** React + Vite, GSAP, Lucide icons, QRCodeSVG, PDF.js for PDFs, and `@web-ppt/core` for browser-side PPT/PPTX parsing and SVG rendering.
- **Server:** Express + Socket.IO + Multer. Room codes are random short-lived bearer capabilities, not user accounts.
- **Conversion:** None. The original upload is kept unchanged; PDFs are rendered directly, while `.ppt` / `.pptx` are parsed and rendered as SVG in the board browser.
- **Transport:** Socket.IO sends live deck and slide-state updates plus phone remote commands.
- **Storage:** Original uploads remain outside the web root under generated filenames and are purged on room expiry.

## Privacy and operational assumptions

- No authentication provider, Google OAuth, analytics, or remote font service is included.
- Upload content passes through the machine hosting this application. The safest classroom setup is a server on the university's trusted local network.
- The QR/upload URL is a bearer capability: anyone who has it can upload to that room. Share it only with the class.
- Basic file-signature checking, file-size limits, allowlisted extensions, generated filenames, temporary storage, and cleanup reduce risk but do not replace malware scanning or a sandbox for high-risk public deployments.
- The browser-side renderer supports PowerPoint `.ppt` / `.pptx` with feature/fidelity limits; this app currently renders static slide views rather than replaying native per-object animations or PowerPoint slide transitions. Some effects, fonts, embedded media, or complex objects can render differently from desktop PowerPoint. PDF uploads use PDF.js directly.
- In-memory room state is suitable for one app instance. Multi-instance deployment needs shared room state and shared storage.

## Validation checklist

### Static checks run

- `node --check server/index.js` — passed.
- `node --check tests/smoke.test.js` — passed.
- TypeScript parser syntax pass for `src/App.jsx`, `src/main.jsx`, and `vite.config.js` — passed.

### Automated tests included

Run these after dependencies are installed:

```bash
npm install
npm test
npm run build
```

The smoke tests cover health, room creation, original PDF and PPTX upload/download without conversion, private-path non-disclosure, socket room join, mobile remote command delivery, slide-state broadcast, spoofed-PDF rejection, and unknown-room rejection.

### Environment limitation during this build

An install was attempted but npm reported `EAI_AGAIN` resolving `registry.npmjs.org`. As a result, runtime tests and the Vite production build could not be executed in this environment because dependencies were not available. This is an environment/network blocker, not a passing end-to-end test claim.

## Technical references

- Mozilla PDF.js: https://github.com/mozilla/pdf.js
- Web-PPT: https://github.com/unStone/web-ppt
- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html


## Mobile responsiveness pass (2026-10-16)

- Added a mobile-only two-way **Upload deck / Remote control** switch when a presentation exists. New uploads automatically move the phone UI into remote mode; switching back exposes the uploader to send a replacement deck.
- On viewports up to 820px, the verbose intro copy is hidden to prioritize the task surface and use the full screen for upload or remote controls. Desktop two-column upload layout remains intact.
- Added narrow-device refinements for 420px and 350px widths: safe-area-aware sticky switch, narrower room badge, wrapped file names and buttons, constrained grid children, responsive remote heading/readout, and larger touch targets.
- Set the remote gesture pad to `touch-action: none` so left/right and up/down swipes reliably reach slide navigation instead of being consumed by page scrolling.
- Validation after the change: TypeScript JSX transpilation and PostCSS stylesheet parsing passed. Full Vite build, browser-based app flow, and automated runtime tests could not be run because project dependencies are not installed and npm registry access previously failed (`EAI_AGAIN`).

## No-conversion update (2026-10-16)

- Removed LibreOffice invocation and PDF generation from the server upload flow.
- Server stores and serves the original `.ppt`, `.pptx`, or `.pdf` temporarily with its original bytes and a file-specific content type.
- PDF uses PDF.js; PowerPoint uses lazy-loaded `@web-ppt/core` (`parse` + `renderSlideToSvg`) on the board browser. A slide SVG sanitizer removes scripts, embedded HTML objects, event handlers, and external URLs before insertion.
- Added `tests/fixtures/browser-render-smoke.pptx` and transport test to assert uploaded PPTX bytes are returned unchanged.
- Full `npm install`, Vite build, and end-to-end test run remain unverified here because the npm registry connection timed out.

## Hosting caveat

No conversion means LibreOffice is not needed, but this does not remove the current persistent-server requirement. The app uses Express + Socket.IO, in-memory rooms, and temporary filesystem storage. The simplest deployment is the full app on a persistent Node/Docker host. A split Vercel frontend would need API-base URL, Socket.IO origin, CORS/proxy, and persistent-storage wiring not yet implemented. Vercel's 4.5 MB request/response function limit conflicts with the current 75 MB upload route.


## Chalkboard visual / PowerPoint text-rendering fix (2026-10-16)

- Root cause confirmed from the renderer's documented preview pipeline: Web-PPT lays out PowerPoint text inside SVG `foreignObject` nodes. `sanitizeRenderedSvg` previously deleted `foreignObject`, which removed text along with its HTML layout. The sanitizer now preserves browser text layout nodes and continues stripping scripts, iframes, objects, embeds, inline event handlers, and external resource URLs.
- Added `SlideThumbnail` + `SlideFilmstrip` for PDF and PowerPoint, with direct slide jumps and previous/next strip navigation.
- Redesigned board presentation UI around the supplied wooden-frame green chalkboard image: paper-style left upload/link + QR cards, central slide canvas and filmstrip, right functional previous/next and zoom controls. Made the empty-room QR/invite state match the board theme as well.
- Added a compact WebP (`public/chalkboard-frame.webp`, ~158 KB) generated from the provided board image.
- Static validation after changes: TypeScript JSX transpilation for `src/App.jsx`/`src/main.jsx` passed; `tinycss2` stylesheet parse passed with zero errors. `npm test` could not start because npm dependencies are not installed (`ERR_MODULE_NOT_FOUND: socket.io-client`); therefore the full browser rendering and production build still need to be tested after `npm install`.


## Final layout refinement — active deck uses the left rail (2026-10-16)

User-provided screenshot marks the target canvas to expand across the old left upload/QR sidebar while retaining the remote controller at the right. The active-deck branch no longer renders `.chalkboard-left-rail`. The grid is now center presentation + remote rail on desktop, and a full-width canvas on tablet/mobile. Waiting-room upload and QR cards remain unchanged; the Invite presenter modal and Replace control still provide re-entry points for uploading replacement decks. JSX/CSS syntax checks pass; no browser runtime claim is made.

## Final layout refinement — 2026-10-16

- Removed the slide thumbnail filmstrip from the live presentation view.
- Removed the bottom presentation toolbar, including its separate previous-slide arrow and duplicate zoom widget.
- Kept slide movement and zoom within the right-side remote rail and the paired mobile remote.
- Added Reset presentation and Replace deck actions directly below the LIVE PRESENTATION status in the right rail.
- Increased topbar inset and title width so room/deck title text sits below the board's wooden upper frame and is less likely to truncate.
- Added narrow-screen overrides so the presentation canvas occupies the available viewport without reserved thumbnail/footer rows.
- Static validation passed: TypeScript JSX transpilation, CSS brace balance, and checks that the filmstrip/footer are not rendered.
- Full app build/browser E2E not run in this environment because project npm dependencies are not installed.


## Vercel 404 diagnosis and backend-origin configuration (2026-10-16)

- The landing page's Start action posted to the relative `/api/rooms` endpoint. On a frontend-only Vercel deployment, no Express route existed at that path, so Vercel returned HTML 404 and the UI fell back to a generic error.
- Added Vite build-time configuration via `VITE_API_BASE_URL`, `VITE_SOCKET_URL`, and `VITE_PUBLIC_APP_URL`. Room creation/lookups, uploads, downloads, and Socket.IO can now connect to a separate persistent backend; QR/present links can use the Vercel origin.
- Added Express CORS handling and Socket.IO CORS configuration using `FRONTEND_ORIGINS`; configured origin mismatch returns a specific backend error.
- Added `vercel.json` SPA rewrites for `/present/:roomId` and `/upload/:roomId` direct links.
- The client now shows an actionable message if the frontend is deployed without its API backend rather than a generic “Something went wrong”.
- Validation completed: `node --check server/index.js`; JSX transpilation with TypeScript's JSX transpiler; `tinycss2` stylesheet parsing; `vercel.json` JSON validation. Full Vite build and runtime/socket tests remain unexecuted because dependencies are not installed in this environment.
