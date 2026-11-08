# VidSynth AI — Project Handoff

Last updated: 2026-11-08 (UI refinement, dedicated password reset, expanded VFX showcase).

## Stack & run
- Node/Express backend [server.js](server.js), static frontend: `index.html`, `forgot-password.html`, `reset-password.html`, `developer-api.html`, `css/styles.css`, `js/app.js`, `js/video-comparison.js`, `js/generation-engine.js`.
- Auth, profiles and storage: Supabase. Image generation: Cloudflare Workers AI (`@cf/black-forest-labs/flux-2-klein-4b`). Secrets live in `.env` (never commit; see `.env.example`).
- Run: `npm install && node server.js` (default port 3000).

## Completed in this refinement
| Area | State |
|---|---|
| Header | 3-zone 68px header, single-line desktop nav, hamburger below `xl` (1280px), sticky `.is-scrolled` state, active-section underline |
| Guest vs signed-in | Guests see `2 FREE CREDITS FOR NEW ACCOUNTS` + Sign In / Create Account. Signed-in users see `CREDITS: N`, avatar and a dropdown (My Profile, My Generations, Account Settings, Credits, Sign Out) |
| Profile protection | `GET /api/profile` returns 401 for guests. The dashboard workspace and tabs are hidden for guests and their DOM fields are cleared. `/profile` and My Generations clicks prompt sign-in and return to the saved destination (`vidsynth_post_login_redirect`) |
| Password recovery | Modal has Sign In + Create Account only. "Forgot password?" goes to `/forgot-password` (60s resend cooldown). `/reset-password` validates the token via `POST /api/auth/verify-reset-token`, then updates the password via `POST /api/auth/reset-password`. `?auth_action=reset_password` and `#type=recovery` on `/` redirect to `/reset-password` |
| VFX showcase | 3 motion reels + 10 local `.webp` theme cards, 11 working filter pills, "Load Prompt" into Studio, honest `Sample VFX Showcase` badges. Assets are in `assets/showcase/<category>/`, indexed in `assets/showcase/manifest.json` (`curatedVfxThemes`) |
| Motion | Staggered reveal, card hover zoom, filter fade, slider drag lock (`touch-action`), offscreen video pause, `prefers-reduced-motion` honoured |

## Fixes made when resuming (previous run was interrupted)
1. **Route 404:** `/forgot-password`, `/reset-password` and `/profile` returned 404. `res.sendFile` was given an absolute path under the `.gemini` dot-directory, which Express's default dotfile rule rejects. It now uses `sendFile(name, { root: ROOT_DIR })`. Keep the `root` option.
2. **Studio ID mismatch (older bug):** 14 element IDs that `js/app.js` expected did not exist in `index.html`. As a result the demo preview, side-by-side and slider views, aspect-ratio sync, mode label and Replace/Dismiss buttons did nothing. `app.js` now follows the HTML IDs, and the missing handlers were added.
3. **Nav active indicator:** the observer selected a non-existent `data-nav-section` attribute; it now matches `href="#section"`.
4. **CSS gaps:** added `.is-hidden-by-filter` and `.vfx-card-media-wrap` rules, and a default `touch-action: pan-y` on sliders.
5. **Credit wording:** removed leftover `FREE CREDITS: x / y` strings. Signed-in users see `CREDITS: N`.
6. **Encoding incident (self-inflicted, repaired):** a PowerShell 5.1 `Get-Content`/`Set-Content` rewrite of `server.js` corrupted UTF-8 characters and added a BOM. It was reversed losslessly (Windows-1252 → UTF-8), then verified (no BOM, no mojibake, syntax OK). **Do not edit project files with PowerShell 5.1 `Get-Content`/`Set-Content`; use the editor tools or Node.**

## Verification (all passing at handoff)
- API/static QA: markup contract, 42 local media assets (disk + HTTP 200), guest 401, dedicated pages and token verification, real register → profile (2 credits) → delete cycle.
- Real-browser UI test (Chrome via puppeteer-core), 18 checks: guest/auth navbar, desktop/1100px/390px layouts, guest dashboard protection, modal tabs, forgot-link navigation, `/profile` redirect memory, 10 filters, image decode, Studio demo and views, aspect sync, guest generate gating, signed-in state, sign-out clearing. No uncaught JS errors.
- `node --check` passes for `server.js`, `js/app.js` and `js/video-comparison.js`.
- Test scripts (kept outside the repo): `brain/<conversation>/scratch/verify_refinement_qa.js` and `verify_ui_browser.js`. Both create and delete their own temporary accounts.

## Not verified / known limitations
- **Live AI generation with credit deduction and refund** was not re-run this session (it was verified in the earlier task). It needs working Cloudflare credentials.
- **Real password-reset email delivery and the reset-link round trip** were not exercised. They depend on Supabase SMTP and redirect URL settings: `https://vidsynth.app/reset-password` must be in Supabase **Auth → URL Configuration → Redirect URLs**.
- **Google OAuth** needs the Supabase Google provider and redirect URLs configured; not tested here.
- The showcase `.webp` cards are AI-generated samples, labelled as such. Before/After pairs are real photo/video pairs.
- Pages other than `index.html` (pricing, terms, privacy, security, developer-api) were not re-audited for header consistency in this pass.

## Suggested next steps
1. Add `https://vidsynth.app/reset-password` and `http://localhost:3000/reset-password` to Supabase redirect URLs, then do one real reset-email test.
2. Re-run a live generation (text-to-image and image-to-image) on the deployed environment.
3. Apply the new header and `?auth_modal=` conventions to the secondary pages.
4. Consider moving the two verification scripts into `tests/` with an `npm test` script.
