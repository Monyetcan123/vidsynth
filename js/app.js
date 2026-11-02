/**
 * VIDSYNTH AI — CORE APPLICATION CONTROLLER (js/app.js)
 * ============================================================================
 * Handles:
 * - Sticky Announcement Bar & Architecture/Changelog Modal
 * - Responsive Mobile Navigation Drawer & Accessible Keyboard Controls
 * - Smooth-Scroll Anchor Navigation (including Launch Studio -> #comparison-studio)
 * - Bento Showcase Video Hover Preview & Frame Inspection Modal
 * - Early Access Request Modal Popup (Form + Instant Confirmation + Copy Email Tooltip)
 * - Section-level Early Access Inquiry Form
 */

(function initVidSynthApp() {
  const ANNOUNCEMENT_DISMISSED_KEY = "vidsynth_announcement_dismissed_v1";
  const FOUNDER_EMAIL = "founder@vidsynth.app";

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function validateEmail(email) {
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(String(email || "").trim());
  }

  function copyTextToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
    }
    return Promise.resolve(fallbackCopyText(text));
  }

  function fallbackCopyText(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch (_) {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // 1. Toast Notification Helper
  // --------------------------------------------------------------------------
  function showToast(message, type = "info") {
    let container = document.getElementById("vs-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "vs-toast-container";
      container.className =
        "fixed bottom-5 right-5 z-[200] flex flex-col gap-2 max-w-md w-full px-4 pointer-events-none";
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
        ? "VALIDATION NOTICE"
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
    }, 5000);
  }

  window.VidSynthToast = { show: showToast };

  // --------------------------------------------------------------------------
  // 2. Announcement Bar & Architecture Changelog Modal
  // --------------------------------------------------------------------------
  function initAnnouncementBar() {
    const bar = document.getElementById("announcement-bar");
    const dismissBtn = document.getElementById("dismiss-announcement-btn");
    const changelogBtns = document.querySelectorAll("[data-open-changelog]");
    const changelogModal = document.getElementById("changelog-modal");
    const closeChangelogBtns = document.querySelectorAll("[data-close-changelog]");

    try {
      if (bar && sessionStorage.getItem(ANNOUNCEMENT_DISMISSED_KEY) === "1") {
        bar.classList.add("hidden");
      }
    } catch (_) {}

    if (dismissBtn && bar) {
      dismissBtn.addEventListener("click", () => {
        bar.classList.add("hidden");
        try {
          sessionStorage.setItem(ANNOUNCEMENT_DISMISSED_KEY, "1");
        } catch (_) {}
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

    if (changelogModal) {
      changelogModal.addEventListener("click", (e) => {
        if (e.target === changelogModal) {
          changelogModal.classList.add("hidden");
          document.body.style.overflow = "";
        }
      });
    }
  }

  // --------------------------------------------------------------------------
  // 3. Responsive Navigation & Smooth Scroll Anchor Handling
  // --------------------------------------------------------------------------
  function closeMobileDrawer() {
    const mobileMenuBtn = document.getElementById("mobile-menu-btn");
    const mobileDrawer = document.getElementById("mobile-nav-drawer");
    if (mobileDrawer && !mobileDrawer.classList.contains("hidden")) {
      mobileDrawer.classList.add("hidden");
      if (mobileMenuBtn) mobileMenuBtn.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    }
  }

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
      if (link.id !== "mobile-menu-close-btn") {
        link.addEventListener("click", () => toggleMobileMenu(false));
      }
    });

    // Smooth-scroll handler for same-page hash anchors (e.g., #comparison-studio)
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", (e) => {
        if (anchor.hasAttribute("data-open-early-access")) return;
        const hash = anchor.getAttribute("href");
        if (!hash || hash === "#") return;
        const targetEl = document.querySelector(hash);
        if (targetEl) {
          e.preventDefault();
          toggleMobileMenu(false);
          targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
          history.replaceState(null, "", hash);
        }
      });
    });

    // Preserve SANDBOX PREVIEW MODE badge state
    document.querySelectorAll("[data-runtime-status-dot]").forEach((dot) => {
      dot.className = "w-2 h-2 rounded-full bg-[#00F0FF]";
    });
    document.querySelectorAll("[data-runtime-status-label]").forEach((lbl) => {
      lbl.textContent = "SANDBOX PREVIEW MODE";
    });
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

    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeShowcaseModal();
      });
    }
  }

  // --------------------------------------------------------------------------
  // 5. Early Access Request Modal Popup (Header, Hero & Mobile Nav CTAs)
  // --------------------------------------------------------------------------
  function ensureEarlyAccessModal() {
    let modal = document.getElementById("early-access-modal");
    if (modal) return modal;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <div
        id="early-access-modal"
        class="hidden ea-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="early-access-modal-title"
        aria-describedby="early-access-modal-subtitle"
      >
        <div class="ea-modal-panel" data-early-access-panel>
          <button
            type="button"
            id="close-early-access-modal"
            data-close-early-access
            class="ea-modal-close"
            aria-label="Close Early Access modal"
          >
            ✕
          </button>
          <div class="pr-8 space-y-1.5 pb-4 border-b border-[#252832]">
            <div class="inline-flex items-center gap-2 font-mono-tech text-[10px] uppercase tracking-wider text-[#00F0FF]">
              <span class="w-1.5 h-1.5 rounded-full bg-[#00F0FF]"></span>
              <span>VIDSYNTH STUDIO // EARLY ACCESS</span>
            </div>
            <h2 id="early-access-modal-title" class="text-xl font-semibold tracking-tight text-[#F5F6FA]">
              Request Studio Early Access
            </h2>
            <p id="early-access-modal-subtitle" class="font-mono-tech text-xs text-[#9296A3]">
              Private Beta Cohort — Visual Effects &amp; Neural Pipeline Ingest
            </p>
          </div>
          <div class="mt-4 ea-option-box">
            <div class="font-mono-tech text-[10px] uppercase tracking-wider text-[#00F0FF] mb-2">
              OPTION 01 // APPLICATION REGISTRATION
            </div>
            <form id="early-access-modal-form" novalidate class="space-y-3">
              <div>
                <label for="ea-modal-email-input" class="block text-xs font-medium text-[#F5F6FA] mb-1.5">
                  Your Work Email
                </label>
                <input
                  id="ea-modal-email-input"
                  name="work_email"
                  type="email"
                  required
                  autocomplete="email"
                  placeholder="Your Work Email (e.g., lead@vfx-studio.com)"
                  class="input-field"
                />
              </div>
              <button
                type="submit"
                id="ea-modal-submit-btn"
                class="btn-primary w-full justify-center font-mono-tech text-xs py-2.5"
              >
                Submit Request
              </button>
            </form>
            <div
              id="ea-modal-feedback"
              class="hidden ea-success-banner"
              role="status"
              aria-live="polite"
            >
              Thank you! Our engineering team will review your application.
            </div>
          </div>
          <div class="ea-divider">OR DIRECT CONTACT</div>
          <div class="ea-option-box space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="font-mono-tech text-[10px] uppercase tracking-wider text-[#9296A3]">
                OPTION 02 // DIRECT FOUNDER DESK
              </span>
              <span class="font-mono-tech text-[10px] text-[#626775]">Najla Afaf Ullaya</span>
            </div>
            <div class="ea-direct-email-row">
              <a
                href="mailto:founder@vidsynth.app?subject=VidSynth%20Studio%20Early%20Access%20Request"
                id="ea-direct-email-text"
                class="font-mono-tech text-xs sm:text-sm text-[#00F0FF] hover:underline truncate"
              >
                founder@vidsynth.app
              </a>
              <div class="ea-copy-wrapper">
                <span id="ea-copy-tooltip" class="ea-copy-tooltip" role="status" aria-live="polite">
                  Copied!
                </span>
                <button
                  type="button"
                  id="ea-copy-email-btn"
                  data-copy-email="founder@vidsynth.app"
                  class="ea-copy-btn"
                  aria-label="Copy founder@vidsynth.app to clipboard"
                >
                  <span>Copy Email</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    modal = wrapper.firstElementChild;
    document.body.appendChild(modal);
    return modal;
  }

  function initEarlyAccessModal() {
    const modal = ensureEarlyAccessModal();
    if (!modal) return;

    const closeBtns = modal.querySelectorAll("[data-close-early-access]");
    const form = modal.querySelector("#early-access-modal-form");
    const emailInput = modal.querySelector("#ea-modal-email-input");
    const feedbackBox = modal.querySelector("#ea-modal-feedback");
    const copyBtn = modal.querySelector("#ea-copy-email-btn");
    const copyTooltip = modal.querySelector("#ea-copy-tooltip");
    let tooltipTimer = null;

    function openEarlyAccessModal(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      closeMobileDrawer();
      modal.classList.remove("hidden");
      document.body.style.overflow = "hidden";
      if (emailInput) {
        emailInput.classList.remove("input-error");
        setTimeout(() => {
          try {
            emailInput.focus();
          } catch (_) {}
        }, 50);
      }
    }

    function closeEarlyAccessModal() {
      modal.classList.add("hidden");
      document.body.style.overflow = "";
    }

    // Attach to all explicit [data-open-early-access] elements AND any button/link labeled "REQUEST EARLY ACCESS"
    const triggers = new Set(document.querySelectorAll("[data-open-early-access]"));
    document.querySelectorAll("a, button").forEach((el) => {
      if (modal.contains(el)) return;
      const text = (el.textContent || "").trim().toUpperCase();
      if (text.includes("REQUEST EARLY ACCESS")) {
        el.setAttribute("data-open-early-access", "");
        triggers.add(el);
      }
    });

    triggers.forEach((btn) => {
      btn.addEventListener("click", openEarlyAccessModal);
    });

    // Close on 'X' button click
    closeBtns.forEach((btn) => {
      btn.addEventListener("click", closeEarlyAccessModal);
    });

    // Close when clicking outside the modal panel (on the backdrop)
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeEarlyAccessModal();
      }
    });

    // Option 1: Simple Work Email Form Submission
    if (form && emailInput && feedbackBox) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const emailVal = emailInput.value.trim();
        emailInput.classList.remove("input-error");

        if (!validateEmail(emailVal)) {
          emailInput.classList.add("input-error");
          feedbackBox.className =
            "mt-3 p-2.5 rounded-sm border border-[#EF4444] bg-[#EF4444]/10 text-xs text-[#EF4444]";
          feedbackBox.textContent = "Please enter a valid work email address.";
          feedbackBox.classList.remove("hidden");
          emailInput.focus();
          return;
        }

        // Instant success confirmation
        const successMsg = "Thank you! Our engineering team will review your application.";
        feedbackBox.className = "ea-success-banner";
        feedbackBox.textContent = successMsg;
        feedbackBox.classList.remove("hidden");
        showToast(successMsg, "success");
        form.reset();
      });
    }

    // Option 2: Direct Email Copy Button + "Copied!" Tooltip
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const emailToCopy = copyBtn.getAttribute("data-copy-email") || FOUNDER_EMAIL;
        copyTextToClipboard(emailToCopy).then(() => {
          if (copyTooltip) {
            copyTooltip.textContent = "Copied!";
            copyTooltip.classList.add("show");
            if (tooltipTimer) clearTimeout(tooltipTimer);
            tooltipTimer = setTimeout(() => {
              copyTooltip.classList.remove("show");
            }, 2200);
          }
        });
      });
    }

    window.VidSynthEarlyAccessModal = {
      open: openEarlyAccessModal,
      close: closeEarlyAccessModal
    };
  }

  // --------------------------------------------------------------------------
  // 6. Section-Level Early Access Form (Bottom of index.html)
  // --------------------------------------------------------------------------
  function initEarlyAccessSectionForm() {
    const forms = document.querySelectorAll("[data-early-access-form]");
    forms.forEach((form) => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();

        const nameInput = form.querySelector("[name='full_name']");
        const emailInput = form.querySelector("[name='work_email']");
        const companyInput = form.querySelector("[name='company']");
        const useCaseInput = form.querySelector("[name='use_case']");
        const statusBox = form.querySelector("[data-form-status]");

        const fullName = nameInput ? nameInput.value.trim() : "";
        const workEmail = emailInput ? emailInput.value.trim() : "";
        const company = companyInput ? companyInput.value.trim() : "";
        const useCase = useCaseInput ? useCaseInput.value.trim() : "";

        [nameInput, emailInput, companyInput, useCaseInput].forEach((el) => {
          if (el) el.classList.remove("input-error");
        });

        const errors = [];
        if (fullName.length < 2) {
          errors.push("Please enter your full name.");
          if (nameInput) nameInput.classList.add("input-error");
        }
        if (!validateEmail(workEmail)) {
          errors.push("Please provide a valid work email address.");
          if (emailInput) emailInput.classList.add("input-error");
        }
        if (company.length < 2) {
          errors.push("Please specify your studio, company, or organization.");
          if (companyInput) companyInput.classList.add("input-error");
        }
        if (!useCase) {
          errors.push("Please select your primary intended use case.");
          if (useCaseInput) useCaseInput.classList.add("input-error");
        }

        if (errors.length > 0) {
          if (statusBox) {
            statusBox.className =
              "mt-3 p-3 rounded-sm border border-[#EF4444] bg-[#EF4444]/10 text-xs text-[#F5F6FA]";
            statusBox.textContent = errors[0];
            statusBox.classList.remove("hidden");
          }
          showToast(errors[0], "error");
          return;
        }

        const successMsg = "Thank you! Our engineering team will review your application.";
        if (statusBox) {
          statusBox.className = "ea-success-banner";
          statusBox.textContent = successMsg;
          statusBox.classList.remove("hidden");
        }
        showToast(successMsg, "success");
        form.reset();
      });
    });
  }

  // --------------------------------------------------------------------------
  // 7. Global Keyboard Escape Handler
  // --------------------------------------------------------------------------
  function initGlobals() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        [
          "early-access-modal",
          "changelog-modal",
          "showcase-inspect-modal",
          "mobile-nav-drawer"
        ].forEach((id) => {
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
    initEarlyAccessModal();
    initEarlyAccessSectionForm();
    initGlobals();
  });
})();
