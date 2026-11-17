# Submission: Ajaia Docs

- **Live URL:** <PASTE RENDER URL>
- **Video:** see `VIDEO_URL.txt`
- **Test accounts:** no password, pick on the sign-in screen
  - alice@ajaia.test (owner of the seeded doc)
  - bob@ajaia.test (editor)
  - carol@ajaia.test (viewer)

## Included
| Item | Location |
|---|---|
| Source code | `src/` (backend), `public/` (frontend) |
| Automated tests | `test/api.test.js` (`npm test`) |
| Setup & run instructions | `README.md` |
| Architecture note | `docs/ARCHITECTURE.md` |
| AI workflow note | `docs/AI_WORKFLOW.md` |
| Deployment config | `render.yaml` |
| Walkthrough video link | `VIDEO_URL.txt` |
| Screenshots | `docs/screenshots/` |

## Status
**Working end to end:**
- Mock login.
- Documents: create, rename, rich-text edit, autosave, reopen, delete.
- File upload: import `.txt`/`.md`/`.docx` as a new doc, or insert into an existing draft.
- Sharing: owner/editor/viewer roles, share by email, change role, revoke, with "My documents" and "Shared with me" separated.
- SQLite persistence.
- Validation and error messages.
- 7 passing API tests.

**Incomplete or simplified:**
- No real-time co-editing (last write wins).
- Mock auth.
- The deployed DB resets when the free Render instance restarts.

**Next 2–4 hours:**
1. Postgres for durable storage.
2. Edit-conflict detection.
3. Version history.
4. Markdown/PDF export.
5. Playwright browser test.
