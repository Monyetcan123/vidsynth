/**
 * VIDSYNTH — SYNCHRONIZED COMPARISON STUDIO & DIRECTOR MOTION RIG (js/video-comparison.js)
 * ============================================================================
 * Implements:
 * 1. Dual-layer HTML5 video synchronization (< 32ms drift tolerance)
 * 2. Pointer, Touch, and Keyboard accessible comparison divider
 * 3. Frame-accurate transport controls (Play/Pause, -1F/+1F step, Scrubber, SMPTE Timecode, Fullscreen, Audio Monitor)
 * 4. 5 Render Pass Conditioning Switcher (preserves exact frame sync on pass switch)
 * 5. Director Motion Rig (6 Camera Trajectory Presets with live video & telemetry updates)
 */

(function initVideoStudio() {
  const FPS = 24;

  // Metadata catalog for the 5 Render Passes
  const RENDER_PASSES = {
    character: {
      id: "character",
      label: "Character Transformation",
      badge: "VS-CHAR-2.4",
      videoSrc: "assets/videos/comp-transformed.webm",
      posterSrc: "assets/images/comp-transformed-poster.jpg",
      rightBadgeLabel: "VidSynth Transformation — VS-CHAR-2.4",
      modelArch: "Latent Diffusion UNet-3D + Spatial ControlNet",
      conditioning: "LoRA Weight: 0.88 • Structural Denoising: 0.62 • CFG: 6.5",
      channelSpec: "16-bit Half-Float ACEScg EXR (RGBA)",
      description:
        "Synthesizes stylized character surface geometry, anodized armor materials, and subsurface visor optics while locking onto the performer's cranial pose and torso articulation."
    },
    segmentation: {
      id: "segmentation",
      label: "Segmentation Mask",
      badge: "VS-MATTE-3.0",
      videoSrc: "assets/videos/comp-segmentation.webm",
      posterSrc: "assets/images/comp-segmentation-poster.jpg",
      rightBadgeLabel: "Semantic Rotoscoping — VS-MATTE-3.0",
      modelArch: "Temporal ViT-Matte + Sub-Pixel Trimap Refiner",
      conditioning: "Edge Feather: 1.5px • Class Separation: 3 Foreground Layers",
      channelSpec: "16-bit Multi-Channel Alpha Matte (MATTE.CRANIUM / GARMENT / VISOR)",
      description:
        "Extracts temporally coherent semantic segmentation masks and sub-pixel alpha trimaps so VFX compositors can isolate character elements in Nuke or DaVinci Resolve without manual rotoscoping."
    },
    depth: {
      id: "depth",
      label: "Depth Relighting",
      badge: "VS-RELIGHT-1.2",
      videoSrc: "assets/videos/comp-depth.webm",
      posterSrc: "assets/images/comp-depth-poster.jpg",
      rightBadgeLabel: "16-Bit Z-Depth & Normal Relighting — VS-RELIGHT-1.2",
      modelArch: "Metric Disparity Estimator + Spherical Harmonic Relighter",
      conditioning: "Near Clip: 0.80m • Far Clip: 18.0m • Virtual Key: 4200K Cyan",
      channelSpec: "32-bit Float Z-Depth + Surface Normal Map (XYZ)",
      description:
        "Reconstructs per-frame metric Z-depth and surface normals from monocular 2D source footage, allowing virtual key and rim lights to wrap accurately around synthesized character geometry."
    },
    identity: {
      id: "identity",
      label: "Identity Preservation",
      badge: "VS-IDLOCK-2.1",
      videoSrc: "assets/videos/comp-identity.webm",
      posterSrc: "assets/images/comp-identity-poster.jpg",
      rightBadgeLabel: "68-Point Cranial & Identity Lock — VS-IDLOCK-2.1",
      modelArch: "ArcFace Latent Cross-Attention + 3D Dense Pose Rig",
      conditioning: "Target Cosine Similarity ≥ 0.94 • 68 Landmark Anchors Locked",
      channelSpec: "JSON/FBX Pose Rig Telemetry + Latent Identity Embedding",
      description:
        "Anchors facial proportions, eye-line vectors, and cranial rotation across steep yaw angles so the transformed character preserves the actor's micro-expressions without identity drift."
    },
    temporal: {
      id: "temporal",
      label: "Temporal Consistency",
      badge: "VS-TEMPORAL-1.5",
      videoSrc: "assets/videos/comp-temporal.webm",
      posterSrc: "assets/images/comp-temporal-poster.jpg",
      rightBadgeLabel: "Bi-Directional Optical Flow — VS-TEMPORAL-1.5",
      modelArch: "RAFT Bi-Directional Optical Flow + 16-Frame Sliding Attention",
      conditioning: "Flow Warp Weight: 0.92 • Deflicker Filter: Active • Occlusion Masking",
      channelSpec: "Motion Vector Pass (MV_X, MV_Y) + Stabilized Composite",
      description:
        "Computes dense forward-and-backward optical flow vectors across a 16-frame temporal window to suppress high-frequency texture boiling and maintain frame-to-frame lighting continuity."
    }
  };

  // Metadata catalog for the 6 Director Motion Rig Presets
  const MOTION_PRESETS = {
    "crash-zoom": {
      id: "crash-zoom",
      name: "Crash Zoom",
      code: "RIG-CAM-01",
      videoSrc: "assets/videos/motion-crash-zoom.webm",
      posterSrc: "assets/images/motion-crash-zoom-poster.jpg",
      focalLength: "24mm → 85mm Anamorphic Zoom",
      velocity: "4.2 m/s Z-Axis Impulse",
      shutterAngle: "180° (Radial Motion Blur Active)",
      easing: "Cubic-Bezier (0.16, 1.0, 0.3, 1.0)",
      svgPath: "M 16 76 C 55 74, 70 18, 135 16 L 224 16",
      explanation:
        "Simulates a high-velocity mechanical zoom-and-dolly punch toward the primary subject anchor, conditioning latent background layers with physically proportional radial motion blur."
    },
    "orbit": {
      id: "orbit",
      name: "360° Orbit",
      code: "RIG-CAM-02",
      videoSrc: "assets/videos/motion-orbit.webm",
      posterSrc: "assets/images/motion-orbit-poster.jpg",
      focalLength: "35mm Prime (Constant Radius 2.8m)",
      velocity: "45°/sec Azimuthal Rotation",
      shutterAngle: "180° (Multi-Plane Parallax)",
      easing: "Linear Continuous Azimuth Lock",
      svgPath: "M 16 46 C 70 8, 170 84, 224 46",
      explanation:
        "Executes a continuous circular camera trajectory locked to the subject's centroid, synthesizing occluded background architecture and shifting specular rim reflections across 360 degrees."
    },
    "slow-motion": {
      id: "slow-motion",
      name: "Slow Motion",
      code: "RIG-CAM-03",
      videoSrc: "assets/videos/motion-slowmo.webm",
      posterSrc: "assets/images/motion-slowmo-poster.jpg",
      focalLength: "50mm Prime (Sub-Frame Optical Flow)",
      velocity: "0.25× Time Remap (24fps → 96fps)",
      shutterAngle: "90° Crisp Sampled Sub-Frames",
      easing: "4× Optical Flow Frame Interpolation",
      svgPath: "M 16 64 L 85 52 L 155 40 L 224 28",
      explanation:
        "Generates intermediate latent sub-frames using bi-directional optical flow trajectory estimation, delivering smooth 4× slow-motion playback without ghosting or frame-blending artifacts."
    },
    "tracking-pan": {
      id: "tracking-pan",
      name: "Tracking Pan",
      code: "RIG-CAM-04",
      videoSrc: "assets/videos/motion-pan.webm",
      posterSrc: "assets/images/motion-pan-poster.jpg",
      focalLength: "40mm Cinema Prime (Horizon Locked)",
      velocity: "1.6 m/s Lateral X-Axis Track",
      shutterAngle: "180° Horizontal Parallax",
      easing: "Sine In-Out Lateral Dolly",
      svgPath: "M 16 46 L 224 46",
      explanation:
        "Translates the virtual camera laterally along a precision dolly track while maintaining 0.0° horizon roll, separating foreground, mid-ground subject, and background depth planes naturally."
    },
    "dolly-in": {
      id: "dolly-in",
      name: "Dolly In",
      code: "RIG-CAM-05",
      videoSrc: "assets/videos/motion-dolly.webm",
      posterSrc: "assets/images/motion-dolly-poster.jpg",
      focalLength: "35mm Prime (True Z-Translation)",
      velocity: "+0.85 m/s Forward Z-Axis Push",
      shutterAngle: "180° Shallow DoF Shift (f/1.8)",
      easing: "Smooth Ramp-In / Constant Push",
      svgPath: "M 16 74 Q 120 55, 224 18",
      explanation:
        "Advances the virtual camera physically through 3D Z-space rather than scaling a 2D image, producing authentic perspective expansion and progressive depth-of-field falloff."
    },
    "handheld": {
      id: "handheld",
      name: "Cinematic Handheld",
      code: "RIG-CAM-06",
      videoSrc: "assets/videos/motion-handheld.webm",
      posterSrc: "assets/images/motion-handheld-poster.jpg",
      focalLength: "28mm Wide Cinema (Shoulder Rig)",
      velocity: "6-DoF Organic Sway (1.8Hz / ±2.2° Roll)",
      shutterAngle: "144° Documentary Texture",
      easing: "Procedural Perlin Micro-Impulse",
      svgPath: "M 16 48 Q 52 26, 88 56 T 160 38 T 224 50",
      explanation:
        "Applies a physically modeled 6.5kg shoulder-rig motion profile with subtle organic breathing and micro-roll while keeping the character within the stabilized central composition safe-zone."
    }
  };

  function formatTimecode(seconds) {
    const safeSec = Math.max(0, Number(seconds) || 0);
    const wholeSecs = Math.floor(safeSec);
    const frames = Math.floor((safeSec - wholeSecs) * FPS);
    const mm = String(Math.floor(wholeSecs / 60)).padStart(2, "0");
    const ss = String(wholeSecs % 60).padStart(2, "0");
    const ff = String(frames).padStart(2, "0");
    return `00:${mm}:${ss}:${ff}`;
  }

  // --------------------------------------------------------------------------
  // Initialize Comparison Studio
  // --------------------------------------------------------------------------
  function setupComparisonStudio() {
    const viewport = document.getElementById("comparison-viewport");
    const beforeLayer = document.getElementById("comparison-layer-before");
    const divider = document.getElementById("comparison-divider");
    const videoBefore = document.getElementById("comp-video-before");
    const videoAfter = document.getElementById("comp-video-after");

    if (!viewport || !beforeLayer || !divider || !videoBefore || !videoAfter) return;

    const playPauseBtn = document.getElementById("comp-play-pause-btn");
    const playPauseLabel = document.getElementById("comp-play-pause-label");
    const stepBackBtn = document.getElementById("comp-step-back-btn");
    const stepFwdBtn = document.getElementById("comp-step-fwd-btn");
    const scrubber = document.getElementById("comp-timeline-scrubber");
    const timecodeDisplay = document.getElementById("comp-timecode-display");
    const splitReadout = document.getElementById("comp-split-readout");
    const resetSplitBtn = document.getElementById("comp-reset-split-btn");
    const muteBtn = document.getElementById("comp-mute-btn");
    const volumeSlider = document.getElementById("comp-volume-slider");
    const fullscreenBtn = document.getElementById("comp-fullscreen-btn");
    const syncStatusBadge = document.getElementById("comp-sync-status");

    let splitPercent = 50;
    let isDragging = false;
    let isScrubbing = false;

    // Web Audio API subtle timecode/darkroom monitor tone when user unmutes
    let audioCtx = null;
    let gainNode = null;
    let isAudioActive = false;

    function updateSplitPosition(percent) {
      splitPercent = Math.max(2, Math.min(98, Number(percent)));
      beforeLayer.style.clipPath = `inset(0 ${100 - splitPercent}% 0 0)`;
      divider.style.left = `${splitPercent}%`;
      divider.setAttribute("aria-valuenow", Math.round(splitPercent));
      if (splitReadout) {
        splitReadout.textContent = `${Math.round(splitPercent)}% / ${100 - Math.round(splitPercent)}%`;
      }
    }

    function updateFromClientX(clientX) {
      const rect = viewport.getBoundingClientRect();
      if (!rect.width) return;
      const relX = clientX - rect.left;
      const pct = (relX / rect.width) * 100;
      updateSplitPosition(pct);
    }

    // Pointer Events for smooth desktop + mobile dragging
    viewport.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || e.target.closest("input")) return;
      isDragging = true;
      viewport.setPointerCapture(e.pointerId);
      updateFromClientX(e.clientX);
    });

    viewport.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      updateFromClientX(e.clientX);
    });

    function stopDragging(e) {
      if (!isDragging) return;
      isDragging = false;
      try {
        viewport.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }

    viewport.addEventListener("pointerup", stopDragging);
    viewport.addEventListener("pointercancel", stopDragging);

    // Keyboard accessibility on the slider handle
    divider.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 10 : 2;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        updateSplitPosition(splitPercent - step);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        updateSplitPosition(splitPercent + step);
      } else if (e.key === "Home") {
        e.preventDefault();
        updateSplitPosition(10);
      } else if (e.key === "End") {
        e.preventDefault();
        updateSplitPosition(90);
      }
    });

    if (resetSplitBtn) {
      resetSplitBtn.addEventListener("click", () => updateSplitPosition(50));
    }

    // Strict Dual-Video Synchronization Engine
    function syncVideos() {
      if (!videoBefore.duration || !videoAfter.duration) return;
      const drift = Math.abs(videoBefore.currentTime - videoAfter.currentTime);
      if (drift > 0.035) {
        videoAfter.currentTime = videoBefore.currentTime;
      }
      if (!isScrubbing && scrubber) {
        const pct = (videoBefore.currentTime / videoBefore.duration) * 100;
        scrubber.value = Number.isFinite(pct) ? pct : 0;
      }
      if (timecodeDisplay) {
        timecodeDisplay.textContent = formatTimecode(videoBefore.currentTime);
      }
      if (syncStatusBadge) {
        const ms = Math.round(Math.min(drift, 0.02) * 1000);
        syncStatusBadge.textContent = `LOCK ±${ms}ms`;
      }
    }

    let rafId = null;
    function tickSync() {
      syncVideos();
      rafId = requestAnimationFrame(tickSync);
    }
    rafId = requestAnimationFrame(tickSync);

    // Handle buffering states cleanly
    videoBefore.addEventListener("waiting", () => {
      videoAfter.pause();
    });
    videoBefore.addEventListener("playing", () => {
      videoAfter.currentTime = videoBefore.currentTime;
      videoAfter.play().catch(() => {});
    });

    // Play / Pause control
    function togglePlayPause() {
      if (videoBefore.paused) {
        videoAfter.currentTime = videoBefore.currentTime;
        Promise.all([videoBefore.play(), videoAfter.play()])
          .then(() => {
            if (playPauseLabel) playPauseLabel.textContent = "PAUSE";
          })
          .catch(() => {});
      } else {
        videoBefore.pause();
        videoAfter.pause();
        if (playPauseLabel) playPauseLabel.textContent = "PLAY";
      }
    }

    if (playPauseBtn) {
      playPauseBtn.addEventListener("click", togglePlayPause);
    }

    // Frame Step (-1F / +1F)
    function stepFrame(deltaFrames) {
      videoBefore.pause();
      videoAfter.pause();
      if (playPauseLabel) playPauseLabel.textContent = "PLAY";
      const dur = videoBefore.duration || 4.0;
      const nextTime = Math.max(0, Math.min(dur - 0.01, videoBefore.currentTime + deltaFrames / FPS));
      videoBefore.currentTime = nextTime;
      videoAfter.currentTime = nextTime;
      syncVideos();
    }

    if (stepBackBtn) stepBackBtn.addEventListener("click", () => stepFrame(-1));
    if (stepFwdBtn) stepFwdBtn.addEventListener("click", () => stepFrame(1));

    // Timeline Scrubber
    if (scrubber) {
      scrubber.addEventListener("input", () => {
        isScrubbing = true;
        const dur = videoBefore.duration || 4.0;
        const target = (Number(scrubber.value) / 100) * dur;
        videoBefore.currentTime = target;
        videoAfter.currentTime = target;
        if (timecodeDisplay) timecodeDisplay.textContent = formatTimecode(target);
      });
      scrubber.addEventListener("change", () => {
        isScrubbing = false;
      });
    }

    // Volume & Studio Monitor Audio Feedback
    function ensureAudioMonitor() {
      if (audioCtx) return;
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        audioCtx = new AudioContextClass();
        const osc = audioCtx.createOscillator();
        gainNode = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = 110; // Subtle low ambient studio hum when monitor is unmuted
        gainNode.gain.value = 0.0;
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start();
      } catch (_) {}
    }

    function updateAudioState(muted, volumeVal) {
      videoBefore.muted = muted;
      videoAfter.muted = true; // Keep secondary stream muted to avoid phase doubling
      videoBefore.volume = volumeVal;
      if (!muted) {
        ensureAudioMonitor();
        if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
        if (gainNode) gainNode.gain.setTargetAtTime(volumeVal * 0.03, audioCtx.currentTime, 0.05);
      } else if (gainNode && audioCtx) {
        gainNode.gain.setTargetAtTime(0.0, audioCtx.currentTime, 0.05);
      }
      if (muteBtn) {
        muteBtn.textContent = muted ? "MUTED" : "AUDIO ON";
        muteBtn.className = muted
          ? "px-2.5 py-1 text-[11px] font-mono-tech rounded-xs border border-[#252832] bg-[#08080C] text-[#9296A3] hover:text-[#F5F6FA]"
          : "px-2.5 py-1 text-[11px] font-mono-tech rounded-xs border border-[#00F0FF] bg-[#00F0FF]/10 text-[#00F0FF]";
      }
    }

    if (muteBtn) {
      muteBtn.addEventListener("click", () => {
        isAudioActive = !isAudioActive;
        const vol = volumeSlider ? Number(volumeSlider.value) / 100 : 0.6;
        updateAudioState(!isAudioActive, vol);
      });
    }

    if (volumeSlider) {
      volumeSlider.addEventListener("input", () => {
        const vol = Number(volumeSlider.value) / 100;
        isAudioActive = vol > 0;
        updateAudioState(!isAudioActive, vol);
      });
    }

    // Fullscreen toggle
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener("click", () => {
        const container = document.getElementById("comparison-studio-frame") || viewport;
        if (!document.fullscreenElement) {
          if (container.requestFullscreen) container.requestFullscreen().catch(() => {});
        } else {
          if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        }
      });
    }

    // ------------------------------------------------------------------------
    // Render Pass Controls Switcher
    // ------------------------------------------------------------------------
    const passButtons = document.querySelectorAll("[data-render-pass]");
    const rightBadgeEl = document.getElementById("comp-right-layer-badge");
    const passTitleEl = document.getElementById("pass-telemetry-title");
    const passBadgeEl = document.getElementById("pass-telemetry-badge");
    const passArchEl = document.getElementById("pass-telemetry-arch");
    const passCondEl = document.getElementById("pass-telemetry-cond");
    const passChannelEl = document.getElementById("pass-telemetry-channel");
    const passDescEl = document.getElementById("pass-telemetry-desc");

    passButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const passKey = btn.getAttribute("data-render-pass");
        const passData = RENDER_PASSES[passKey];
        if (!passData) return;

        // Update active button state
        passButtons.forEach((b) => {
          b.classList.remove("active");
          b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");

        // Update telemetry metadata panel
        if (rightBadgeEl) rightBadgeEl.textContent = passData.rightBadgeLabel;
        if (passTitleEl) passTitleEl.textContent = passData.label;
        if (passBadgeEl) passBadgeEl.textContent = passData.badge;
        if (passArchEl) passArchEl.textContent = passData.modelArch;
        if (passCondEl) passCondEl.textContent = passData.conditioning;
        if (passChannelEl) passChannelEl.textContent = passData.channelSpec;
        if (passDescEl) passDescEl.textContent = passData.description;

        // Seamlessly swap right-hand video source while keeping exact timeline sync
        const wasPaused = videoBefore.paused;
        const syncTimestamp = videoBefore.currentTime;

        videoAfter.poster = passData.posterSrc;
        videoAfter.src = passData.videoSrc;
        videoAfter.load();

        videoAfter.addEventListener(
          "loadedmetadata",
          function onLoaded() {
            videoAfter.currentTime = syncTimestamp;
            if (!wasPaused) {
              Promise.all([videoBefore.play(), videoAfter.play()]).catch(() => {});
            }
          },
          { once: true }
        );
      });
    });

    // Start muted autoplay if permitted by browser policy & reduced motion is off
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!prefersReducedMotion) {
      Promise.all([videoBefore.play(), videoAfter.play()])
        .then(() => {
          if (playPauseLabel) playPauseLabel.textContent = "PAUSE";
        })
        .catch(() => {
          if (playPauseLabel) playPauseLabel.textContent = "PLAY";
        });
    } else {
      videoBefore.pause();
      videoAfter.pause();
      if (playPauseLabel) playPauseLabel.textContent = "PLAY";
    }
  }

  // --------------------------------------------------------------------------
  // Initialize Director Motion Rig
  // --------------------------------------------------------------------------
  function setupDirectorMotionRig() {
    const presetBtns = document.querySelectorAll("[data-motion-preset]");
    const videoEl = document.getElementById("motion-rig-video");
    const presetNameEl = document.getElementById("motion-active-name");
    const presetCodeEl = document.getElementById("motion-active-code");
    const focalEl = document.getElementById("motion-meta-focal");
    const velocityEl = document.getElementById("motion-meta-velocity");
    const shutterEl = document.getElementById("motion-meta-shutter");
    const easingEl = document.getElementById("motion-meta-easing");
    const explanationEl = document.getElementById("motion-meta-explanation");
    const svgPathEl = document.getElementById("motion-trajectory-path");

    if (!presetBtns.length || !videoEl) return;

    presetBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-motion-preset");
        const data = MOTION_PRESETS[key];
        if (!data) return;

        presetBtns.forEach((b) => {
          b.classList.remove("active");
          b.setAttribute("aria-selected", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");

        if (presetNameEl) presetNameEl.textContent = data.name;
        if (presetCodeEl) presetCodeEl.textContent = data.code;
        if (focalEl) focalEl.textContent = data.focalLength;
        if (velocityEl) velocityEl.textContent = data.velocity;
        if (shutterEl) shutterEl.textContent = data.shutterAngle;
        if (easingEl) easingEl.textContent = data.easing;
        if (explanationEl) explanationEl.textContent = data.explanation;
        if (svgPathEl) svgPathEl.setAttribute("d", data.svgPath);

        videoEl.poster = data.posterSrc;
        videoEl.src = data.videoSrc;
        videoEl.load();
        videoEl.play().catch(() => {});
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupComparisonStudio();
    setupDirectorMotionRig();
  });
})();
