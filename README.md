# VidSynth AI (`https://vidsynth.app`)

**Product:** VIDSYNTH AI — Visual Production & Neural Synthesis Suite  
**Founder:** Najla Afaf Ullaya (`founder@vidsynth.app`)  
**Design System:** Premium Earth-Tone Creative Studio (`#F4F0E8`, `#E8DFD0`, `#C9BBA5`, `#A58D72`, `#75624E`, `#292720`, `#FAF8F3`) × Higgsfield-Inspired Motion

---

## 1. Architecture & File Structure

```text
vidsynth/
├── server.js                   # Node.js Backend (Static Server, Google Gen AI SDK, Server Quota & Pilot Auth)
├── package.json                # Dependencies (@google/genai, dotenv)
├── .env.example                # Server environment variable template (GOOGLE_API_KEY, SUPABASE_*, etc.)
├── index.html                  # Homepage, Before/After Gallery, Interactive AI Studio & Modals
├── pricing.html                # Early Access Pilot & Enterprise Compute Offerings
├── security.html               # Security Overview, Implemented vs. Planned Controls
├── privacy.html                # Standalone Privacy Policy
├── terms.html                  # Standalone Terms of Service
├── assets/
│   ├── icons/
│   │   └── favicon.svg         # Warm Earth-Tone VidSynth brand mark
│   ├── showcase/
│   │   ├── manifest.json       # Paired Before/After metadata & dimensions
│   │   ├── before/             # Paired original source plates (before1..before5)
│   │   └── after/              # Paired transformed plates (after1..after5)
│   ├── images/                 # Video poster frames (.jpg)
│   └── videos/                 # Frame-synchronized HTML5 reference streams (.webm)
├── css/
│   └── styles.css              # Earth-Tone design system, Before/After sliders, Studio & Motion CSS
├── config/
│   ├── config.example.js       # Public frontend configuration template (zero secrets)
│   └── config.js               # Public runtime constants & model label descriptors
└── js/
    ├── app.js                  # Scroll reveal, Before/After sliders, Studio client, Quota & Supabase OTP
    └── video-comparison.js     # Synchronized dual-video comparator & 6-DoF Director Motion Rig
```

---

## 2. Running the Studio Server

1. Copy `.env.example` to `.env` and configure your credentials:
   ```ini
   PORT=8080
   GOOGLE_API_KEY=your_google_ai_studio_api_key
   GOOGLE_MODEL_VS_CHAR=imagen-3.0-generate-002
   GOOGLE_MODEL_VS_RELIGHT=imagen-3.0-generate-002
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your_public_anon_key
   ENTERPRISE_PILOT_CODE=your_pilot_code
   ```
2. Start the Node.js server:
   ```powershell
   cd C:\Users\LEGION\.gemini\antigravity\scratch\vidsynth
   npm start
   ```
3. Open `http://localhost:8080` in your browser.
