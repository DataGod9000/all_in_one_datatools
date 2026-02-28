# DataTools React Frontend

A React version of the DataTools app. **Original static files are untouched** — you can always fall back to `static/index.html` by opening `http://127.0.0.1:8000/` directly.

## Run (development)

1. Start the FastAPI backend:
   ```bash
   cd datatools-portfolio
   source .venv/bin/activate
   uvicorn main:app --reload --port 8000
   ```

2. Start the React dev server (in another terminal):
   ```bash
   cd datatools-portfolio/frontend
   npm run dev
   ```

3. Open **http://localhost:5173** — Vite proxies `/ddl`, `/compare`, `/validate`, `/assets`, `/query`, `/docs` to the backend on port 8000.

## Build for production

```bash
cd frontend
npm run build
```

Output is in `frontend/dist/`. To serve it via FastAPI, mount the static files or point your server at `frontend/dist`.

## Fallback to original

To use the original HTML/CSS/JS app, open **http://127.0.0.1:8000/** (backend only, no React).
