# AI workflow note

## Tools
- **Claude Code** (Anthropic), used in VS Code as a pair-programmer for scaffolding, code, tests and docs.
- I set the scope, the priorities and the cuts, and I reviewed and tested the output myself.

## Where AI materially sped things up
- Boilerplate: the Express routes, the SQLite schema, the Quill toolbar setup and the CSS.
- Writing the API test suite. It covers auth, persistence, validation, sharing roles and import.
- Drafting the README and notes, which I then edited.

## What I changed or rejected
- **Express 4 → Express 5.** The first draft used Express 4, which silently drops errors from async handlers (file import). Moving to Express 5 makes those errors reach the error middleware.
- **Save-retry bug.** The generated retry logic for failed autosaves could overwrite newer edits with older ones. I rewrote it so the newest value always wins.
- **Quill API.** One call used a non-public Quill API (`Quill.imports.delta`). I replaced it with the supported `Quill.import('delta')`.
- **SQLite driver.** I rejected `better-sqlite3`, a native module that often fails to build on Windows or CI, in favour of Node's built-in `node:sqlite`.
- **Permission errors.** I asked for 404 instead of 403 for documents a user can't access, so ids don't leak.
- <ADD 1–2 THINGS YOU CHANGED YOURSELF WHILE TESTING>

## How I verified it
- **Automated:** `npm test` runs 7 end-to-end API tests on an in-memory DB. They cover role enforcement (viewer can't edit, non-owner can't share or delete, revoked user loses access), formatting surviving a reload, input validation, file import, and script stripping.
- **Manual:**
  - Ran the full flow in the browser as all three users: create, format, rename, reload, import `.md`/`.docx`/`.txt`, share as editor and viewer, revoke.
  - Checked the error states: an unsupported file, an empty title, sharing with an unknown email.
- **Code review:** I read every generated file before committing, focusing on the access checks and on what gets stored and rendered.
