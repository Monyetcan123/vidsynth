/**
 * VIDSYNTH AI — RUNTIME CONFIGURATION (config/config.js)
 * ============================================================================
 * Defines verifiable product metadata, founder contact, and runtime preview state.
 * Security Policy: Never embed private API keys, credentials, or secrets in client JS.
 */

(function initVidSynthConfig() {
  window.VIDSYNTH_CONFIG = {
    APP_NAME: "VidSynth AI",
    PRODUCT_SUITE: "VidSynth Studio — Neural VFX Production Suite",
    APP_VERSION: "0.9.4-preview",
    DOMAIN: "https://vidsynth.app",
    FOUNDER_NAME: "Najla Afaf Ullaya",
    FOUNDER_EMAIL: "founder@vidsynth.app",
    RUNTIME_MODE: "SANDBOX_PREVIEW_MODE"
  };
})();
