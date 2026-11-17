# AI workflow note

## Tools
- **Claude Code** (Anthropic) inside VS Code, used as a coding copilot.
- I owned the product decisions, the review, the UI polish, the deployment and the testing. The AI generated most of the first draft of the code, tests and docs.

## How I split the work
| Me | AI copilot |
|---|---|
| Scoped the slice: complete core loop first, explicit cuts, one stretch item (viewer/editor roles) | Proposed the stack and scaffolded the project |
| Set constraints: free hosting, zero-friction setup, keep the solution lean and explainable | Wrote the first draft of routes, schema, editor integration and tests |
| Reviewed the code, especially access control and how content is stored and rendered | Drafted the README and notes, which I edited |
| Polished the UI: Inter typography, SVG icons instead of text glyphs, spacing and visual details | Fixed issues I flagged |
| Created the GitHub repo and deployed to Render via the Blueprint (`render.yaml`), then verified the live build | |
| Tested every flow manually, locally and in production, as all three users | |

## Where AI materially sped things up
- Boilerplate: the Express routes, the SQLite schema, the Quill toolbar and the base CSS. That's hours of typing down to minutes.
- The API test suite. It covers auth, persistence, validation, sharing roles and import.
- First drafts of the documentation.

## What was changed or rejected
- **Express 4 → Express 5.** The first draft used Express 4, which silently drops errors thrown in async handlers such as file import. Moving to Express 5 makes those errors reach the error middleware.
- **Save-retry bug.** The generated retry logic for failed autosaves could overwrite newer edits with older ones. It was rewritten so the newest value always wins.
- **Quill API.** A call to a non-public Quill API (`Quill.imports.delta`) was replaced with the supported `Quill.import('delta')`.
- **SQLite driver.** `better-sqlite3`, a native module that often fails to build on Windows or CI, was rejected in favour of Node's built-in `node:sqlite`. Setup is just `npm install && npm start`, locally and on Render.
- **Permission errors.** Documents a user can't access return 404 instead of 403, so document ids don't leak.
- **Generated UI.** The look felt generic, so I reworked it by hand (typography, iconography, polish) to make it feel like a real product and not a template.
- **Browser automation.** An attempt at automated browser screenshots didn't work in my environment. I dropped it and kept manual end-to-end testing, plus automated API tests, as the verification strategy.
- **Bugs caught in end-to-end browser testing.** Driving the real UI in a browser surfaced two visual regressions from the redesign that unit tests could not catch. An SVG icon had no explicit size and rendered full-width on the home screen, and the editor showed a browser focus outline around the page. We traced both to the CSS, fixed them, and re-verified. This is why I don't treat green API tests as "done".
- **Upload bug caught on the live deployment.** Choosing a file in the browser did nothing, even though the import API worked when I called it directly. I isolated it by uploading through the API, which succeeded, so the backend was fine. The cause was the file input being created detached from the DOM, where Chromium doesn't reliably fire `change`. Fixed by attaching it to the page.

## How I verified it
- **Automated:** `npm test` runs 7 end-to-end API tests against an in-memory DB.
  - Role enforcement: a viewer can't edit, a non-owner can't share or delete, a revoked user loses access.
  - Formatting survives a reload.
  - Input validation.
  - File import, including script stripping.
- **Manual, local and production:**
  - The full flow as Alice, Bob and Carol: create, format, rename, reload, import `.md`/`.txt`/`.docx`, share as editor and viewer, change role, revoke.
  - Error states: an unsupported file (e.g. `.png`), an empty title, sharing with an unknown email.
- **Deployment:** after the Render deploy I checked the live API, the login cookie and the seeded sharing data on the production URL.
- **Review:** I read the generated code before committing, focusing on the access checks, input validation and what gets stored and rendered.
