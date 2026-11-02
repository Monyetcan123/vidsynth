# VidSynth AI (`https://vidsynth.app`)

**Product:** VidSynth Studio — Neural VFX Production Suite  
**Founder:** Najla Afaf Ullaya (`founder@vidsynth.app`)  
**Positioning:** Professional AI Video Creation, Character Transformation & Visual Production Studio  
**Design Direction:** Cinematic Darkroom × Premium Creative Software × Enterprise SaaS

---

## 1. Architecture & File Structure

```text
vidsynth/
├── index.html                  # Master Platform Landing Experience & Interactive R&D Sandbox
├── pricing.html                # Early Access Pilot & Enterprise Compute Offerings
├── security.html               # Security Overview, Implemented vs. Planned Controls & Disclosure
├── privacy.html                # Standalone Privacy Policy (Browser vs. Cloud Processing)
├── terms.html                  # Standalone Terms of Service (Closed Beta & Asset Ownership)
├── CNAME                       # Custom domain configuration (vidsynth.app)
├── robots.txt                  # Search engine crawler configuration
├── sitemap.xml                 # XML Sitemap (index, pricing, security, privacy, terms)
├── assets/
│   ├── icons/
│   │   └── favicon.svg         # VidSynth precision vector mark
│   ├── images/                 # 18 high-resolution poster frames (.jpg)
│   └── videos/                 # 18 frame-synchronized HTML5 reference streams (.webm)
├── css/
│   └── styles.css              # Midnight Obsidian design tokens, Bento Grid & darkroom UI
├── config/
│   ├── config.example.js       # Template configuration file (zero secrets)
│   └── config.js               # Runtime environment & institutional contact metadata
├── js/
│   ├── app.js                  # Global navigation, mobile drawer, showcase modals & mailto composer
│   └── video-comparison.js     # Synchronized dual-video A/B comparator, 5 passes & Motion Rig
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql # Reference PostgreSQL schema for planned cloud backend
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

## 3. Data Integrity & Feature Status Matrix

| Feature / Subsystem | Status | Implementation Details |
|---|---|---|
| **Interactive Comparison Studio** | **Implemented (Browser Sandbox)** | Frame-locked dual HTML5 `<video>` streams (`< 35ms` drift tolerance), pointer/touch/keyboard slider, `-1F/+1F` frame stepping, SMPTE timecode, fullscreen, and 5 switchable conditioning passes (`#comparison-studio`). |
| **Director Motion Rig** | **Implemented (Pre-Rendered Previews)** | 6 interactive camera trajectory presets with dedicated HTML5 video previews, focal length/velocity telemetry, and SVG solver curves (`#motion-rig`). |
| **Asymmetric Bento Showcase** | **Implemented (Browser Sandbox)** | 12-column responsive asymmetric grid with hover playback, modal inspection, and model registry panel (`#bento-showcase`). |
| **Early Access & Institutional Intake** | **Implemented (`mailto:` Dispatch)** | Direct `mailto:founder@vidsynth.app` links and structured email body composer; zero fake forms or unbacked authentication screens. |
| **Legal & Security Documentation** | **Implemented** | Dedicated `privacy.html`, `terms.html`, and `security.html` accurately distinguishing browser-side sandbox execution from planned cloud compute. |
| **Cloud GPU Rendering & Multi-Tenant Auth** | **Planned Architecture** | Explicitly labeled as `Planned Architecture` / `Target Architecture` across `index.html`, `pricing.html`, and `security.html`. |
