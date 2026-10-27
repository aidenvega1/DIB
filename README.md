# Sticky Tasks

## Why it wasn't working on GitHub
GitHub Pages only serves plain static files (HTML/CSS/JS) — it cannot run Python at all.
It also only auto-serves an `index.html` that sits at your repo's root or inside a `/docs`
folder, not one buried in `/static`. Your original `index.html` lived in `static/` and
linked to `/static/style.css` and `/static/app.js`, so on Pages nothing loaded.

This version fixes both problems:
- The front end (`docs/index.html`, `docs/style.css`, `docs/app.js`) is fully self‑contained
  and needs no server — all folder/note data lives in the browser tab and is saved/loaded
  through the **Download** / **Load** buttons as a `sticky-tasks.json` file.
- `app.py` is an *optional* Flask server that serves that exact same `docs/` folder, for
  when you want to run or host it with Python.

## Option A — GitHub Pages (no Python needed)
1. Push this folder to a GitHub repo.
2. Repo **Settings → Pages → Build and deployment → Deploy from a branch**.
3. Branch: `main`, folder: **`/docs`**. Save.
4. Your site is live at `https://<you>.github.io/<repo>/` in a minute or two.

## Option B — run locally with the Flask backend
```bash
pip install -r requirements.txt
python app.py
```
Then open http://localhost:5000.

## Option C — host the Python backend elsewhere
GitHub Pages can't run `app.py`, but a Python-friendly host can (Render, Fly.io,
PythonAnywhere, Railway, Replit). Point any of them at `app.py`; it serves the same
`docs/` folder.

## What was fixed from your original code
- Removed the duplicated `app.py` block.
- `index.html` now links to `style.css` / `app.js` with relative paths instead of
  `/static/...`, so it works unmodified under GitHub Pages, Flask, or just opening the
  file directly.
- `app.js` no longer depends on the `/api/import` and `/api/export` endpoints (that
  fetch call was silently failing whenever there was no backend, which is why Load
  and Download looked broken) — loading and saving JSON now happen entirely in the
  browser, with the same validation rules your Flask `clean()` function had.
- Minor bug: a stray `textarea.blur()` call that ran right after creating a text note.