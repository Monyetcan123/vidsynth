/**
 * VIDSYNTH AI — SYNCHRONIZED BEFORE & AFTER VIDEO COMPARISON ENGINE (js/video-comparison.js)
 * ==========================================================================================
 * Powers Section 4: "From Original Footage to AI Transformation"
 *
 * Authentic Video Pairs:
 * - PAIR 01 — HUMAN TO ANIME:
 *     Before: assets/showcase/videos/vidio before1.mp4
 *     After:  assets/showcase/videos/vidio after1.mp4
 * - PAIR 02 — LION TO ROBOT:
 *     Before: assets/showcase/videos/vidio before2.mp4
 *     After:  assets/showcase/videos/vidio after2.mp4
 *
 * Features:
 * 1. Dual-layer HTML5 video synchronization (< 35ms drift tolerance)
 * 2. Interactive draggable comparison slider (Pointer, Touch, Keyboard + Quick Split buttons)
 * 3. Play / Pause control, Mute / Unmute control, -1F/+1F frame step, Scrubber, SMPTE Timecode, Fullscreen
 * 4. Smooth fade & scale transition when switching between PAIR 01 and PAIR 02
 * 5. Natural hover video preview for Featured Transformation Showcase cards
 */

(function initVidsynthVideoComparison() {
  const FPS = 24;

  const VIDEO_PAIRS = {
    "human-to-anime": {
      id: "human-to-anime",
      code: "PAIR 01 — HUMAN TO ANIME",
      title: "Human Performance to Anime Synthesis",
      category: "Character Style Transfer",
      beforeSrc: "assets/showcase/videos/vidio before1.mp4",
      afterSrc: "assets/showcase/videos/vidio after1.mp4",
      beforePoster: "assets/showcase/videos/human-to-anime-before-poster.jpg",
      afterPoster: "assets/showcase/videos/human-to-anime-after-poster.jpg",
      beforeLabel: "BEFORE // ORIGINAL FOOTAGE",
      afterLabel: "AFTER // ANIME TRANSFORMATION",
      specs: "9:16 VERTICAL • 720×1280 • 15.0S SYNCHRONIZED",
      pipeline: "Vidsynth AI Character & Style Conditioning",
      description:
        "Transforms live-action human dance choreography into a stylized anime sequence while preserving motion cadence, garment sway, hand articulation, and expressive camera framing."
    },
    "lion-to-robot": {
      id: "lion-to-robot",
      code: "PAIR 02 — LION TO ROBOT",
      title: "Organic Wildlife to Biomechanical Robot",
      category: "Structural Material Synthesis",
      beforeSrc: "assets/showcase/videos/vidio before2.mp4",
      afterSrc: "assets/showcase/videos/vidio after2.mp4",
      beforePoster: "assets/showcase/videos/lion-to-robot-before-poster.jpg",
      afterPoster: "assets/showcase/videos/lion-to-robot-after-poster.jpg",
      beforeLabel: "BEFORE // ORIGINAL FOOTAGE",
      afterLabel: "AFTER // ROBOTIC TRANSFORMATION",
      specs: "9:16 VERTICAL • 720×1280 • 8.0S SYNCHRONIZED",
      pipeline: "Vidsynth AI Visual Processing & Geometry Lock",
      description:
        "Reconstructs an organic lion sequence into an articulated mechanical construct, maintaining stride kinematics, head rotation, and environmental lighting coherence."
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

  function setupVideoComparisonSection() {
    const viewport = document.getElementById("comparison-viewport");
    const beforeLayer = document.getElementById("comp-layer-before");
    const divider = document.getElementById("comparison-divider");
    const videoBefore = document.getElementById("comp-video-before");
    const videoAfter = document.getElementById("comp-video-after");

    if (!viewport || !beforeLayer || !divider || !videoBefore || !videoAfter) return;

    const playPauseBtn = document.getElementById("comp-play-pause");
    const muteBtn = document.getElementById("comp-mute-toggle");
    const stepBackBtn = document.getElementById("comp-step-back");
    const stepFwdBtn = document.getElementById("comp-step-fwd");
    const scrubber = document.getElementById("comp-timeline-scrubber");
    const timecodeDisplay = document.getElementById("comp-timecode");
    const frameCounter = document.getElementById("comp-frame-counter");
    const fullscreenBtn = document.getElementById("comp-fullscreen-btn");

    const beforeBadge = document.getElementById("comp-badge-before");
    const afterBadge = document.getElementById("comp-badge-after");
    const activePairCode = document.getElementById("comp-active-pair-code");
    const activePairTitle = document.getElementById("comp-active-pair-title");
    const activePairDesc = document.getElementById("comp-active-pair-desc");
    const activePairSpecs = document.getElementById("comp-active-pair-specs");
    const activePairPipeline = document.getElementById("comp-active-pair-pipeline");

    let currentPairId = "human-to-anime";
    let splitPercent = 50;
    let isDragging = false;
    let isScrubbing = false;
    let isMuted = true;

    function updateSplitPosition(percent) {
      splitPercent = Math.max(2, Math.min(98, Number(percent)));
      beforeLayer.style.clipPath = `inset(0 ${100 - splitPercent}% 0 0)`;
      divider.style.left = `${splitPercent}%`;
      divider.setAttribute("aria-valuenow", String(Math.round(splitPercent)));

      document.querySelectorAll("[data-comp-split-preset]").forEach((btn) => {
        const targetVal = Number(btn.getAttribute("data-comp-split-preset"));
        if (Math.abs(targetVal - splitPercent) <= 4) {
          btn.classList.add("bg-[#75624E]", "text-[#FAF8F3]", "border-[#75624E]");
          btn.classList.remove("bg-[#292720]", "text-[#C9BBA5]", "border-[#C9BBA5]/25");
        } else {
          btn.classList.remove("bg-[#75624E]", "text-[#FAF8F3]", "border-[#75624E]");
          btn.classList.add("bg-[#292720]", "text-[#C9BBA5]", "border-[#C9BBA5]/25");
        }
      });
    }

    function updateFromClientX(clientX) {
      const rect = viewport.getBoundingClientRect();
      if (!rect.width) return;
      const relX = clientX - rect.left;
      const pct = (relX / rect.width) * 100;
      updateSplitPosition(pct);
    }

    viewport.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || e.target.closest("input")) return;
      isDragging = true;
      viewport.classList.add("is-dragging");
      try {
        viewport.setPointerCapture(e.pointerId);
      } catch (_) {}
      updateFromClientX(e.clientX);
    });

    viewport.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      updateFromClientX(e.clientX);
    });

    function stopDragging(e) {
      if (!isDragging) return;
      isDragging = false;
      viewport.classList.remove("is-dragging");
      try {
        viewport.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }

    viewport.addEventListener("pointerup", stopDragging);
    viewport.addEventListener("pointercancel", stopDragging);

    // Keyboard accessibility on comparison handle
    divider.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        updateSplitPosition(splitPercent - 4);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        updateSplitPosition(splitPercent + 4);
      } else if (e.key === "Home") {
        e.preventDefault();
        updateSplitPosition(5);
      } else if (e.key === "End") {
        e.preventDefault();
        updateSplitPosition(95);
      }
    });

    // Quick Split Preset Buttons (Before / 50:50 / After)
    document.querySelectorAll("[data-comp-split-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = Number(btn.getAttribute("data-comp-split-preset"));
        if (!isNaN(val)) updateSplitPosition(val);
      });
    });

    function getEffectiveDuration() {
      const d1 = Number(videoBefore.duration) || 0;
      const d2 = Number(videoAfter.duration) || 0;
      if (d1 > 0 && d2 > 0) return Math.min(d1, d2);
      return d2 || d1 || 8;
    }

    function syncSlaveToMaster(force = false) {
      const effDuration = getEffectiveDuration();
      if (effDuration > 0 && videoBefore.currentTime >= effDuration - 0.04) {
        videoBefore.currentTime = 0;
        videoAfter.currentTime = 0;
      }
      const drift = Math.abs(videoBefore.currentTime - videoAfter.currentTime);
      if (force || drift > 0.04) {
        try {
          videoAfter.currentTime = Math.min(
            videoBefore.currentTime,
            (videoAfter.duration || effDuration) - 0.02
          );
        } catch (_) {}
      }
    }

    function updateTransportUI() {
      const cur = videoBefore.currentTime || 0;
      const dur = getEffectiveDuration();
      if (timecodeDisplay) {
        timecodeDisplay.textContent = formatTimecode(cur);
      }
      if (frameCounter) {
        const curFrame = Math.min(Math.floor(cur * FPS) + 1, Math.floor(dur * FPS));
        const totalFrames = Math.max(1, Math.floor(dur * FPS));
        frameCounter.textContent = `F ${String(curFrame).padStart(3, "0")} / ${String(totalFrames).padStart(3, "0")}`;
      }
      if (scrubber && !isScrubbing && dur > 0) {
        scrubber.value = String(Math.min(100, (cur / dur) * 100));
      }
      if (playPauseBtn) {
        const isPaused = videoBefore.paused;
        playPauseBtn.innerHTML = isPaused
          ? `<span aria-hidden="true">▶</span> <span>PLAY</span>`
          : `<span aria-hidden="true">❚❚</span> <span>PAUSE</span>`;
        playPauseBtn.setAttribute("aria-label", isPaused ? "Play synchronized comparison" : "Pause synchronized comparison");
      }
      if (muteBtn) {
        muteBtn.innerHTML = isMuted
          ? `<span aria-hidden="true">🔇</span> <span>MUTED</span>`
          : `<span aria-hidden="true">🔊</span> <span>AUDIO ON</span>`;
        muteBtn.setAttribute("aria-pressed", String(!isMuted));
      }
    }

    let rafId = null;
    function tickSyncLoop() {
      if (!videoBefore.paused && !videoBefore.ended) {
        syncSlaveToMaster(false);
        updateTransportUI();
        rafId = requestAnimationFrame(tickSyncLoop);
      }
    }

    videoBefore.addEventListener("play", () => {
      videoAfter.play().catch(() => {});
      updateTransportUI();
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(tickSyncLoop);
    });

    videoBefore.addEventListener("pause", () => {
      videoAfter.pause();
      if (rafId) cancelAnimationFrame(rafId);
      updateTransportUI();
    });

    videoBefore.addEventListener("seeking", () => {
      syncSlaveToMaster(true);
      updateTransportUI();
    });

    videoBefore.addEventListener("timeupdate", () => {
      syncSlaveToMaster(false);
      updateTransportUI();
    });

    videoBefore.addEventListener("loadedmetadata", () => {
      updateTransportUI();
    });

    if (playPauseBtn) {
      playPauseBtn.addEventListener("click", () => {
        if (videoBefore.paused) {
          syncSlaveToMaster(true);
          Promise.allSettled([videoBefore.play(), videoAfter.play()]).then(updateTransportUI);
        } else {
          videoBefore.pause();
          videoAfter.pause();
          updateTransportUI();
        }
      });
    }

    if (muteBtn) {
      muteBtn.addEventListener("click", () => {
        isMuted = !isMuted;
        videoBefore.muted = true; // Keep original plate muted to avoid double audio phasing
        videoAfter.muted = isMuted;
        if (!isMuted) {
          videoAfter.volume = 0.85;
        }
        updateTransportUI();
      });
    }

    function stepFrames(deltaFrames) {
      videoBefore.pause();
      videoAfter.pause();
      const dur = getEffectiveDuration();
      const nextTime = Math.max(0, Math.min(dur - 0.02, videoBefore.currentTime + deltaFrames / FPS));
      videoBefore.currentTime = nextTime;
      videoAfter.currentTime = nextTime;
      updateTransportUI();
    }

    if (stepBackBtn) stepBackBtn.addEventListener("click", () => stepFrames(-1));
    if (stepFwdBtn) stepFwdBtn.addEventListener("click", () => stepFrames(1));

    if (scrubber) {
      scrubber.addEventListener("input", () => {
        isScrubbing = true;
        const dur = getEffectiveDuration();
        const targetTime = (Number(scrubber.value) / 100) * dur;
        videoBefore.currentTime = targetTime;
        videoAfter.currentTime = targetTime;
        updateTransportUI();
      });
      scrubber.addEventListener("change", () => {
        isScrubbing = false;
        syncSlaveToMaster(true);
      });
    }

    if (fullscreenBtn) {
      fullscreenBtn.addEventListener("click", () => {
        const stageShell = document.getElementById("comparison-stage-shell") || viewport;
        if (!document.fullscreenElement) {
          if (stageShell.requestFullscreen) stageShell.requestFullscreen().catch(() => {});
        } else if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    // Switch between PAIR 01 (Human to Anime) and PAIR 02 (Lion to Robot)
    function switchVideoPair(pairId) {
      const pair = VIDEO_PAIRS[pairId];
      if (!pair || pairId === currentPairId) return;
      currentPairId = pairId;

      document.querySelectorAll("[data-video-pair]").forEach((btn) => {
        const isMatch = btn.getAttribute("data-video-pair") === pairId;
        btn.classList.toggle("active", isMatch);
        btn.setAttribute("aria-selected", isMatch ? "true" : "false");
      });

      viewport.classList.add("is-switching");

      setTimeout(() => {
        const wasPlaying = !videoBefore.paused;
        videoBefore.pause();
        videoAfter.pause();

        videoBefore.poster = pair.beforePoster;
        videoAfter.poster = pair.afterPoster;
        videoBefore.src = pair.beforeSrc;
        videoAfter.src = pair.afterSrc;
        videoBefore.muted = true;
        videoAfter.muted = isMuted;

        videoBefore.load();
        videoAfter.load();

        if (beforeBadge) beforeBadge.textContent = pair.beforeLabel;
        if (afterBadge) afterBadge.textContent = pair.afterLabel;
        if (activePairCode) activePairCode.textContent = pair.code;
        if (activePairTitle) activePairTitle.textContent = pair.title;
        if (activePairDesc) activePairDesc.textContent = pair.description;
        if (activePairSpecs) activePairSpecs.textContent = pair.specs;
        if (activePairPipeline) activePairPipeline.textContent = pair.pipeline;

        const onReady = () => {
          videoBefore.currentTime = 0;
          videoAfter.currentTime = 0;
          viewport.classList.remove("is-switching");
          updateTransportUI();
          if (wasPlaying) {
            Promise.allSettled([videoBefore.play(), videoAfter.play()]).then(updateTransportUI);
          }
        };

        videoAfter.addEventListener("loadeddata", onReady, { once: true });
        setTimeout(() => viewport.classList.remove("is-switching"), 420);
      }, 160);
    }

    document.querySelectorAll("[data-video-pair]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetPair = btn.getAttribute("data-video-pair");
        switchVideoPair(targetPair);
      });
    });

    // Initialize split position & autoplay when visible
    updateSplitPosition(50);
    updateTransportUI();

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              Promise.allSettled([videoBefore.play(), videoAfter.play()]).then(updateTransportUI);
            } else {
              videoBefore.pause();
              videoAfter.pause();
              updateTransportUI();
            }
          });
        },
        { threshold: 0.25 }
      );
      observer.observe(viewport);
    } else {
      Promise.allSettled([videoBefore.play(), videoAfter.play()]).then(updateTransportUI);
    }
  }

  // Natural Hover & Viewport Video Preview for Featured Transformation Showcase Cards (Pauses when offscreen)
  function setupFeaturedVideoShowcaseCards() {
    const cards = document.querySelectorAll("[data-hover-video-card]");
    cards.forEach((card) => {
      const video = card.querySelector("video");
      if (!video) return;

      card.addEventListener("mouseenter", () => {
        video.play().catch(() => {});
      });

      card.addEventListener("focusin", () => {
        video.play().catch(() => {});
      });
    });

    if ("IntersectionObserver" in window) {
      const cardObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const video = entry.target.querySelector("video");
            if (!video) return;
            if (entry.isIntersecting) {
              video.play().catch(() => {});
            } else {
              video.pause();
            }
          });
        },
        { threshold: 0.15 }
      );
      cards.forEach((card) => cardObserver.observe(card));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setupVideoComparisonSection();
      setupFeaturedVideoShowcaseCards();
    });
  } else {
    setupVideoComparisonSection();
    setupFeaturedVideoShowcaseCards();
  }
})();
