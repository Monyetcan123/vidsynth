/**
 * VIDSYNTH — ENVIRONMENT CONFIGURATION TEMPLATE
 * ============================================================================
 * Copy this file to `config/config.js` and supply your project's public
 * Supabase URL and `anon` (public) key.
 *
 * SECURITY WARNING (MANDATORY):
 * - NEVER embed your Supabase `service_role` secret key in browser JavaScript.
 * - Row Level Security (RLS) MUST be enabled on all PostgreSQL tables.
 * - Configure allowed Redirect URLs in Supabase Dashboard -> Authentication -> URL Configuration:
 *   e.g. https://vidsynth.app/dashboard.html, https://vidsynth.app/login.html
 */

window.VIDSYNTH_CONFIG = {
  APP_NAME: "VidSynth Studio",
  APP_VERSION: "0.9.4-preview",
  DOMAIN: "https://vidsynth.app",
  FOUNDER_EMAIL: "founder@vidsynth.app",

  // Replace empty strings with your Supabase project credentials to enable live cloud auth & database:
  SUPABASE_URL: "https://your-project-ref.supabase.co",
  SUPABASE_ANON_KEY: "your-public-anon-key-here",

  // OAuth Provider Redirect Path
  OAUTH_REDIRECT_PATH: "/dashboard.html",

  // Feature & Pipeline Capability Flags (Honest Environment Reporting)
  CAPABILITIES: {
    LIVE_GPU_CLUSTER_CONNECTED: false, // Set true only when AWS Batch / GPU worker webhook is deployed
    ENABLE_LOCAL_DEMO_FALLBACK: true   // Clearly labeled Sandbox Mode when Supabase keys are unconfigured
  }
};
