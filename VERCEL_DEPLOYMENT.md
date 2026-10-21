# Deploy Room Presenter on Vercel (frontend) with a backend

The current 404 comes from deploying the Vite frontend without the Express API. The `/api/rooms` route lives in `server/index.js`; it is not part of a static Vite build. This project also needs persistent room state, temporary upload storage, and Socket.IO. Use Vercel for the frontend and one persistent Node/Docker web service for the backend.

## 1. Deploy the backend first

1. Push the `ppt-presenter` folder to a Git repository.
2. Create a web service on Render or Railway from that repository. Set the service root/context to `ppt-presenter` if the repository contains the parent folder. Select Docker deployment and use the included `Dockerfile`.
3. Wait for the service to become healthy. Open `https://YOUR-BACKEND-HOST/api/health`; expect JSON with `ok: true`.
4. Configure these backend environment variables. Use the exact HTTPS origins, without trailing slashes:

```text
PORT=4173
PUBLIC_BASE_URL=https://YOUR-BACKEND-HOST
PUBLIC_APP_URL=https://YOUR-PROJECT.vercel.app
FRONTEND_ORIGINS=https://YOUR-PROJECT.vercel.app
MAX_UPLOAD_MB=75
ROOM_TTL_HOURS=3
```

`PORT` may be assigned automatically by the host; the app honors the host-provided value. Include your production custom domain in `FRONTEND_ORIGINS` as well if you use one. For Vercel preview deployments, temporarily add the preview origin to the comma-separated allowlist while testing.

## 2. Deploy the frontend to Vercel

1. Import the repository into Vercel. Set Root Directory to `ppt-presenter` if needed.
2. Use the Vite preset, Build Command `npm run build`, and Output Directory `dist`.
3. Add the following under Project → Settings → Environment Variables. These are Vite build-time values, so redeploy after changing them:

```text
VITE_API_BASE_URL=https://YOUR-BACKEND-HOST
VITE_SOCKET_URL=https://YOUR-BACKEND-HOST
VITE_PUBLIC_APP_URL=https://YOUR-PROJECT.vercel.app
```

4. Redeploy the Vercel project.

## 3. Verify

- `https://YOUR-BACKEND-HOST/api/health` returns JSON `ok: true`.
- On Vercel, **Start a presentation** creates a room instead of returning a 404.
- The board opens at `/present/ROOMCODE` and the QR opens `/upload/ROOMCODE` on the Vercel domain.
- The browser Network tab shows API and Socket.IO traffic going to `YOUR-BACKEND-HOST`, not to `YOUR-PROJECT.vercel.app/api/...`.

## Operational notes

- Keep one backend instance for this MVP: room records are held in process memory and temporary source files live on the backend disk. A process restart loses active rooms and their uploads. Use a persistent always-on instance for a live class.
- Uploads go directly to the backend. They do not pass through a Vercel Function, avoiding Vercel's 4.5 MB Function request/response payload cap.
- Never set `VITE_API_BASE_URL` to the Vercel frontend URL. It must be the backend service origin.
- The app has no account/login flow. The room code is a bearer capability, so only share it with the class.
