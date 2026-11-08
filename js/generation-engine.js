/**
 * VIDSYNTH AI — CLIENT & SHARED GENERATION ENGINE ABSTRACTION (js/generation-engine.js)
 * =====================================================================================
 * Provides a clean, provider-agnostic interface for AI Image Generation and
 * Image-to-Image Editing without exposing internal infrastructure or credentials.
 */

(function initVidSynthGenerationEngine(root) {
  "use strict";

  const ASPECT_RATIO_DIMENSIONS = {
    "1:1": { width: 1024, height: 1024, label: "1:1 — Square (1024 × 1024)" },
    "16:9": { width: 1024, height: 576, label: "16:9 — Cinematic Widescreen (1024 × 576)" },
    "9:16": { width: 576, height: 1024, label: "9:16 — Vertical Frame (576 × 1024)" },
    "4:3": { width: 1024, height: 768, label: "4:3 — Editorial Medium Format (1024 × 768)" },
    "3:4": { width: 768, height: 1024, label: "3:4 — Portrait Frame (768 × 1024)" }
  };

  function getDimensionsForAspectRatio(aspectRatio, customWidth, customHeight) {
    if (customWidth && customHeight) {
      const w = Math.max(256, Math.min(1024, Math.round(Number(customWidth) / 16) * 16));
      const h = Math.max(256, Math.min(1024, Math.round(Number(customHeight) / 16) * 16));
      return { width: w, height: h };
    }
    return ASPECT_RATIO_DIMENSIONS[aspectRatio] || ASPECT_RATIO_DIMENSIONS["1:1"];
  }

  const generationEngine = {
    ASPECT_RATIO_DIMENSIONS,
    getDimensionsForAspectRatio,

    /**
     * Submits a real Text-to-Image or Image-to-Image Editing request to the
     * authenticated VidSynth AI backend (/api/generate-or-edit).
     */
    async generate({
      prompt,
      description = "",
      referenceFile = null,
      referenceImagePath = "",
      stylePreset = "",
      aspectRatio = "1:1",
      width = null,
      height = null,
      guidance = 3.5,
      seed = null,
      requestId = "",
      accessToken = ""
    }) {
      const cleanPrompt = String(prompt || "").trim();
      if (!cleanPrompt || cleanPrompt.length < 3) {
        const err = new Error("Please enter a prompt describing the image or edit you want to create.");
        err.code = "MISSING_PROMPT";
        throw err;
      }

      if (!accessToken) {
        const err = new Error("Authentication is required to generate or edit images.");
        err.code = "AUTH_REQUIRED";
        throw err;
      }

      const dims = getDimensionsForAspectRatio(aspectRatio, width, height);
      const reqId =
        requestId ||
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "req_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10));

      const formData = new FormData();
      formData.append("prompt", cleanPrompt);
      if (description) formData.append("description", String(description).trim());
      if (stylePreset) formData.append("stylePreset", String(stylePreset).trim());
      formData.append("aspectRatio", String(aspectRatio || "1:1"));
      formData.append("width", String(dims.width));
      formData.append("height", String(dims.height));
      if (guidance !== null && guidance !== undefined && guidance !== "") {
        formData.append("guidance", String(guidance));
      }
      if (seed !== null && seed !== undefined && seed !== "") {
        formData.append("seed", String(seed));
      }
      formData.append("requestId", reqId);

      if (referenceFile instanceof Blob) {
        formData.append("image", referenceFile, referenceFile.name || "reference.jpg");
      } else if (referenceImagePath) {
        formData.append("referenceImagePath", referenceImagePath);
      }

      const response = await fetch("/api/generate-or-edit", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + accessToken
        },
        body: formData
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch (_) {
        const parseErr = new Error("Received an unexpected response from the generation server.");
        parseErr.code = "INVALID_SERVER_RESPONSE";
        throw parseErr;
      }

      if (!response.ok) {
        const apiErr = new Error(payload.message || "Image generation request could not be completed.");
        apiErr.code = payload.code || payload.error || "GENERATION_FAILED";
        apiErr.status = response.status;
        apiErr.credits = typeof payload.credits === "number" ? payload.credits : undefined;
        apiErr.refunded = Boolean(payload.refunded);
        throw apiErr;
      }

      return payload;
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = generationEngine;
  }
  root.VidSynthGenerationEngine = generationEngine;
  root.generationEngine = generationEngine;
})(typeof window !== "undefined" ? window : globalThis);
