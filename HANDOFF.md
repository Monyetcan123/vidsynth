# VidSynth AI — Project Handoff

Last updated: 2026-11-08 (Production Supabase Authentication, Real Cloudflare Workers AI Generation, Guest Guard, Warm Glassmorphism & Cinematic Scroll Motion).

## Stack & Architecture
- **Frontend**: Modern responsive static architecture (`index.html`, `forgot-password.html`, `reset-password.html`, `pricing.html`, `developer-api.html`, `terms.html`, `privacy.html`, `security.html`).
- **Configuration**: [config/config.js](config/config.js) exposes `window.SUPABASE_URL`, `window.SUPABASE_ANON_KEY`, `window.VIDSYNTH_CONFIG`, and the shared singleton `window.VidSynthSupabase.getClient()`. Tracked in git for seamless production deployment to `https://vidsynth.app`.
- **Authentication**: Direct integration with official `@supabase/supabase-js@2` client SDK on `https://bypicewulwgbxypthdpf.supabase.co`.
  - **Google OAuth**: Direct `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })`.
  - **Sign In**: Direct `supabase.auth.signInWithPassword({ email, password })` with friendly error handling.
  - **Create Account**: Direct `supabase.auth.signUp({ email, password, options: { data: { full_name }, emailRedirectTo: 'https://vidsynth.app/' } })`.
  - **Email Confirmation (Zoho Mail SMTP)**: Interactive verification card displays in the modal notifying the user to verify their email, equipped with an active resend button and cooldown timer.
  - **Auth State Listener**: `supabase.auth.onAuthStateChange` dynamically updates the navbar UI (name, avatar initials, balance 2 Free Credits, dropdown with Profile & Sign Out) and closes open modals upon `SIGNED_IN`.
  - **Password Recovery**:
    - [forgot-password.html](forgot-password.html): Direct `supabase.auth.resetPasswordForEmail(email, { redirectTo: 'https://vidsynth.app/reset-password.html' })`.
    - [reset-password.html](reset-password.html): Captures recovery tokens/session via URL hash, OTP code, or session listener, updates password via `supabase.auth.updateUser({ password })`, and redirects to `index.html` logged in.
- **Studio Generation & Real Cloudflare Workers AI**:
  - **Guest Guard**: Guests can prepare prompt, settings, and reference image freely, but cannot execute generation or deduct credits without an account. Execution saves draft to `sessionStorage` (`vidsynth_pending_generation_draft`) and opens auth modal with exact badge/title: "Create your account to receive 2 complimentary credits and start creating." and subtitle: "Sign in or create a free account to execute this generation. Your prepared prompt and reference image will be restored after authentication.".
  - **Draft Restoration**: When guest authenticates, inputs and reference preview are restored into Studio, displaying `#studio-restored-draft-banner` with title "Your creation is ready." and subtitle "Your prompt and reference image have been restored. You can now generate your image.".
  - **Reference Image Validation**: `window.generationEngine.validateReferenceImageFile(file)` verifies MIME types (`image/jpeg`, `image/png`, `image/webp`) and 10MB limit, returning `{ valid: true }` or `{ valid: false, error: 'File format not supported or size exceeds 10MB' }`.
  - **Live Generation**: Authenticated users connect directly to `/api/generate-or-edit` running `@cf/black-forest-labs/flux-2-klein-4b` with server-side atomic credit deduction and automatic failure refund.
  - **Progress Stages**: Professional UI stage updates (`[1/3] Preparing composition...`, `[2/3] Synthesizing neural latent space...`, `[3/3] Finalizing high-resolution rendering...`) without internal cluster infrastructure leaks.
  - **Output Canvas & Download**: Live generated image rendered directly, comparison slider enabled for image edits, and one-click download via `window.generationEngine.downloadImage`.
- **Design System & Motion**:
  - Restrained warm glassmorphism (`.glass-surface-warm`, `.glass-surface-dark`, `.vidsynth-glass-toast`, etc.) with solid `@supports not (backdrop-filter)` fallbacks.
  - Unified cinematic easing `cubic-bezier(0.16, 1, 0.3, 1)` and staggered transitions (`.stagger-1` to `.stagger-6`).
  - Full `prefers-reduced-motion: reduce` compliance.
- **Institutional Compliance**:
  - Uniform official footer deployed across all 8 HTML pages:
    - **Entity**: VidSynth AI (VidSynth Studio)
    - **Founder**: Najla Afaf Ullaya ([najla@vidsynth.app](mailto:najla@vidsynth.app))
    - **Official Contact**: [founder@vidsynth.app](mailto:founder@vidsynth.app)
    - **Headquarters**: Tegal, Central Java 52121, Indonesia
    - **Production URL**: [https://vidsynth.app/](https://vidsynth.app/)

## Verification Status
- All JS syntax checked (`node -c`): `config/config.js`, `js/app.js`, `js/generation-engine.js`, `server.js`, and inline scripts inside `forgot-password.html` and `reset-password.html` pass with 0 errors.
- Git tracking: `config/config.js` is tracked in git and not blocked by `.gitignore`.
- Footer compliance: Verified that all 8 HTML files contain the official entity name, founder contact, Tegal headquarters, and AWS cloud infrastructure.
