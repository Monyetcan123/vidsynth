/**
 * VIDSYNTH — CORE APPLICATION CONTROLLER (js/app.js)
 * ============================================================================
 * Handles:
 * - Sticky Announcement Bar & Changelog Modal
 * - Responsive Mobile Navigation & Auth Header Synchronization
 * - Runtime Environment Status Indicator (Supabase Cloud vs. Local Sandbox Demo)
 * - Early Access & Enterprise Lead Registration (Client + DB/Demo Validation + Duplicate Check)
 * - Bento Showcase Video Inspection Modal & Hover Playback
 */

(function initVidSynthApp() {
  const CONFIG = window.VIDSYNTH_CONFIG || {
    APP_NAME: "VidSynth Studio",
    IS_SUPABASE_CONFIGURED: false,
    RUNTIME_MODE: "LOCAL_SANDBOX_DEMO"
  };

  const LEADS_STORAGE_KEY = "vidsynth_early_access_leads_v1";
  const ANNOUNCEMENT_DISMISSED_KEY = "vidsynth_announcement_dismissed_v1";

  // --------------------------------------------------------------------------
  // 1. Toast Notification System
  // --------------------------------------------------------------------------
  function showToast(message, type = "info") {
    let container = document.getElementById("vs-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "vs-toast-container";
      container.className = "fixed bottom-5 right-5 z-[200] flex flex-col gap-2 max-w-md w-full px-4 pointer-events-none";
      container.setAttribute("aria-live", "polite");
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    const borderCol =
      type === "success"
        ? "border-[#10B981]"
        : type === "error"
        ? "border-[#EF4444]"
        : type === "warning"
        ? "border-[#F59E0B]"
        : "border-[#00F0FF]";

    const badgeText =
      type === "success"
        ? "CONFIRMED"
        : type === "error"
        ? "VALIDATION ERROR"
        : type === "warning"
        ? "NOTICE"
        : "SYSTEM";

    toast.className = `pointer-events-auto bg-[#101117] border-l-2 ${borderCol} border border-[#252832] rounded-sm p-3.5 shadow-2xl flex items-start justify-between gap-3 transition-all duration-200`;
    toast.innerHTML = `
      <div class="flex flex-col gap-1">
        <span class="font-mono-tech text-[10px] tracking-wider uppercase text-[#9296A3]">${badgeText}</span>
        <p class="text-xs text-[#F5F6FA] leading-relaxed">${escapeHtml(message)}</p>
      </div>
      <button type="button" class="text-[#626775] hover:text-[#F5F6FA] text-xs font-mono-tech px-1" aria-label="Dismiss notification">✕</button>
    `;

    toast.querySelector("button").addEventListener("click", () => toast.remove());
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 5200);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  window.VidSynthToast = { show: showToast };

  // --------------------------------------------------------------------------
  // 2. Announcement Bar & System Changelog Modal
  // --------------------------------------------------------------------------
  function initAnnouncementBar() {
    const bar = document.getElementById("announcement-bar");
    const dismissBtn = document.getElementById("dismiss-announcement-btn");
    const changelogBtns = document.querySelectorAll("[data-open-changelog]");
    const changelogModal = document.getElementById("changelog-modal");
    const closeChangelogBtns = document.querySelectorAll("[data-close-changelog]");

    if (bar && sessionStorage.getItem(ANNOUNCEMENT_DISMISSED_KEY) === "1") {
      bar.classList.add("hidden");
    }

    if (dismissBtn && bar) {
      dismissBtn.addEventListener("click", () => {
        bar.classList.add("hidden");
        sessionStorage.setItem(ANNOUNCEMENT_DISMISSED_KEY, "1");
      });
    }

    changelogBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (changelogModal) {
          changelogModal.classList.remove("hidden");
          document.body.style.overflow = "hidden";
        }
      });
    });

    closeChangelogBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (changelogModal) {
          changelogModal.classList.add("hidden");
          document.body.style.overflow = "";
        }
      });
    });
  }

  // --------------------------------------------------------------------------
  // 3. Navigation, Mobile Menu & Runtime Status Indicator
  // --------------------------------------------------------------------------
  function initNavigation() {
    const mobileMenuBtn = document.getElementById("mobile-menu-btn");
    const mobileMenuCloseBtn = document.getElementById("mobile-menu-close-btn");
    const mobileDrawer = document.getElementById("mobile-nav-drawer");
    const mobileLinks = mobileDrawer ? mobileDrawer.querySelectorAll("a, button") : [];

    function toggleMobileMenu(open) {
      if (!mobileDrawer || !mobileMenuBtn) return;
      const isOpen = typeof open === "boolean" ? open : mobileDrawer.classList.contains("hidden");
      if (isOpen) {
        mobileDrawer.classList.remove("hidden");
        mobileMenuBtn.setAttribute("aria-expanded", "true");
        document.body.style.overflow = "hidden";
      } else {
        mobileDrawer.classList.add("hidden");
        mobileMenuBtn.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
      }
    }

    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener("click", () => toggleMobileMenu());
    }
    if (mobileMenuCloseBtn) {
      mobileMenuCloseBtn.addEventListener("click", () => toggleMobileMenu(false));
    }
    mobileLinks.forEach((link) => {
      link.addEventListener("click", () => toggleMobileMenu(false));
    });

    // Runtime Environment Status Indicator in Navbar
    const statusDots = document.querySelectorAll("[data-runtime-status-dot]");
    const statusLabels = document.querySelectorAll("[data-runtime-status-label]");
    statusDots.forEach((dot) => {
      dot.className = CONFIG.IS_SUPABASE_CONFIGURED
        ? "w-2 h-2 rounded-full bg-[#10B981]"
        : "w-2 h-2 rounded-full bg-[#00F0FF]";
    });
    statusLabels.forEach((lbl) => {
      lbl.textContent = CONFIG.IS_SUPABASE_CONFIGURED
        ? "SUPABASE CONNECTED"
        : "SANDBOX PREVIEW MODE";
    });

    // Reflect active session in header if user is logged in
    try {
      const rawSession = localStorage.getItem("vidsynth_active_session_v1");
      if (rawSession) {
        const session = JSON.parse(rawSession);
        if (session && session.user && session.user.email) {
          const signInLinks = document.querySelectorAll("[data-nav-signin]");
          signInLinks.forEach((el) => {
            el.textContent = session.user.full_name || session.user.email.split("@")[0];
            el.href = "dashboard.html";
            el.title = `Signed in as ${session.user.email}`;
          });
        }
      }
    } catch (_) {
      // Ignore storage parse error
    }
  }

  // --------------------------------------------------------------------------
  // 4. Bento Showcase Hover Preview & Video Inspection Modal
  // --------------------------------------------------------------------------
  function initShowcaseInteractions() {
    const showcaseCards = document.querySelectorAll("[data-showcase-card]");
    const modal = document.getElementById("showcase-inspect-modal");
    const modalVideo = document.getElementById("showcase-modal-video");
    const modalTitle = document.getElementById("showcase-modal-title");
    const modalCategory = document.getElementById("showcase-modal-category");
    const modalModel = document.getElementById("showcase-modal-model");
    const modalSpec = document.getElementById("showcase-modal-spec");
    const modalDesc = document.getElementById("showcase-modal-desc");
    const closeBtns = document.querySelectorAll("[data-close-showcase-modal]");

    showcaseCards.forEach((card) => {
      const video = card.querySelector("video");
      if (video) {
        card.addEventListener("mouseenter", () => {
          video.play().catch(() => {});
        });
        card.addEventListener("mouseleave", () => {
          video.pause();
        });
      }

      const inspectBtn = card.querySelector("[data-inspect-showcase]");
      if (inspectBtn && modal) {
        inspectBtn.addEventListener("click", () => {
          const src = card.getAttribute("data-video-src") || "";
          const poster = card.getAttribute("data-poster-src") || "";
          const title = card.getAttribute("data-title") || "Reference Sequence";
          const category = card.getAttribute("data-category") || "Synthesis Pass";
          const model = card.getAttribute("data-model") || "VS-CHAR-2.4";
          const spec = card.getAttribute("data-spec") || "1920×1080 • 24fps";
          const desc = card.getAttribute("data-desc") || "";

          if (modalTitle) modalTitle.textContent = title;
          if (modalCategory) modalCategory.textContent = category;
          if (modalModel) modalModel.textContent = model;
          if (modalSpec) modalSpec.textContent = spec;
          if (modalDesc) modalDesc.textContent = desc;

          if (modalVideo && src) {
            modalVideo.poster = poster;
            modalVideo.src = src;
            modalVideo.load();
            modalVideo.play().catch(() => {});
          }

          modal.classList.remove("hidden");
          document.body.style.overflow = "hidden";
        });
      }
    });

    function closeShowcaseModal() {
      if (!modal) return;
      modal.classList.add("hidden");
      if (modalVideo) modalVideo.pause();
      document.body.style.overflow = "";
    }

    closeBtns.forEach((btn) => btn.addEventListener("click", closeShowcaseModal));
  }

  // --------------------------------------------------------------------------
  // 5. Early Access & Enterprise Lead Registration Flow
  // --------------------------------------------------------------------------
  function validateEmail(email) {
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(String(email).trim());
  }

  function getStoredLeads() {
    try {
      const raw = localStorage.getItem(LEADS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function saveStoredLeads(leads) {
    localStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(leads));
  }

  function initEarlyAccessForms() {
    const forms = document.querySelectorAll("[data-early-access-form]");
    const openModalBtns = document.querySelectorAll("[data-open-early-access-modal]");
    const earlyAccessModal = document.getElementById("early-access-modal");
    const closeModalBtns = document.querySelectorAll("[data-close-early-access-modal]");

    openModalBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const plan = btn.getAttribute("data-plan-interest") || "";
        if (earlyAccessModal) {
          const selectEl = earlyAccessModal.querySelector("select[name='use_case']");
          if (selectEl && plan) {
            for (const opt of selectEl.options) {
              if (opt.value.toLowerCase().includes(plan.toLowerCase())) {
                selectEl.value = opt.value;
                break;
              }
            }
          }
          earlyAccessModal.classList.remove("hidden");
          document.body.style.overflow = "hidden";
        } else {
          const inlineSection = document.getElementById("early-access");
          if (inlineSection) inlineSection.scrollIntoView({ behavior: "smooth" });
        }
      });
    });

    closeModalBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (earlyAccessModal) {
          earlyAccessModal.classList.add("hidden");
          document.body.style.overflow = "";
        }
      });
    });

    forms.forEach((form) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const nameInput = form.querySelector("[name='full_name']");
        const emailInput = form.querySelector("[name='work_email']");
        const companyInput = form.querySelector("[name='company']");
        const useCaseInput = form.querySelector("[name='use_case']");
        const statusBox = form.querySelector("[data-form-status]");
        const submitBtn = form.querySelector("button[type='submit']");

        const fullName = nameInput ? nameInput.value.trim() : "";
        const workEmail = emailInput ? emailInput.value.trim().toLowerCase() : "";
        const company = companyInput ? companyInput.value.trim() : "";
        const useCase = useCaseInput ? useCaseInput.value.trim() : "";

        // Reset error visuals
        [nameInput, emailInput, companyInput, useCaseInput].forEach((el) => {
          if (el) el.classList.remove("input-error");
        });

        // Client-side validation
        const errors = [];
        if (fullName.length < 2) {
          errors.push("Please enter your full name (at least 2 characters).");
          if (nameInput) nameInput.classList.add("input-error");
        }
        if (!validateEmail(workEmail)) {
          errors.push("Please provide a valid work or organization email address.");
          if (emailInput) emailInput.classList.add("input-error");
        }
        if (company.length < 2) {
          errors.push("Please specify your studio, company, or organization name.");
          if (companyInput) companyInput.classList.add("input-error");
        }
        if (!useCase) {
          errors.push("Please select your primary intended production use case.");
          if (useCaseInput) useCaseInput.classList.add("input-error");
        }

        if (errors.length > 0) {
          if (statusBox) {
            statusBox.className = "mt-3 p-3 rounded-sm border border-[#EF4444] bg-[#EF4444]/10 text-xs text-[#F5F6FA]";
            statusBox.textContent = errors[0];
            statusBox.classList.remove("hidden");
          }
          showToast(errors[0], "error");
          return;
        }

        // Loading state
        const origBtnHtml = submitBtn ? submitBtn.innerHTML : "Submit";
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = `<span class="font-mono-tech text-xs">VALIDATING & RECORDING...</span>`;
        }

        await new Promise((r) => setTimeout(r, 380));

        try {
          if (CONFIG.IS_SUPABASE_CONFIGURED && window.supabaseClient) {
            const { error } = await window.supabaseClient.from("early_access_leads").insert([
              {
                full_name: fullName,
                work_email: workEmail,
                company,
                use_case: useCase
              }
            ]);

            if (error) {
              if (error.code === "23505" || String(error.message).toLowerCase().includes("duplicate")) {
                throw new Error("DUPLICATE_EMAIL");
              }
              throw error;
            }

            if (statusBox) {
              statusBox.className = "mt-3 p-3.5 rounded-sm border border-[#10B981] bg-[#10B981]/10 text-xs text-[#F5F6FA]";
              statusBox.innerHTML = `
                <div class="font-mono-tech text-[11px] text-[#10B981] uppercase mb-1">✓ REGISTERED IN SUPABASE DATABASE</div>
                <p class="text-[#9296A3]">Request logged for <strong>${escapeHtml(workEmail)}</strong> (${escapeHtml(company)}).</p>
              `;
              statusBox.classList.remove("hidden");
            }
            showToast(`Early access request recorded in Supabase for ${workEmail}.`, "success");
            form.reset();
          } else {
            // Local Sandbox Demonstration Registry with deterministic duplicate check
            const existing = getStoredLeads();
            const isDuplicate = existing.some((item) => item.work_email === workEmail);
            if (isDuplicate) {
              throw new Error("DUPLICATE_EMAIL");
            }

            existing.push({
              id: "lead_" + Date.now(),
              full_name: fullName,
              work_email: workEmail,
              company,
              use_case: useCase,
              mode: "LOCAL_SANDBOX_DEMO",
              created_at: new Date().toISOString()
            });
            saveStoredLeads(existing);

            if (statusBox) {
              statusBox.className = "mt-3 p-3.5 rounded-sm border border-[#00F0FF] bg-[#00F0FF]/10 text-xs text-[#F5F6FA]";
              statusBox.innerHTML = `
                <div class="font-mono-tech text-[11px] text-[#00F0FF] uppercase mb-1">✓ RECORDED IN LOCAL DEMONSTRATION REGISTRY</div>
                <p class="text-[#9296A3]">Validated entry for <strong>${escapeHtml(workEmail)}</strong> (${escapeHtml(company)}). <em>Note: Running in Local Sandbox Mode; connect Supabase in config/config.js to persist leads to cloud PostgreSQL.</em></p>
              `;
              statusBox.classList.remove("hidden");
            }
            showToast(`Demonstration lead recorded locally for ${workEmail}.`, "success");
            form.reset();
          }
        } catch (err) {
          const isDup = err && err.message === "DUPLICATE_EMAIL";
          const msg = isDup
            ? `The email address "${workEmail}" is already registered in the early access registry.`
            : `Submission error: ${err.message || "Unable to store request."}`;
          if (statusBox) {
            statusBox.className = "mt-3 p-3.5 rounded-sm border border-[#F59E0B] bg-[#F59E0B]/10 text-xs text-[#F5F6FA]";
            statusBox.textContent = msg;
            statusBox.classList.remove("hidden");
          }
          if (emailInput && isDup) emailInput.classList.add("input-error");
          showToast(msg, isDup ? "warning" : "error");
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origBtnHtml;
          }
        }
      });
    });
  }

  // --------------------------------------------------------------------------
  // 6. Global Keyboard Escape Handler & Dynamic Copyright Year
  // --------------------------------------------------------------------------
  function initGlobals() {
    document.querySelectorAll("[data-current-year]").forEach((el) => {
      el.textContent = new Date().getFullYear();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        ["changelog-modal", "showcase-inspect-modal", "early-access-modal", "mobile-nav-drawer"].forEach((id) => {
          const el = document.getElementById(id);
          if (el && !el.classList.contains("hidden")) {
            el.classList.add("hidden");
            const v = el.querySelector("video");
            if (v) v.pause();
            document.body.style.overflow = "";
          }
        });
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initAnnouncementBar();
    initNavigation();
    initShowcaseInteractions();
    initEarlyAccessForms();
    initGlobals();
  });
})();
