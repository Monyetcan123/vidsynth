/**
 * VIDSYNTH AI — CENTRALIZED SUPABASE & APPLICATION CONFIGURATION (config/config.js)
 * =================================================================================
 * Security Rules:
 * - Only SUPABASE_URL and SUPABASE_ANON_KEY (Publishable Key) are permitted here.
 * - NEVER place SUPABASE_SECRET_KEY or any generation engine secret key in frontend code.
 * - All privileged operations, credit deductions, and generation workflows run via server.js.
 * - Maintains a single shared Supabase JS client instance across the entire application.
 * =================================================================================
 */

// FIELD 01 — SUPABASE PROJECT URL
const SUPABASE_URL = "https://bypicewulwgbxypthdpf.supabase.co";

// FIELD 02 — SUPABASE PUBLISHABLE / ANON KEY
const SUPABASE_ANON_KEY = "sb_publishable_tynIxLMhw_kQJU1-9MsRMw_F07kmcfK";

if (typeof window !== "undefined") {
  window.SUPABASE_URL = SUPABASE_URL;
  window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
}

(function initVidSynthConfig() {
  function isSupabaseConfigValid() {
    return (
      typeof SUPABASE_URL === "string" &&
      SUPABASE_URL.trim().startsWith("https://") &&
      SUPABASE_URL.includes(".supabase.co") &&
      typeof SUPABASE_ANON_KEY === "string" &&
      SUPABASE_ANON_KEY.trim().length > 16
    );
  }

  let singletonSupabaseClient = null;

  function getSupabaseClient() {
    if (singletonSupabaseClient) return singletonSupabaseClient;
    if (!isSupabaseConfigValid()) {
      return null;
    }
    if (window.supabase && typeof window.supabase.createClient === "function") {
      singletonSupabaseClient = window.supabase.createClient(
        SUPABASE_URL.trim(),
        SUPABASE_ANON_KEY.trim(),
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: "vidsynth_ai_supabase_auth"
          }
        }
      );
      return singletonSupabaseClient;
    }
    return null;
  }

  window.VIDSYNTH_CONFIG = Object.freeze({
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    APP_NAME: "Vidsynth AI",
    BRAND_UPPER: "VIDSYNTH AI",
    TAGLINE: "Transform What You Imagine.",
    DOMAIN: "https://vidsynth.app",
    FOUNDER_NAME: "Najla Afaf Ullaya",
    FOUNDER_EMAIL: "founder@vidsynth.app",
    HEADQUARTERS: "Tegal, Central Java 52121, Indonesia",
    CLOUD_INFRASTRUCTURE: "Powered by AWS (Amazon EC2 G5/G6 GPU & S3)",
    DEFAULT_SANDBOX_CREDITS: 2,
    SUPABASE_CONFIGURED: isSupabaseConfigValid(),
    BUCKETS: Object.freeze({
      AVATARS: "avatars",
      INPUTS: "generation-inputs",
      OUTPUTS: "generation-outputs"
    }),
    PIPELINES: Object.freeze({
      "VS-CHAR-2.4": {
        id: "VS-CHAR-2.4",
        label: "Character & Concept Synthesis",
        workflow: "Vidsynth AI Creative Workflow"
      },
      "VS-RELIGHT-1.2": {
        id: "VS-RELIGHT-1.2",
        label: "Environment & Relighting Synthesis",
        workflow: "Vidsynth AI Visual Processing"
      },
      "VS-MOTION-3.0": {
        id: "VS-MOTION-3.0",
        label: "Temporal Style & Structure Lock",
        workflow: "Vidsynth AI Generation Pipeline"
      }
    })
  });

  window.VidSynthSupabase = Object.freeze({
    isConfigured: isSupabaseConfigValid,
    getClient: getSupabaseClient
  });
})();
