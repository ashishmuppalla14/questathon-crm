# Deployment (you must do the login steps)

## Backend → Render (or Railway)
1. Push the repo to GitHub (public). Confirm `.env` is not tracked: `git ls-files | grep -i env` should show only `.env.example`.
2. Render → New → Blueprint → select repo (uses `render.yaml`) or create a Web Service: build `npm install && npm run build -w server`, start `npm start -w server`, health check `/health`.
3. Set env vars in the Render dashboard: `AQ_TOKEN`, `ADMIN_KEY` (long random), `MCP_URL`, `CORS_ORIGINS=https://<your-vercel-app>.vercel.app`, `DATA_DIR`.
4. **Persistence:** free instances have an ephemeral disk, so the cache and the 65 s clock reset on redeploy/sleep. Use a persistent disk (paid) or accept a re-sync (~10 min) after restarts.

## Frontend → Vercel
1. Import repo, **Root Directory = `web`**, framework Vite.
2. Env var `VITE_API_URL=https://<your-render-service>.onrender.com`.
3. Redeploy, then open the URL in a private window → Synchronization → enter ADMIN_KEY → run sync.

## Verify before submitting
Health check returns `{"ok":true}`; private-window load works; `curl <api>/api/state` contains no token; repo public; docs/video links set to "anyone with the link".
