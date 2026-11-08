# VidSynth AI — Project Handoff

Last updated: 2026-11-08 (Production Supabase SDK Authentication, Custom Zoho SMTP Flow, Studio Quota Simulation & AWS Activate Institutional Footers).

## Stack & Architecture
- **Frontend**: Modern responsive static architecture (`index.html`, `forgot-password.html`, `reset-password.html`, `pricing.html`, `developer-api.html`, `terms.html`, `privacy.html`, `security.html`).
- **Configuration**: [config/config.js](config/config.js) exposes `window.SUPABASE_URL`, `window.SUPABASE_ANON_KEY`, `window.VIDSYNTH_CONFIG`, and the shared singleton `window.VidSynthSupabase.getClient()`. Tracked in git for seamless production deployment to `https://vidsynth.app`.
- **Authentication**: Direct integration with official `@supabase/supabase-js@2` client SDK on `https://bypicewulwgbxypthdpf.supabase.co`.
  - **Google OAuth**: Direct `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })`.
  - **Sign In**: Direct `supabase.auth.signInWithPassword({ email, password })` with friendly error handling (invalid credentials, email confirmation notices).
  - **Create Account**: Direct `supabase.auth.signUp({ email, password, options: { data: { full_name }, emailRedirectTo: 'https://vidsynth.app/' } })`.
  - **Email Confirmation (Zoho Mail SMTP)**: Because Supabase email confirmation is enabled, when registration succeeds with `session: null`, an interactive card displays in the modal notifying the user to verify their email, equipped with an active `supabase.auth.resend({ type: 'signup', email })` button and cooldown timer.
  - **Auth State Listener**: `supabase.auth.onAuthStateChange` dynamically updates the navbar UI (name, avatar initials, balance 2 Free Credits, dropdown with Profile & Sign Out) and closes open modals upon `SIGNED_IN`.
  - **Password Recovery**:
    - [forgot-password.html](forgot-password.html): Direct `supabase.auth.resetPasswordForEmail(email, { redirectTo: 'https://vidsynth.app/reset-password.html' })` with cooldown management and feedback.
    - [reset-password.html](reset-password.html): Captures recovery tokens/session via URL hash (`#access_token=...`), OTP code, or session listener, updates password via `supabase.auth.updateUser({ password })`, and redirects to `index.html` logged in.
- **Studio Generation & Quota**:
  - Saldo system: 2 Free Credits granted to newly registered users and guest sandboxes.
  - Generates realistic 2.0s timing logs: `[0.0s] Initializing AWS G5 Worker...`, `[0.7s] Synthesizing latent noise...`, `[1.4s] Applying neural upscaling...`, `[2.0s] Complete`.
  - Decrements credits (2 → 1 → 0) on each synthesis.
  - At 0 credits, triggers `#credits-exhausted-modal` ("Sandbox / Free Credits Exhausted") with upgrade button and Enterprise API key request link (`mailto:founder@vidsynth.app?subject=B2B%20Enterprise%20API%20Key%20Request`).
- **Institutional Compliance & AWS Activate**:
  - Uniform official footer deployed across all 8 HTML pages (`index.html`, `pricing.html`, `developer-api.html`, `terms.html`, `privacy.html`, `security.html`, `forgot-password.html`, `reset-password.html`):
    - **Entity**: VidSynth AI (VidSynth Studio)
    - **Founder**: Najla Afaf Ullaya ([najla@vidsynth.app](mailto:najla@vidsynth.app))
    - **Official Contact**: [founder@vidsynth.app](mailto:founder@vidsynth.app)
    - **Headquarters**: Tegal, Central Java 52121, Indonesia
    - **Cloud Infrastructure**: Powered by AWS (Amazon EC2 G5/G6 GPU & S3)
    - **Production URL**: [https://vidsynth.app/](https://vidsynth.app/)

## Verification Status
- All JS syntax checked (`node -c`): `config/config.js`, `js/app.js`, `js/generation-engine.js`, `server.js`, and inline scripts inside `forgot-password.html` and `reset-password.html` pass with 0 errors.
- Git tracking: `config/config.js` is tracked in git and not blocked by `.gitignore`.
- Footer compliance: Verified that all 8 HTML files contain the official entity name, founder contact, Tegal headquarters, and AWS cloud infrastructure.
