/**
 * VIDSYNTH AI — CORE APPLICATION CONTROLLER (js/app.js)
 * ============================================================================
 * Handles:
 * - Sticky Announcement Bar & Architecture/Changelog Modal
 * - Responsive Mobile Navigation Drawer & Accessible Keyboard Controls
 * - Smooth-Scroll Anchor Navigation (including Launch Studio -> #comparison-studio)
 * - Bento Showcase Video Hover Preview & Frame Inspection Modal
 * - Direct Founder Mailto Composer (no dummy/fake database submissions)
 */

(function initVidSynthApp() {
  const ANNOUNCEMENT_DISMISSED_KEY = "vidsynth_announcement_dismissed_v1";

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
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
        ? "READY"
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
  }

  // --------------------------------------------------------------------------
  // 3. Responsive Navigation & Smooth Scroll Anchor Handling
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
      if (link.id !== "mobile-menu-close-btn") {
        link.addEventListener("click", () => toggleMobileMenu(false));
      }
    });

    // Smooth-scroll handler for same-page hash anchors (e.g., #comparison-studio)
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", (e) => {
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
  }

  // --------------------------------------------------------------------------
  // 5. Direct Founder Mailto Inquiry Composer (Transparent Email Dispatch)
  // --------------------------------------------------------------------------
  function validateEmail(email) {
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(String(email).trim());
  }

  function initEarlyAccessMailtoComposer() {
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
          errors.push("Please provide a valid email address.");
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

        const subject = encodeURIComponent(`VidSynth Studio Early Access Request — ${company}`);
        const bodyLines = [
          "Hello Najla Afaf Ullaya (VidSynth AI Founder),",
          "",
          "We would like to request Early Access Pilot / Technical Evaluation information for VidSynth Studio.",
          "",
          `Full Name: ${fullName}`,
          `Work Email: ${workEmail}`,
          `Organization / Studio: ${company}`,
          `Primary Use Case: ${useCase}`,
          "",
          "Thank you."
        ];
        const body = encodeURIComponent(bodyLines.join("\r\n"));
        const mailtoUrl = `mailto:founder@vidsynth.app?subject=${subject}&body=${body}`;

        if (statusBox) {
          statusBox.className =
            "mt-3 p-3.5 rounded-sm border border-[#00F0FF] bg-[#00F0FF]/10 text-xs text-[#F5F6FA]";
          statusBox.innerHTML = `
            <div class="font-mono-tech text-[11px] text-[#00F0FF] uppercase mb-1">✓ OPENING EMAIL CLIENT TO FOUNDER@VIDSYNTH.APP</div>
            <p class="text-[#9296A3]">Your inquiry for <strong>${escapeHtml(company)}</strong> has been formatted for your default email client. If it did not open automatically, <a href="${mailtoUrl}" class="text-[#00F0FF] underline">click here to send via mailto:founder@vidsynth.app</a>.</p>
          `;
          statusBox.classList.remove("hidden");
        }

        window.location.href = mailtoUrl;
      });
    });
  }

  // --------------------------------------------------------------------------
  // 6. Global Keyboard Escape Handler
  // --------------------------------------------------------------------------
  function initGlobals() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        ["changelog-modal", "showcase-inspect-modal", "mobile-nav-drawer"].forEach((id) => {
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
    initEarlyAccessMailtoComposer();
    initGlobals();
  });
})();
