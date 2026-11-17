# Ajaia Docs

A lightweight collaborative document editor. You can create, format, import, share and reopen documents.

**Live demo:** https://ajaia-docs-hrva.onrender.com (free tier, so the first load after idle can take ~30–50 s)

## Demo accounts (no password: pick one on the sign-in screen, use "Switch user" to change)

| User | Email | In the seeded "Welcome" doc |
|---|---|---|
| Alice Owner | alice@ajaia.test | Owner |
| Bob Editor | bob@ajaia.test | Can edit |
| Carol Viewer | carol@ajaia.test | View only |

**Quick sharing check:** sign in as Alice → **New document** → **Share** → `carol@ajaia.test`, *Can view* → **Switch user** → Carol. The doc is under **Shared with me** and opens read-only.

## Features
- **Documents:** create, rename, edit, delete (owner only). Autosave with a *Saving… / Saved / Not saved* indicator.
- **Rich text:** headings H1–H3, bold, italic, underline, strikethrough, bulleted and numbered lists, quotes, links.
- **File upload** (sample files in `samples/`): supports **.txt, .md and .docx only**, max 2 MB.
  - *Import file* (home) creates a new editable document from the file.
  - *Insert file* (editor) inserts the file's content into the current draft.
  - Other file types are rejected with a clear message.
- **Sharing:** the owner shares by email as *Can edit* or *Can view*, and can change the role or remove access. The home screen separates **My documents** from **Shared with me**.
- **Persistence:** SQLite. Formatting is stored as HTML and survives reloads.

## Run locally
Requires **Node.js ≥ 22.13** (uses the built-in `node:sqlite`, so there is no native build step).
```bash
npm install
npm start      # http://localhost:3000
npm test       # 7 API tests, in-memory DB
```
Env vars:
- `PORT` (default 3000)
- `DB_PATH` (default `./data/app.db`)
- `COOKIE_SECRET` (set it in production)

Delete `data/` to reset the demo data.

## Deploy (Render, free)
1. Push to GitHub.
2. In Render, choose **New → Blueprint**, select the repo, and it picks up `render.yaml`.

Render's free tier has no persistent disk, so data **resets on restart or redeploy** (seed data comes back). The next step for durability would be Postgres.

## Layout
```
src/app.js        routes, validation, errors
src/access.js     permission rules (owner/editor/viewer)
src/db.js         schema + seed data
src/importer.js   .txt/.md/.docx → sanitised HTML
public/           frontend (vanilla JS + Quill 2)
test/             API tests
docs/             architecture + AI workflow notes, screenshots
```
