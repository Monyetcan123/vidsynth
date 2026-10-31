# VidSynth Studio (`https://vidsynth.app`)

**Positioning:** Professional AI Video Creation, Character Transformation & Visual Production Studio  
**Design Direction:** Cinematic Darkroom × Premium Creative Software × Enterprise SaaS

---

## 1. Architecture & File Structure

```text
vidsynth/
├── index.html                  # Master Platform Landing Experience
├── login.html                  # Sign In, Password Recovery, Reset & Email Verification
├── register.html               # Create Account with 4-Bar Password Strength Meter
├── dashboard.html              # Protected Enterprise Customer Studio Dashboard (10 Views)
├── pricing.html                # Commercial Model, Feature Comparison Matrix & Credit Schedule
├── security.html               # Security Overview, Data Processing, Legal, Docs & Support
├── robots.txt                  # Search engine crawler configuration
├── sitemap.xml                 # XML Sitemap
├── assets/
│   ├── icons/
│   │   └── favicon.svg         # VidSynth precision vector mark
│   ├── images/                 # 18 high-resolution poster frames (.jpg)
│   └── videos/                 # 18 frame-synchronized HTML5 reference streams (.webm)
├── css/
│   └── styles.css              # Midnight Obsidian design tokens, Bento Grid & darkroom UI
├── config/
│   ├── config.example.js       # Template for Supabase URL & public anon key
│   └── config.js               # Runtime environment detector (Supabase Cloud vs. Sandbox Demo)
├── js/
│   ├── app.js                  # Global nav, announcement bar, showcase modals & lead registration
│   ├── video-comparison.js     # Synchronized dual-video A/B comparator, 5 passes & Motion Rig
│   ├── auth.js                 # Supabase Auth + Local Sandbox Auth Provider & route guard
│   └── dashboard.js            # Customer Dashboard CRUD, pass simulation & credit ledger
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql # PostgreSQL tables, triggers, indexes & RLS policies
```

---

## 2. Running Locally

Serve the `vidsynth/` directory over any local HTTP server:

```powershell
cd C:\Users\LEGION\.gemini\antigravity\scratch\vidsynth
python -m http.server 8080
```

Then open `http://localhost:8080/index.html` in Chrome, Edge, or Firefox.

---

## 3. Supabase Configuration & Database Setup

1. Create a new project in [Supabase](https://supabase.com).
2. Open the **SQL Editor** in your Supabase Dashboard and execute the contents of [`supabase/migrations/001_initial_schema.sql`](./supabase/migrations/001_initial_schema.sql). This creates:
   - `public.profiles` (auto-provisioned via trigger on `auth.users`)
   - `public.projects` (with `auth.uid() = user_id` RLS policies)
   - `public.render_jobs` (with `auth.uid() = user_id` RLS policies)
   - `public.credit_ledger` (with `auth.uid() = user_id` RLS policies)
   - `public.early_access_leads` (public `INSERT` with RFC email check and unique constraint; `SELECT` restricted)
3. Connect your frontend either by:
   - Editing `config/config.js` with your `SUPABASE_URL` and public `SUPABASE_ANON_KEY`, or
   - Signing into the Studio Dashboard (`dashboard.html`) → **Settings** → **Supabase Cloud Connection** and saving your URL and `anon` key.
4. **Security Rule:** Never place your Supabase `service_role` secret key in browser JavaScript.

---

## 4. Data Integrity & Feature Status Matrix

| Feature / Subsystem | Status | Implementation Details |
|---|---|---|
| **Interactive Comparison Studio** | **Fully Implemented** | Frame-locked dual HTML5 `<video>` streams (`< 35ms` drift tolerance), pointer/touch/keyboard slider, `-1F/+1F` frame stepping, SMPTE timecode, fullscreen, and 5 switchable conditioning passes. |
| **Director Motion Rig** | **Fully Implemented (Simulated Previews)** | 6 interactive camera trajectory presets with dedicated HTML5 video previews, focal length/velocity telemetry, and SVG solver curves. |
| **Asymmetric Bento Showcase** | **Fully Implemented** | 12-column responsive asymmetric grid with hover playback, modal inspection, and model registry panel. |
| **Authentication & Session Management** | **Dual-Mode (Supabase + Sandbox)** | Connects to `@supabase/supabase-js` when configured; falls back transparently to a labeled Local Sandbox Auth Provider supporting Sign In, Registration, Password Strength, Verification, Expired Token state, and Password Reset. |
| **Customer Studio Dashboard** | **Fully Implemented** | Protected route (`dashboard.html`) with 10 sidebar views, full Project CRUD (Create, Rename, Delete with confirmation), Sandbox Pass Simulation, and auditable Credit Ledger. |
| **Early Access Lead Management** | **Dual-Mode (Supabase + Sandbox)** | Client + storage validation with deterministic duplicate-email detection. |
| **AWS Distributed GPU Rendering** | **Planned / Proposed** | Clearly labeled as `Proposed Infrastructure Architecture` in accordance with data integrity rules. |
