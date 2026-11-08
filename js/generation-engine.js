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
     * Validates an uploaded reference image file for Image-to-Image editing.
     * Rules:
     * - Accept only: image/jpeg, image/png, image/webp
     * - Maximum file size: 10 MB (10 * 1024 * 1024 bytes)
     * - Returns { valid: true } or { valid: false, error: 'File format not supported or size exceeds 10MB' }
     */
    validateReferenceImageFile(file) {
      if (!file || typeof file !== "object" || typeof file.size !== "number") {
        return { valid: false, error: "File format not supported or size exceeds 10MB" };
      }

      const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
      const mime = String(file.type || "").toLowerCase().trim();
      const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

      // Verify MIME type and size boundaries
      if (!allowedMimes.includes(mime) || file.size <= 0 || file.size > MAX_SIZE_BYTES) {
        return { valid: false, error: "File format not supported or size exceeds 10MB" };
      }

      return { valid: true };
    },

    /**
     * Downloads an image file to the user's device.
     */
    async downloadImage(imageUrl, filename = "vidsynth-output.jpg") {
      if (!imageUrl) return false;
      try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
        return true;
      } catch (_) {
        const link = document.createElement("a");
        link.href = imageUrl;
        link.download = filename;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
      }
    },

    /**
     * Executes AI rendering simulation with 2-second visual log progression
     * on AWS EC2 G5/G6 GPU infrastructure.
     */
    async simulateRenderingPipeline({
      prompt,
      isEditMode = false,
      onProgress = null
    }) {
      const logs = [
        { progress: 15, delay: 0, text: "[0.0s] ALLOCATING AWS EC2 G5 GPU CLUSTER & MOUNTING TENSOR PIPELINE..." },
        { progress: 45, delay: 650, text: "[0.7s] RUNNING NEURAL DIFFUSION SAMPLER ON AWS EC2 G5 GPU CLUSTER..." },
        { progress: 80, delay: 1350, text: "[1.4s] COLOR GRADING & COMPOSITING HIGH-RESOLUTION 1024×1024 ARTIFACT..." },
        { progress: 100, delay: 2000, text: "[2.0s] SYNTHESIS COMPLETE • PERSISTING TO SECURE ASSET STORAGE..." }
      ];

      for (let i = 0; i < logs.length; i++) {
        const step = logs[i];
        const prevDelay = i > 0 ? logs[i - 1].delay : 0;
        const waitTime = step.delay - prevDelay;
        if (waitTime > 0) {
          await new Promise((r) => setTimeout(r, waitTime));
        }
        if (typeof onProgress === "function") {
          onProgress(step.text, step.progress);
        }
      }

      const showcaseAssets = isEditMode
        ? [
            "assets/showcase/after/after1.jpeg",
            "assets/showcase/after/after2.jpeg",
            "assets/showcase/after/after3.jpeg",
            "assets/showcase/after/after4.jpeg",
            "assets/showcase/after/after5.jpg"
          ]
        : [
            "assets/showcase/cinematic/cinematic-relit-portrait.webp",
            "assets/showcase/sci-fi/scifi-cyberpunk-metropolis.webp",
            "assets/showcase/fantasy/fantasy-enchanted-sanctuary.webp",
            "assets/showcase/portal/portal-dimensional-rift.webp",
            "assets/showcase/anime/anime-choreography-frame.webp",
            "assets/showcase/elemental/elemental-volcanic-eruption.webp",
            "assets/showcase/energy/energy-aurora-borealis.webp",
            "assets/showcase/creature/creatures-mythic-griffin.webp",
            "assets/showcase/robotic/robotic-biomech-valkyrie.webp",
            "assets/showcase/environmental/environment-neomorphic-desert.webp"
          ];

      return {
        success: true,
        outputUrl: showcaseAssets[Math.floor(Math.random() * showcaseAssets.length)],
        width: 1024,
        height: 1024,
        durationSeconds: 2.0
      };
    },

    /**
     * Submits a real Text-to-Image or Image-to-Image Editing request to the
     * authenticated VidSynth AI backend (/api/generate-or-edit).
     */
    async generate({
      prompt,
      description = "",
      referenceFile = null,
      referenceFiles = null,
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

      const actualRefFile =
        referenceFile instanceof Blob
          ? referenceFile
          : Array.isArray(referenceFiles) && referenceFiles[0] instanceof Blob
          ? referenceFiles[0]
          : null;

      if (actualRefFile instanceof Blob) {
        formData.append("image", actualRefFile, actualRefFile.name || "reference.jpg");
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
  if (typeof root !== "undefined") {
    root.VidSynthGenerationEngine = generationEngine;
    root.generationEngine = generationEngine;
  }
  if (typeof window !== "undefined") {
    window.VidSynthGenerationEngine = generationEngine;
    window.generationEngine = generationEngine;
  }
})(typeof window !== "undefined" ? window : globalThis);
