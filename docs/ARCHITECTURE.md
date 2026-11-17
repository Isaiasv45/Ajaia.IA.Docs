# Architecture note

## Shape
One Node.js service serves both the REST API and a static single-page frontend, which keeps deployment to a single free service.

```
Browser (vanilla JS + Quill 2) ──JSON/multipart──▶ Express 5 ──▶ SQLite (node:sqlite)
```

- **Data model:** three tables.
  - `users`
  - `documents`, with an `owner_id`
  - `shares (document_id, user_id, role)`, where role is `viewer` or `editor`
- **Access control:** lives in `src/access.js` (`roleFor` + `can.read/edit/manage`). Every document route goes through one `loadDoc(need)` middleware.
  - A user with no access gets **404**, not 403, so document ids don't leak.
  - Viewers get 403 on writes. Only owners manage sharing or delete.
- **Auth:** mocked on purpose. You pick a seeded user and the user id goes into a signed, httpOnly cookie. Real auth adds nothing to what this exercise tests.
- **Content format:** the editor's HTML is stored as-is. Quill re-parses it through its format whitelist on load, so only supported formatting renders. The server also strips script/style/iframe tags and `on*` handlers.
- **Upload:** files are processed in memory (multer, 2 MB cap).
  - `.md` goes through `marked`.
  - `.docx` goes through `mammoth`.
  - `.txt` becomes escaped paragraphs.
- **Saving:** the client debounces saves (~0.7 s), sends them one at a time, retries on the next edit after a failure, and flushes when you navigate away.

## What I prioritised, and why
1. **A complete core loop.** Create → format → autosave → reopen → share → the other user sees it with the right permissions. That's what a reviewer tests first.
2. **Correct sharing logic.** Roles are enforced on the server, not just hidden in the UI, and the tests cover them.
3. **Zero-friction setup.** The built-in SQLite means no native modules and no external DB, so `npm install && npm start` just works.
4. **Role-based sharing (viewer/editor)** as the one stretch item. It was cheap once the access layer existed.

## Deliberate cuts
- **Real-time co-editing:** saves are last-write-wins. Doing this properly needs CRDT/OT (e.g. Yjs), which is more than the timebox allows.
- **Real auth and invites:** sharing only works with existing seeded users.
- **Version history, comments, export:** not built.
- **Durable hosted storage:** the Render free tier disk is ephemeral (see README).
- **Frontend framework and bundler:** one screen-level SPA didn't need them.

## Next 2–4 hours
1. Postgres for durable deploys.
2. Optimistic concurrency (`updated_at` check → "document changed" prompt).
3. Version snapshots on save.
4. Export to Markdown/PDF.
5. Browser E2E test (Playwright).
