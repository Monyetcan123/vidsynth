/**
 * VIDSYNTH AI — COMPLETE APPLICATION, AUTHENTICATION, GUEST STUDIO & AI GENERATION CONTROLLER (js/app.js)
 * ========================================================================================================
 * Implements:
 * - Redesigned Authentication Modal (Official 4-Color Google Sign-In, Email/Password, Registration with
 *   2 Free Credits, Show/Hide Password Toggles, Forgot Password with 60s Resend Cooldown, & Create New
 *   Password Recovery Screen)
 * - Guest Preview & Draft Preservation (Explore Studio, configure prompts/settings, preview reference
 *   images locally without login, preserve draft across authentication, and view clearly labeled Demo Preview)
 * - Real AI Image Generation & Image-to-Image Editing Studio (Multipart FormData to /api/generate-or-edit,
 *   Dynamic Generate/Edit mode switching, Side-by-Side & Before/After Slider comparison, Download with true
 *   extension, Generate Again, Edit Again, Copy Prompt, Save to My Generations)
 * - User Dashboard, Profile Editor, Account Settings, Credit Ledger & My Generations Library
 * ========================================================================================================
 */

(function initVidSynthApp() {
  const AUTH_TOKEN_KEY = "vidsynth_ai_access_token";
  const GUEST_DRAFT_KEY = "vidsynth_guest_studio_draft_v1";
  const POST_LOGIN_REDIRECT_KEY = "vidsynth_post_login_redirect";
  const DEFAULT_CREDITS = 2;
  const FOUNDER_EMAIL = "founder@vidsynth.app";

  let supabase = null;
  let currentUser = null;
  let authToken = "";
  let creditTransactions = [];
  let userGenerations = [];
  let currentGenFilter = "all";
  let selectedStudioModel = "VS-CHAR-2.4";

  // Studio Reference Image & Output State
  let selectedReferenceFile = null;
  let selectedReferenceDataUrl = "";
  let uploadedReferenceAsset = null;
  let pendingAvatarFile = null;
  let currentGeneratedAssetUrl = null;
  let currentGeneratedExt = "jpg";
  let currentGeneratedRecordId = null;
  let currentBeforeImageUrl = "";
  let realtimeChannel = null;
  let pendingScrollToSandbox = false;

  try {
    authToken = localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch (_) {
    authToken = "";
  }

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

  function formatShortDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    } catch (_) {
      return "—";
    }
  }

  function getInitials(nameOrEmail) {
    const clean = String(nameOrEmail || "VS").trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  }

  function getAuthHeaders(extra = {}) {
    const headers = Object.assign({ "Content-Type": "application/json" }, extra);
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }
    return headers;
  }

  function copyTextToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(text);
    }
    return Promise.resolve();
  }

  function dataUrlToFile(dataUrl, filename = "reference-image.jpg") {
    try {
      const parts = String(dataUrl || "").split(",");
      if (parts.length < 2) return null;
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const binary = atob(parts[1]);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
      }
      return new File([array], filename, { type: mime });
    } catch (_) {
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // 1. Toast Notification System
  // --------------------------------------------------------------------------
  function showToast(message, type = "info") {
    let container = document.getElementById("vs-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "vs-toast-container";
      container.className =
        "fixed bottom-5 right-5 z-[220] flex flex-col gap-2 max-w-md w-full px-4 pointer-events-none";
      container.setAttribute("aria-live", "polite");
      document.body.appendChild(container);
    }

    const borderCol =
      type === "success"
        ? "border-l-[#3F6A4E]"
        : type === "error"
        ? "border-l-[#9E3B33]"
        : type === "warning"
        ? "border-l-[#94652D]"
        : "border-l-[#75624E]";

    const badgeText =
      type === "success"
        ? "VIDSYNTH AI • CONFIRMED"
        : type === "error"
        ? "VIDSYNTH AI • ERROR"
        : type === "warning"
        ? "VIDSYNTH AI • NOTICE"
        : "VIDSYNTH AI";

    const toast = document.createElement("div");
    toast.className = `pointer-events-auto bg-[#FAF8F3] border-l-4 ${borderCol} border border-[#C9BBA5] rounded-lg p-3.5 shadow-xl flex items-start justify-between gap-3`;
    toast.innerHTML = `
      <div class="flex flex-col gap-1">
        <span class="font-mono-tech text-[10px] tracking-wider uppercase text-[#75624E] font-semibold">${badgeText}</span>
        <p class="text-xs text-[#292720] leading-relaxed">${escapeHtml(message)}</p>
      </div>
      <button type="button" class="text-[#7D7263] hover:text-[#292720] text-xs font-mono-tech px-1" aria-label="Dismiss notification">✕</button>
    `;

    toast.querySelector("button").addEventListener("click", () => toast.remove());
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 5200);
  }

  window.VidSynthToast = { show: showToast };

  // --------------------------------------------------------------------------
  // 2. UI State Synchronization (Navbar, Credits, Dashboard, Settings)
  // --------------------------------------------------------------------------
  function clearGuestDashboardDOM() {
    const setElText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setElText("dash-profile-fullname", "—");
    setElText("dash-profile-username", "—");
    setElText("dash-profile-email", "—");
    setElText("dash-stat-credits", "—");
    setElText("dash-stat-generations", "0");
    setElText("dash-stat-verified", "—");
    setElText("dash-stat-created", "—");

    const dashAvatarPreview = document.getElementById("dash-avatar-preview");
    const dashAvatarInitials = document.getElementById("dash-avatar-initials");
    if (dashAvatarPreview) {
      dashAvatarPreview.src = "";
      dashAvatarPreview.classList.add("hidden");
    }
    if (dashAvatarInitials) {
      dashAvatarInitials.textContent = "VS";
      dashAvatarInitials.classList.remove("hidden");
    }

    ["dash-input-fullname", "dash-input-username", "dash-input-bio", "dash-input-country", "dash-input-website", "settings-new-email"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
  }

  function updateApplicationUI() {
    const remaining = currentUser
      ? Number(currentUser.remainingCredits ?? currentUser.credits ?? 0)
      : 0;
    const maxCredits = currentUser
      ? Number(currentUser.maxCredits ?? DEFAULT_CREDITS)
      : DEFAULT_CREDITS;
    const guestPromoLabel = "2 FREE CREDITS FOR NEW ACCOUNTS";
    const authCreditLabel = `CREDITS: ${remaining}`;

    const studioCounter = document.getElementById("studio-passes-counter");
    const navLabel = document.getElementById("nav-passes-label");
    const mobileLabel = document.getElementById("mobile-passes-label");
    const authBadge = document.getElementById("auth-modal-passes-badge");
    const billingDisplay = document.getElementById("billing-credits-display");
    const dropdownCreditsPill = document.getElementById("dropdown-credits-pill");

    if (studioCounter) studioCounter.textContent = currentUser ? authCreditLabel : guestPromoLabel;
    if (navLabel) navLabel.textContent = currentUser ? authCreditLabel : guestPromoLabel;
    if (mobileLabel) mobileLabel.textContent = currentUser ? authCreditLabel : guestPromoLabel;
    if (authBadge) {
      authBadge.textContent = currentUser ? authCreditLabel : guestPromoLabel;
    }
    if (billingDisplay) billingDisplay.textContent = currentUser ? authCreditLabel : "CREDITS: —";
    if (dropdownCreditsPill) dropdownCreditsPill.textContent = String(remaining);

    const guestActions = document.getElementById("nav-guest-actions");
    const userMenuWrapper = document.getElementById("nav-user-menu-wrapper");
    const navAuthDot = document.getElementById("nav-auth-dot");
    const studioAuthTriggerBtn = document.getElementById("studio-auth-trigger-btn");
    const studioLogoutBtn = document.getElementById("studio-logout-btn");
    const studioAuthHint = document.getElementById("studio-auth-hint");
    const dashGuestBanner = document.getElementById("dashboard-guest-banner");
    const dashTabsNav = document.getElementById("dashboard-tabs-nav");
    const dashAuthWorkspace = document.getElementById("dashboard-authenticated-workspace");
    const mobileUserStatus = document.getElementById("mobile-user-status");
    const mobileAuthLinks = document.getElementById("mobile-authenticated-links");
    const mobileGuestAuthBtns = document.getElementById("mobile-guest-auth-buttons");

    if (currentUser) {
      if (guestActions) guestActions.classList.add("hidden");
      if (userMenuWrapper) userMenuWrapper.classList.remove("hidden");
      if (dashGuestBanner) dashGuestBanner.classList.add("hidden");
      if (dashTabsNav) dashTabsNav.classList.remove("hidden");
      if (dashAuthWorkspace) dashAuthWorkspace.classList.remove("hidden");
      if (mobileAuthLinks) mobileAuthLinks.classList.remove("hidden");
      if (mobileGuestAuthBtns) mobileGuestAuthBtns.classList.add("hidden");

      if (navAuthDot) {
        navAuthDot.className =
          remaining > 0 ? "w-2 h-2 rounded-full bg-[#3F6A4E]" : "w-2 h-2 rounded-full bg-[#94652D]";
      }

      const displayName = currentUser.full_name || currentUser.name || currentUser.email;
      const usernameHandle = currentUser.username ? `@${currentUser.username}` : displayName;
      const initials = getInitials(displayName);

      const navAvatarImg = document.getElementById("nav-user-avatar-img");
      const navAvatarInitials = document.getElementById("nav-user-avatar-initials");
      const navUsername = document.getElementById("nav-user-username");
      const dropFullname = document.getElementById("dropdown-user-fullname");
      const dropEmail = document.getElementById("dropdown-user-email");

      if (navUsername) navUsername.textContent = usernameHandle;
      if (dropFullname) dropFullname.textContent = displayName;
      if (dropEmail) dropEmail.textContent = currentUser.email || "";

      if (currentUser.avatar_url) {
        if (navAvatarImg) {
          navAvatarImg.src = currentUser.avatar_url;
          navAvatarImg.classList.remove("hidden");
        }
        if (navAvatarInitials) navAvatarInitials.classList.add("hidden");
      } else {
        if (navAvatarImg) navAvatarImg.classList.add("hidden");
        if (navAvatarInitials) {
          navAvatarInitials.textContent = initials;
          navAvatarInitials.classList.remove("hidden");
        }
      }

      if (studioAuthTriggerBtn) {
        studioAuthTriggerBtn.textContent = usernameHandle;
      }
      if (studioLogoutBtn) {
        studioLogoutBtn.classList.remove("hidden");
      }
      if (mobileUserStatus) {
        mobileUserStatus.textContent = usernameHandle;
      }
      if (studioAuthHint) {
        if (remaining > 0) {
          studioAuthHint.innerHTML = `Signed in as <strong class="text-[#292720]">${escapeHtml(
            usernameHandle
          )}</strong> • <strong class="text-[#292720]">CREDITS: ${remaining}</strong>`;
        } else {
          studioAuthHint.innerHTML = `CREDITS: 0 • <button type="button" data-open-credits-exhausted class="underline font-semibold text-[#94652D]">Request Additional Allocation</button>`;
        }
      }

      populateDashboardProfileUI();
    } else {
      if (guestActions) guestActions.classList.remove("hidden");
      if (userMenuWrapper) userMenuWrapper.classList.add("hidden");
      if (dashGuestBanner) dashGuestBanner.classList.remove("hidden");
      if (dashTabsNav) dashTabsNav.classList.add("hidden");
      if (dashAuthWorkspace) dashAuthWorkspace.classList.add("hidden");
      if (mobileAuthLinks) mobileAuthLinks.classList.add("hidden");
      if (mobileGuestAuthBtns) mobileGuestAuthBtns.classList.remove("hidden");

      if (navAuthDot) navAuthDot.className = "w-2 h-2 rounded-full bg-[#A58D72]";
      if (studioAuthTriggerBtn) studioAuthTriggerBtn.textContent = "Sign In / Create Account";
      if (studioLogoutBtn) studioLogoutBtn.classList.add("hidden");
      if (mobileUserStatus) mobileUserStatus.textContent = "GUEST PREVIEW";
      if (studioAuthHint) {
        studioAuthHint.innerHTML =
          'Guest Preview Active • Sign in before generating (<strong class="text-[#292720]">2 free credits</strong> for new accounts).';
      }

      clearGuestDashboardDOM();
    }
  }

  function populateDashboardProfileUI() {
    if (!currentUser) return;
    const displayName = currentUser.full_name || currentUser.name || "Creator";
    const initials = getInitials(displayName);
    const remaining = Number(currentUser.remainingCredits ?? currentUser.credits ?? 0);

    const dashAvatarPreview = document.getElementById("dash-avatar-preview");
    const dashAvatarInitials = document.getElementById("dash-avatar-initials");
    if (currentUser.avatar_url) {
      if (dashAvatarPreview) {
        dashAvatarPreview.src = currentUser.avatar_url;
        dashAvatarPreview.classList.remove("hidden");
      }
      if (dashAvatarInitials) dashAvatarInitials.classList.add("hidden");
    } else {
      if (dashAvatarPreview) dashAvatarPreview.classList.add("hidden");
      if (dashAvatarInitials) {
        dashAvatarInitials.textContent = initials;
        dashAvatarInitials.classList.remove("hidden");
      }
    }

    const setElText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setElText("dash-profile-fullname", displayName);
    setElText("dash-profile-username", currentUser.username ? `@${currentUser.username}` : "@creator");
    setElText("dash-profile-email", currentUser.email || "");
    setElText("dash-stat-credits", `${remaining} / ${DEFAULT_CREDITS}`);
    setElText("dash-stat-generations", String(currentUser.total_generations || userGenerations.length || 0));
    setElText("dash-stat-verified", currentUser.is_verified ? "Verified Account" : "Active Account");
    setElText("dash-stat-created", formatShortDate(currentUser.created_at));

    const inputFullname = document.getElementById("dash-input-fullname");
    const inputUsername = document.getElementById("dash-input-username");
    const inputBio = document.getElementById("dash-input-bio");
    const inputCountry = document.getElementById("dash-input-country");
    const inputWebsite = document.getElementById("dash-input-website");
    const settingsEmail = document.getElementById("settings-new-email");

    if (inputFullname) inputFullname.value = currentUser.full_name || "";
    if (inputUsername) inputUsername.value = currentUser.username || "";
    if (inputBio) inputBio.value = currentUser.bio || "";
    if (inputCountry) inputCountry.value = currentUser.country || "";
    if (inputWebsite) inputWebsite.value = currentUser.website || "";
    if (settingsEmail) settingsEmail.value = currentUser.email || "";

    const priv = currentUser.privacy_settings || {};
    const notif = currentUser.notification_settings || {};
    const pProf = document.getElementById("priv-profile-visibility");
    const pHist = document.getElementById("priv-history-visibility");
    const pAsset = document.getElementById("priv-asset-visibility");
    const pOpt = document.getElementById("priv-data-optout");
    if (pProf && priv.profile_visibility) pProf.value = priv.profile_visibility;
    if (pHist && priv.history_visibility) pHist.value = priv.history_visibility;
    if (pAsset && priv.default_asset_visibility) pAsset.value = priv.default_asset_visibility;
    if (pOpt && typeof priv.data_privacy_opt_out === "boolean") pOpt.checked = priv.data_privacy_opt_out;

    const nEmail = document.getElementById("notif-email");
    const nGen = document.getElementById("notif-generation");
    const nAnn = document.getElementById("notif-announcements");
    if (nEmail && typeof notif.email_notifications === "boolean") nEmail.checked = notif.email_notifications;
    if (nGen && typeof notif.generation_completion === "boolean") nGen.checked = notif.generation_completion;
    if (nAnn && typeof notif.product_announcements === "boolean") nAnn.checked = notif.product_announcements;

    setElText("sec-session-last-login", formatShortDate(new Date().toISOString()));

    const activityList = document.getElementById("dash-recent-activity-list");
    if (activityList) {
      const items = [];
      userGenerations.slice(0, 3).forEach((g) => {
        items.push(
          `<li class="py-1.5 px-2.5 rounded bg-[#FAF8F3] border border-[#D5C9B6] flex items-center justify-between gap-2">
            <span class="truncate">Generated: <strong>${escapeHtml(g.title || "Visual Synthesis")}</strong></span>
            <span class="font-mono-tech text-[10px] text-[#75624E] shrink-0">${formatShortDate(g.created_at)}</span>
          </li>`
        );
      });
      creditTransactions.slice(0, 3).forEach((tx) => {
        items.push(
          `<li class="py-1.5 px-2.5 rounded bg-[#FAF8F3] border border-[#D5C9B6] flex items-center justify-between gap-2">
            <span class="truncate">${escapeHtml(tx.description)}</span>
            <span class="font-mono-tech text-[10px] ${
              tx.amount > 0 ? "text-[#3F6A4E]" : "text-[#94652D]"
            } shrink-0">${tx.amount > 0 ? `+${tx.amount}` : tx.amount} credit</span>
          </li>`
        );
      });
      activityList.innerHTML =
        items.length > 0
          ? items.slice(0, 4).join("")
          : `<li class="py-1.5 px-2.5 rounded bg-[#FAF8F3] border border-[#D5C9B6]">Account initialized with 2 Free Credits.</li>`;
    }

    renderCreditTransactionsTable();
  }

  function renderCreditTransactionsTable() {
    const tbody = document.getElementById("billing-transactions-tbody");
    if (!tbody) return;
    if (!currentUser || creditTransactions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="py-4 px-3 text-center text-[#75624E]">No credit transactions recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = creditTransactions
      .map(
        (tx) => `
      <tr>
        <td class="py-2.5 px-3 font-mono-tech text-[11px] text-[#75624E]">${escapeHtml(
          formatShortDate(tx.created_at)
        )}</td>
        <td class="py-2.5 px-3 font-mono-tech text-[11px] uppercase">${escapeHtml(
          tx.transaction_type || "ledger"
        )}</td>
        <td class="py-2.5 px-3">${escapeHtml(tx.description || "")}</td>
        <td class="py-2.5 px-3 text-right font-mono-tech font-bold ${
          tx.amount > 0 ? "text-[#3F6A4E]" : "text-[#94652D]"
        }">${tx.amount > 0 ? `+${tx.amount}` : tx.amount}</td>
      </tr>
    `
      )
      .join("");
  }

  // --------------------------------------------------------------------------
  // 3. Guest Studio Draft Preservation & Restoration
  // --------------------------------------------------------------------------
  function saveGuestStudioDraft() {
    try {
      const promptInput = document.getElementById("studio-prompt-input");
      const addInstructionsInput = document.getElementById("studio-additional-instructions");
      const styleSelect = document.getElementById("studio-style-preset");
      const aspectSelect = document.getElementById("studio-aspect-ratio");
      const widthSelect = document.getElementById("studio-width-input");
      const heightSelect = document.getElementById("studio-height-input");
      const guidanceInput = document.getElementById("studio-guidance-input");
      const seedInput = document.getElementById("studio-seed-input");

      const draft = {
        prompt: (promptInput?.value || "").trim(),
        description: (addInstructionsInput?.value || "").trim(),
        stylePreset: styleSelect?.value || "Cinematic Editorial Realism",
        aspectRatio: aspectSelect?.value || "1:1",
        width: widthSelect?.value || "1024",
        height: heightSelect?.value || "1024",
        guidance: guidanceInput?.value || "3.5",
        seed: seedInput?.value || "",
        processingMode: selectedStudioModel,
        referenceDataUrl: selectedReferenceDataUrl || "",
        referenceFilename: selectedReferenceFile ? selectedReferenceFile.name : "",
        savedAt: Date.now()
      };

      sessionStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft));
    } catch (_) {}
  }

  function restoreGuestStudioDraftAfterAuth() {
    try {
      const raw = sessionStorage.getItem(GUEST_DRAFT_KEY);
      if (!raw) return false;
      const draft = JSON.parse(raw);
      sessionStorage.removeItem(GUEST_DRAFT_KEY);
      if (!draft || (!draft.prompt && !draft.referenceDataUrl)) return false;

      const promptInput = document.getElementById("studio-prompt-input");
      const addInstructionsInput = document.getElementById("studio-additional-instructions");
      const styleSelect = document.getElementById("studio-style-preset");
      const aspectSelect = document.getElementById("studio-aspect-ratio");
      const widthSelect = document.getElementById("studio-width-input");
      const heightSelect = document.getElementById("studio-height-input");
      const guidanceInput = document.getElementById("studio-guidance-input");
      const guidanceVal = document.getElementById("studio-guidance-val");
      const seedInput = document.getElementById("studio-seed-input");

      if (promptInput && draft.prompt) {
        promptInput.value = draft.prompt;
        promptInput.dispatchEvent(new Event("input"));
      }
      if (addInstructionsInput && draft.description) {
        addInstructionsInput.value = draft.description;
      }
      if (styleSelect && draft.stylePreset) styleSelect.value = draft.stylePreset;
      if (aspectSelect && draft.aspectRatio) aspectSelect.value = draft.aspectRatio;
      if (widthSelect && draft.width) widthSelect.value = draft.width;
      if (heightSelect && draft.height) heightSelect.value = draft.height;
      if (guidanceInput && draft.guidance) {
        guidanceInput.value = draft.guidance;
        if (guidanceVal) guidanceVal.textContent = draft.guidance;
      }
      if (seedInput && draft.seed) seedInput.value = draft.seed;

      if (draft.referenceDataUrl && !selectedReferenceFile) {
        const restoredFile = dataUrlToFile(
          draft.referenceDataUrl,
          draft.referenceFilename || "reference-image.jpg"
        );
        if (restoredFile && typeof window._attachStudioReferenceFile === "function") {
          window._attachStudioReferenceFile(restoredFile);
        }
      }

      const restoredBanner = document.getElementById("studio-restored-draft-banner");
      if (restoredBanner) {
        restoredBanner.classList.remove("hidden");
      }

      document.getElementById("interactive-sandbox")?.scrollIntoView({ behavior: "smooth" });
      return true;
    } catch (_) {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // 4. Load Profile, Credits & Generations from Backend + Realtime
  // --------------------------------------------------------------------------
  async function syncProfileAndAssetsFromBackend() {
    if (!authToken) {
      currentUser = null;
      updateApplicationUI();
      return;
    }

    try {
      const res = await fetch("/api/profile", {
        method: "GET",
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        if (res.status === 401) {
          handleSessionExpired();
        }
        return;
      }
      const data = await res.json();
      if (data && data.authenticated && data.user) {
        currentUser = data.user;
        creditTransactions = Array.isArray(data.creditTransactions) ? data.creditTransactions : [];
        if (Array.isArray(data.recentGenerations)) {
          userGenerations = data.recentGenerations;
        }
        updateApplicationUI();
        await fetchUserGenerations();
        setupSupabaseRealtimeSubscription();
      } else {
        currentUser = null;
        updateApplicationUI();
      }
    } catch (_) {
      updateApplicationUI();
    }
  }

  function handleSessionExpired() {
    authToken = "";
    currentUser = null;
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch (_) {}
    updateApplicationUI();
  }

  function setupSupabaseRealtimeSubscription() {
    if (!supabase || !currentUser || realtimeChannel) return;
    try {
      realtimeChannel = supabase
        .channel(`vidsynth-user-${currentUser.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "generations",
            filter: `user_id=eq.${currentUser.id}`
          },
          () => {
            fetchUserGenerations();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
            filter: `id=eq.${currentUser.id}`
          },
          (payload) => {
            if (payload && payload.new && currentUser) {
              currentUser.credits = payload.new.credits;
              currentUser.remainingCredits = payload.new.credits;
              currentUser.total_generations = payload.new.total_generations;
              updateApplicationUI();
            }
          }
        )
        .subscribe();
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 5. Complete Authentication System (Google Sign-In, Email/Password, Dedicated Recovery Redirects)
  // --------------------------------------------------------------------------
  function completePostAuthNavigation() {
    const restoredDraft = restoreGuestStudioDraftAfterAuth();
    if (restoredDraft) return;

    try {
      const savedTab = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
      if (savedTab) {
        sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
        switchDashboardTab(savedTab, true);
        return;
      }
    } catch (_) {}

    if (pendingScrollToSandbox) {
      pendingScrollToSandbox = false;
      document.getElementById("interactive-sandbox")?.scrollIntoView({ behavior: "smooth" });
    } else if (window.location.pathname === "/profile") {
      switchDashboardTab("overview", true);
    }
  }

  function openAuthModal(tab = "login", customSubtitle = "") {
    if (tab === "forgot") {
      window.location.href = "forgot-password.html";
      return;
    }
    if (tab === "reset-password") {
      window.location.href = "reset-password.html" + window.location.search + window.location.hash;
      return;
    }
    const modal = document.getElementById("auth-modal");
    const subtitleEl = document.getElementById("auth-modal-subtitle");
    if (!modal) return;
    switchAuthTab(tab);
    if (customSubtitle && subtitleEl) {
      subtitleEl.textContent = customSubtitle;
    }
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeAuthModal() {
    const modal = document.getElementById("auth-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    document.body.style.overflow = "";
  }

  function switchAuthTab(tab) {
    if (tab === "forgot") {
      window.location.href = "forgot-password.html";
      return;
    }
    if (tab === "reset-password") {
      window.location.href = "reset-password.html" + window.location.search + window.location.hash;
      return;
    }

    const loginTab = document.getElementById("auth-tab-login");
    const registerTab = document.getElementById("auth-tab-register");
    const tabsBar = document.getElementById("auth-tabs-bar");

    const loginForm = document.getElementById("auth-login-form");
    const registerForm = document.getElementById("auth-register-form");
    const oauthRow = document.getElementById("auth-oauth-row");
    const oauthDivider = document.getElementById("auth-oauth-divider");
    const modalTitle = document.getElementById("auth-modal-title");
    const subtitleEl = document.getElementById("auth-modal-subtitle");
    const feedback = document.getElementById("auth-modal-feedback");

    if (feedback) feedback.classList.add("hidden");

    [loginTab, registerTab].forEach((b) => b && b.classList.remove("active"));
    [loginForm, registerForm].forEach((f) => f && f.classList.add("hidden"));

    if (tab === "register") {
      if (tabsBar) tabsBar.classList.remove("hidden");
      if (registerTab) registerTab.classList.add("active");
      if (registerForm) registerForm.classList.remove("hidden");
      if (oauthRow) oauthRow.classList.remove("hidden");
      if (oauthDivider) oauthDivider.classList.remove("hidden");
      if (modalTitle) modalTitle.textContent = "Welcome to VidSynth AI";
      if (subtitleEl) {
        subtitleEl.textContent =
          "Create your account to receive 2 complimentary credits and start creating.";
      }
    } else {
      if (tabsBar) tabsBar.classList.remove("hidden");
      if (loginTab) loginTab.classList.add("active");
      if (loginForm) loginForm.classList.remove("hidden");
      if (oauthRow) oauthRow.classList.remove("hidden");
      if (oauthDivider) oauthDivider.classList.remove("hidden");
      if (modalTitle) modalTitle.textContent = "Welcome to VidSynth AI";
      if (subtitleEl) {
        subtitleEl.textContent =
          "Sign in to access your creative workspace and continue creating.";
      }
    }
  }

  function showAuthFeedback(msg, isError = false) {
    const feedback = document.getElementById("auth-modal-feedback");
    if (!feedback) return;
    feedback.textContent = msg;
    feedback.className = isError
      ? "p-3 rounded-lg text-xs font-medium bg-[#F9EBE9] text-[#9E3B33] border border-[#9E3B33]"
      : "p-3 rounded-lg text-xs font-medium bg-[#EBF2EC] text-[#3F6A4E] border border-[#3F6A4E]";
    feedback.classList.remove("hidden");
  }

  function checkUrlForPasswordRecoveryOrOAuth() {
    const searchParams = new URLSearchParams(window.location.search);
    const hashStr = window.location.hash ? window.location.hash.slice(1) : "";
    const hashParams = new URLSearchParams(hashStr);

    const authAction = searchParams.get("auth_action");
    const authModalParam = searchParams.get("auth_modal");
    const hashType = hashParams.get("type");
    const hashError = hashParams.get("error_description") || searchParams.get("error_description");

    if (authAction === "reset_password" || hashType === "recovery") {
      window.location.replace("/reset-password" + window.location.search + window.location.hash);
      return;
    }

    if (hashError) {
      window.location.replace("/reset-password" + window.location.search + window.location.hash);
      return;
    }

    if (authModalParam === "login" || authModalParam === "register") {
      openAuthModal(authModalParam);
      try {
        window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
      } catch (_) {}
      return;
    }

    if (window.location.pathname === "/profile") {
      if (!authToken) {
        try {
          sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, "overview");
        } catch (_) {}
        document.getElementById("user-dashboard")?.scrollIntoView({ behavior: "smooth" });
        openAuthModal("login", "Please sign in to access your personal VidSynth AI profile.");
      } else {
        setTimeout(() => switchDashboardTab("overview", true), 250);
      }
    }
  }

  function initSupabaseAuthentication() {
    if (window.VidSynthSupabase && window.VidSynthSupabase.isConfigured()) {
      supabase = window.VidSynthSupabase.getClient();
    }

    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (data && data.session && data.session.access_token) {
          authToken = data.session.access_token;
          try {
            localStorage.setItem(AUTH_TOKEN_KEY, authToken);
          } catch (_) {}
          syncProfileAndAssetsFromBackend().then(() => {
            completePostAuthNavigation();
          });
        } else if (authToken) {
          syncProfileAndAssetsFromBackend().then(() => {
            completePostAuthNavigation();
          });
        }
      });

      supabase.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          window.location.replace("/reset-password" + window.location.search + window.location.hash);
          return;
        }
        if (session && session.access_token) {
          authToken = session.access_token;
          try {
            localStorage.setItem(AUTH_TOKEN_KEY, authToken);
          } catch (_) {}
          syncProfileAndAssetsFromBackend().then(() => {
            completePostAuthNavigation();
          });
        } else if (event === "SIGNED_OUT") {
          handleSessionExpired();
        }
      });
    } else if (authToken) {
      syncProfileAndAssetsFromBackend().then(() => {
        completePostAuthNavigation();
      });
    }

    checkUrlForPasswordRecoveryOrOAuth();

    // Show / Hide Password Toggles & Auth Modal Triggers
    document.addEventListener("click", (e) => {
      const toggleBtn = e.target.closest("[data-toggle-password]");
      if (toggleBtn) {
        e.preventDefault();
        const targetId = toggleBtn.getAttribute("data-toggle-password");
        const inputEl = targetId ? document.getElementById(targetId) : null;
        if (!inputEl) return;
        const isPassword = inputEl.type === "password";
        inputEl.type = isPassword ? "text" : "password";
        toggleBtn.textContent = isPassword ? "Hide" : "Show";
      }

      const authTrigger = e.target.closest("[data-open-auth-modal]");
      if (authTrigger) {
        e.preventDefault();
        const mobileDrawer = document.getElementById("mobile-nav-drawer");
        if (mobileDrawer) mobileDrawer.classList.add("hidden");
        const mode = authTrigger.getAttribute("data-open-auth-modal") || "login";
        openAuthModal(mode === "register" ? "register" : "login");
      }
    });

    document.querySelectorAll("[data-close-auth-modal]").forEach((btn) => {
      btn.addEventListener("click", closeAuthModal);
    });

    const authModal = document.getElementById("auth-modal");
    if (authModal) {
      authModal.addEventListener("click", (e) => {
        if (e.target === authModal) closeAuthModal();
      });
    }

    document.getElementById("auth-tab-login")?.addEventListener("click", () => switchAuthTab("login"));
    document.getElementById("auth-tab-register")?.addEventListener("click", () => switchAuthTab("register"));

    const forgotLink = document.getElementById("auth-forgot-link");
    if (forgotLink) {
      forgotLink.addEventListener("click", (e) => {
        e.preventDefault();
        const email = (document.getElementById("auth-login-email")?.value || "").trim();
        const targetUrl = email
          ? `forgot-password.html?email=${encodeURIComponent(email)}`
          : "forgot-password.html";
        window.location.href = targetUrl;
      });
    }

    // Official Google Sign-In Flow
    async function triggerGoogleOAuth() {
      const googleBtn = document.getElementById("auth-oauth-google");
      if (!supabase) {
        showAuthFeedback("Authentication client is initializing. Please refresh and try again.", true);
        return;
      }
      saveGuestStudioDraft();
      if (googleBtn) googleBtn.disabled = true;
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: window.location.origin + window.location.pathname
          }
        });
        if (error) {
          showAuthFeedback(error.message || "Google sign-in could not be completed.", true);
        }
      } catch (err) {
        showAuthFeedback(err.message || "Could not initiate Google sign-in.", true);
      } finally {
        if (googleBtn) googleBtn.disabled = false;
      }
    }

    document.getElementById("auth-oauth-google")?.addEventListener("click", triggerGoogleOAuth);

    // Sign In Form (Email + Password)
    const loginForm = document.getElementById("auth-login-form");
    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = (document.getElementById("auth-login-email")?.value || "").trim();
        const password = document.getElementById("auth-login-password")?.value || "";
        const submitBtn = document.getElementById("auth-login-submit");

        if (!validateEmail(email)) {
          showAuthFeedback("Please enter a valid email address.", true);
          return;
        }
        if (!password) {
          showAuthFeedback("Please enter your password.", true);
          return;
        }

        if (submitBtn) submitBtn.disabled = true;
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
          });
          const data = await res.json();
          if (!res.ok) {
            showAuthFeedback(data.message || "Invalid email or password.", true);
            return;
          }

          authToken = data.token || "";
          try {
            localStorage.setItem(AUTH_TOKEN_KEY, authToken);
          } catch (_) {}

          if (supabase && data.session) {
            try {
              await supabase.auth.setSession({
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token
              });
            } catch (_) {}
          }

          currentUser = data.user;
          updateApplicationUI();
          closeAuthModal();
          showToast(
            `Signed in! CREDITS: ${currentUser.remainingCredits}`,
            "success"
          );
          await syncProfileAndAssetsFromBackend();
          completePostAuthNavigation();
        } catch (_) {
          showAuthFeedback("Network error while signing in. Please try again.", true);
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    // Create Account Form
    const registerForm = document.getElementById("auth-register-form");
    if (registerForm) {
      registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fullName = (document.getElementById("auth-register-name")?.value || "").trim();
        const email = (document.getElementById("auth-register-email")?.value || "").trim();
        const password = document.getElementById("auth-register-password")?.value || "";
        const confirmPassword = document.getElementById("auth-register-confirm")?.value || "";
        const termsAccepted = Boolean(document.getElementById("auth-register-terms")?.checked);
        const submitBtn = document.getElementById("auth-register-submit");

        if (!validateEmail(email)) {
          showAuthFeedback("Please enter a valid email address.", true);
          return;
        }
        if (password.length < 8) {
          showAuthFeedback("Password must be at least 8 characters long.", true);
          return;
        }
        if (password !== confirmPassword) {
          showAuthFeedback("Passwords do not match. Please confirm your password.", true);
          return;
        }
        if (!termsAccepted) {
          showAuthFeedback("Please agree to the Terms of Service and Privacy Policy.", true);
          return;
        }

        if (submitBtn) submitBtn.disabled = true;
        try {
          const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fullName, email, password, confirmPassword, termsAccepted: true })
          });
          const data = await res.json();
          if (!res.ok) {
            showAuthFeedback(data.message || "Could not create account.", true);
            return;
          }

          if (data.requiresEmailConfirmation) {
            showAuthFeedback(
              data.message ||
                "Account created! Please check your email inbox to verify your account before signing in.",
              false
            );
            showToast("Account created! Please check your email for verification.", "success");
            registerForm.reset();
            return;
          }

          authToken = data.token || "";
          try {
            localStorage.setItem(AUTH_TOKEN_KEY, authToken);
          } catch (_) {}

          if (supabase && data.session) {
            try {
              await supabase.auth.setSession({
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token
              });
            } catch (_) {}
          }

          currentUser = data.user;
          updateApplicationUI();
          closeAuthModal();
          showToast("Welcome to VidSynth AI! 2 Free Credits activated.", "success");
          await syncProfileAndAssetsFromBackend();
          completePostAuthNavigation();
        } catch (_) {
          showAuthFeedback("Network error during registration. Please try again.", true);
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    // Sign Out Handlers
    async function performLogout() {
      try {
        if (supabase) await supabase.auth.signOut();
      } catch (_) {}
      try {
        await fetch("/api/auth/logout", { method: "POST", headers: getAuthHeaders() });
      } catch (_) {}
      handleSessionExpired();
      const dropdown = document.getElementById("nav-profile-dropdown");
      if (dropdown) dropdown.classList.add("hidden");
      const mobileDrawer = document.getElementById("mobile-nav-drawer");
      if (mobileDrawer) mobileDrawer.classList.add("hidden");
      document.body.style.overflow = "";
      showToast("Signed out of VidSynth AI.", "info");
    }

    document.getElementById("studio-logout-btn")?.addEventListener("click", performLogout);
    document.getElementById("nav-dropdown-logout-btn")?.addEventListener("click", performLogout);
    document.getElementById("mobile-logout-btn")?.addEventListener("click", performLogout);
    document.getElementById("sec-logout-btn")?.addEventListener("click", performLogout);
  }

  // --------------------------------------------------------------------------
  // 6. Navbar Dropdown, Protected Dashboard Tabs & Account Settings
  // --------------------------------------------------------------------------
  function switchDashboardTab(tabName, scrollIntoView = false) {
    if (!currentUser) {
      try {
        sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, tabName || "overview");
      } catch (_) {}
      if (scrollIntoView) {
        document.getElementById("user-dashboard")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      openAuthModal(
        "login",
        "Sign in to access your profile, saved generations, and account workspace."
      );
      return;
    }

    const normalized = tabName === "assets" ? "generations" : tabName;
    document.querySelectorAll("[data-dashboard-tab-btn]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-dashboard-tab-btn") === normalized);
    });
    document.querySelectorAll("[data-dashboard-panel]").forEach((panel) => {
      panel.classList.toggle("hidden", panel.getAttribute("data-dashboard-panel") !== normalized);
    });
    if (scrollIntoView) {
      document.getElementById("user-dashboard")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function initDashboardAndSettings() {
    const profileTrigger = document.getElementById("nav-profile-trigger");
    const profileDropdown = document.getElementById("nav-profile-dropdown");

    if (profileTrigger && profileDropdown) {
      profileTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!currentUser) return;
        const isHidden = profileDropdown.classList.contains("hidden");
        profileDropdown.classList.toggle("hidden", !isHidden);
        profileTrigger.setAttribute("aria-expanded", String(isHidden));
      });

      document.addEventListener("click", (e) => {
        if (!profileDropdown.contains(e.target) && !profileTrigger.contains(e.target)) {
          profileDropdown.classList.add("hidden");
          profileTrigger.setAttribute("aria-expanded", "false");
        }
      });
    }

    document.querySelectorAll("[data-open-dashboard-tab]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const targetTab = el.getAttribute("data-open-dashboard-tab") || "overview";
        if (profileDropdown) profileDropdown.classList.add("hidden");
        const mobileDrawer = document.getElementById("mobile-nav-drawer");
        if (mobileDrawer && !mobileDrawer.classList.contains("hidden")) {
          mobileDrawer.classList.add("hidden");
          document.body.style.overflow = "";
        }
        switchDashboardTab(targetTab, true);
      });
    });

    document.querySelectorAll("[data-dashboard-tab-btn]").forEach((btn) => {
      btn.addEventListener("click", () => {
        switchDashboardTab(btn.getAttribute("data-dashboard-tab-btn") || "overview", false);
      });
    });

    document.querySelectorAll("[data-settings-subtab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sub = btn.getAttribute("data-settings-subtab");
        document.querySelectorAll("[data-settings-subtab]").forEach((b) =>
          b.classList.toggle("active", b === btn)
        );
        document.querySelectorAll("[data-settings-panel]").forEach((p) =>
          p.classList.toggle("hidden", p.getAttribute("data-settings-panel") !== sub)
        );
      });
    });

    // Avatar Upload
    const avatarFileInput = document.getElementById("dash-avatar-file-input");
    const avatarSelectBtn = document.getElementById("dash-avatar-select-btn");
    const avatarUploadBtn = document.getElementById("dash-avatar-upload-btn");
    const avatarPreview = document.getElementById("dash-avatar-preview");
    const avatarInitials = document.getElementById("dash-avatar-initials");

    if (avatarSelectBtn && avatarFileInput) {
      avatarSelectBtn.addEventListener("click", () => {
        if (!currentUser) {
          openAuthModal("login", "Sign in to upload a profile picture.");
          return;
        }
        avatarFileInput.click();
      });

      avatarFileInput.addEventListener("change", () => {
        const file = avatarFileInput.files && avatarFileInput.files[0];
        if (!file) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          showToast("Please select a JPG, PNG, or WebP image.", "warning");
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          showToast("Avatar image must be under 5 MB.", "warning");
          return;
        }
        pendingAvatarFile = file;
        const reader = new FileReader();
        reader.onload = () => {
          if (avatarPreview) {
            avatarPreview.src = String(reader.result);
            avatarPreview.classList.remove("hidden");
          }
          if (avatarInitials) avatarInitials.classList.add("hidden");
          if (avatarUploadBtn) avatarUploadBtn.classList.remove("hidden");
        };
        reader.readAsDataURL(file);
      });
    }

    if (avatarUploadBtn) {
      avatarUploadBtn.addEventListener("click", async () => {
        if (!pendingAvatarFile || !currentUser) return;
        avatarUploadBtn.disabled = true;
        try {
          const reader = new FileReader();
          const base64Data = await new Promise((resolve, reject) => {
            reader.onload = () => {
              const s = String(reader.result || "");
              resolve(s.slice(s.indexOf(",") + 1));
            };
            reader.onerror = reject;
            reader.readAsDataURL(pendingAvatarFile);
          });

          const res = await fetch("/api/storage/avatar", {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({
              mimeType: pendingAvatarFile.type,
              base64Data
            })
          });
          const data = await res.json();
          if (!res.ok) {
            showToast(data.message || "Avatar upload failed.", "error");
            return;
          }
          currentUser = data.user;
          pendingAvatarFile = null;
          avatarUploadBtn.classList.add("hidden");
          updateApplicationUI();
          showToast("Profile picture updated.", "success");
        } catch (_) {
          showToast("Error uploading profile picture.", "error");
        } finally {
          avatarUploadBtn.disabled = false;
        }
      });
    }

    // Profile Editor Form Submission
    const profileForm = document.getElementById("dash-profile-form");
    if (profileForm) {
      profileForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentUser) {
          openAuthModal("login", "Sign in to edit your profile.");
          return;
        }
        const saveBtn = document.getElementById("dash-profile-save-btn");
        if (saveBtn) saveBtn.disabled = true;
        try {
          const res = await fetch("/api/profile", {
            method: "PATCH",
            headers: getAuthHeaders(),
            body: JSON.stringify({
              full_name: document.getElementById("dash-input-fullname")?.value || "",
              username: document.getElementById("dash-input-username")?.value || "",
              bio: document.getElementById("dash-input-bio")?.value || "",
              country: document.getElementById("dash-input-country")?.value || "",
              website: document.getElementById("dash-input-website")?.value || ""
            })
          });
          const data = await res.json();
          if (!res.ok) {
            showToast(data.message || "Could not update profile.", "error");
            return;
          }
          currentUser = data.user;
          updateApplicationUI();
          showToast("Profile updated.", "success");
        } catch (_) {
          showToast("Network error while saving profile.", "error");
        } finally {
          if (saveBtn) saveBtn.disabled = false;
        }
      });
    }

    // General Settings: Update Email
    document.getElementById("settings-email-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUser || !supabase) {
        openAuthModal("login");
        return;
      }
      const newEmail = (document.getElementById("settings-new-email")?.value || "").trim();
      if (!validateEmail(newEmail)) {
        showToast("Please enter a valid email address.", "warning");
        return;
      }
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) {
        showToast(error.message, "error");
        return;
      }
      showToast("Verification email sent to update your address.", "success");
    });

    // Security Settings: Update Password & Reset Email
    document.getElementById("settings-password-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUser || !authToken) {
        openAuthModal("login");
        return;
      }
      const p1 = document.getElementById("settings-new-password")?.value || "";
      const p2 = document.getElementById("settings-confirm-password")?.value || "";
      if (p1.length < 8) {
        showToast("Password must be at least 8 characters.", "warning");
        return;
      }
      if (p1 !== p2) {
        showToast("New passwords do not match.", "warning");
        return;
      }
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          accessToken: authToken,
          newPassword: p1,
          confirmPassword: p2
        })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.message || "Could not update password.", "error");
        return;
      }
      e.target.reset();
      showToast("Account password updated.", "success");
    });

    document.getElementById("sec-send-reset-email-btn")?.addEventListener("click", async () => {
      if (!currentUser) return;
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          email: currentUser.email,
          redirectTo: `${window.location.origin}/reset-password`
        })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.message || "Could not send password reset email.", "error");
        return;
      }
      showToast(`Password reset email sent to ${currentUser.email}.`, "success");
    });

    // Privacy Settings Form
    document.getElementById("settings-privacy-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUser) {
        openAuthModal("login");
        return;
      }
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          privacy_settings: {
            profile_visibility: document.getElementById("priv-profile-visibility")?.value || "private",
            history_visibility: document.getElementById("priv-history-visibility")?.value || "private",
            default_asset_visibility: document.getElementById("priv-asset-visibility")?.value || "private",
            data_privacy_opt_out: Boolean(document.getElementById("priv-data-optout")?.checked)
          }
        })
      });
      const data = await res.json();
      if (res.ok && data.user) {
        currentUser = data.user;
        showToast("Privacy settings updated.", "success");
      }
    });

    // Notifications Settings Form
    document.getElementById("settings-notifications-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUser) {
        openAuthModal("login");
        return;
      }
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          notification_settings: {
            email_notifications: Boolean(document.getElementById("notif-email")?.checked),
            generation_completion: Boolean(document.getElementById("notif-generation")?.checked),
            product_announcements: Boolean(document.getElementById("notif-announcements")?.checked)
          }
        })
      });
      const data = await res.json();
      if (res.ok && data.user) {
        currentUser = data.user;
        showToast("Notification preferences saved.", "success");
      }
    });

    // Account Deletion Form
    document.getElementById("settings-delete-account-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUser) return;
      const confirmText = (document.getElementById("delete-confirm-input")?.value || "").trim();
      if (confirmText !== "DELETE") {
        showToast('Please type "DELETE" to confirm account deletion.', "warning");
        return;
      }
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: getAuthHeaders(),
        body: JSON.stringify({ confirmText })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.message || "Account deletion failed.", "error");
        return;
      }
      handleSessionExpired();
      showToast("Your account and all storage assets have been permanently deleted.", "info");
    });
  }

  // --------------------------------------------------------------------------
  // 7. MY GENERATIONS — User Asset Library, Filters & Detail Modal
  // --------------------------------------------------------------------------
  async function fetchUserGenerations() {
    if (!authToken) return;
    try {
      const res = await fetch("/api/generations", {
        method: "GET",
        headers: getAuthHeaders()
      });
      if (!res.ok) return;
      const data = await res.json();
      userGenerations = Array.isArray(data.generations) ? data.generations : [];
      renderMyGenerationsGallery();
      populateDashboardProfileUI();
    } catch (_) {}
  }

  function renderMyGenerationsGallery() {
    const grid = document.getElementById("my-generations-grid");
    const emptyEl = document.getElementById("my-generations-empty");
    if (!grid || !emptyEl) return;

    const filtered = userGenerations.filter((g) => {
      if (currentGenFilter === "all") return true;
      if (currentGenFilter === "image" || currentGenFilter === "video") {
        return (g.generation_type || "image") === currentGenFilter;
      }
      return g.status === currentGenFilter;
    });

    if (filtered.length === 0) {
      grid.innerHTML = "";
      emptyEl.classList.remove("hidden");
      return;
    }

    emptyEl.classList.add("hidden");
    grid.innerHTML = filtered
      .map((g) => {
        const statusBadgeClass =
          g.status === "completed"
            ? "bg-[#EBF2EC] text-[#3F6A4E]"
            : g.status === "processing"
            ? "bg-[#F7EFE4] text-[#94652D]"
            : "bg-[#F9EBE9] text-[#9E3B33]";

        const modeLabel =
          g.mode === "image-to-image" || g.input_image_url
            ? "IMAGE-TO-IMAGE EDIT"
            : "TEXT-TO-IMAGE";

        const mediaHtml = g.output_video_url
          ? `<video src="${escapeHtml(g.output_video_url)}" controls muted playsinline class="w-full h-48 object-cover bg-[#292720]"></video>`
          : g.output_image_url
          ? `<img src="${escapeHtml(g.output_image_url)}" alt="${escapeHtml(g.title)}" class="w-full h-48 object-cover bg-[#292720]" loading="lazy" />`
          : `<div class="w-full h-48 bg-[#292720] text-[#C9BBA5] font-mono-tech text-xs flex items-center justify-center">${escapeHtml(
              (g.status || "failed").toUpperCase()
            )}</div>`;

        return `
        <article class="surface-white overflow-hidden flex flex-col justify-between">
          <div>
            <div class="relative">
              ${mediaHtml}
              <span class="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded font-mono-tech text-[10px] uppercase font-semibold ${statusBadgeClass}">
                ${escapeHtml(g.status)}
              </span>
              <span class="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-[#292720]/85 text-[#FAF8F3] font-mono-tech text-[9px] uppercase">
                ${escapeHtml(modeLabel)}
              </span>
            </div>
            <div class="p-4 space-y-1.5">
              <div class="flex items-center justify-between text-[10px] font-mono-tech text-[#75624E]">
                <span>${escapeHtml(g.processing_mode || "VS-CHAR-2.4")}</span>
                <span>${escapeHtml(formatShortDate(g.created_at))}</span>
              </div>
              <h4 class="text-sm font-bold text-[#292720] truncate">${escapeHtml(
                g.title || "Untitled Transformation"
              )}</h4>
              <p class="text-xs text-[#5C5549] line-clamp-2">${escapeHtml(g.prompt || "")}</p>
            </div>
          </div>
          <div class="px-4 py-3 border-t border-[#E8DFD0] flex items-center justify-between gap-2">
            <button type="button" data-view-gen-id="${escapeHtml(
              g.id
            )}" class="btn-secondary !py-1 !px-2.5 !text-[11px]">
              View Details
            </button>
            <div class="flex items-center gap-1.5">
              ${
                g.output_image_url
                  ? `<button type="button" data-download-gen-id="${escapeHtml(
                      g.id
                    )}" class="btn-secondary !py-1 !px-2.5 !text-[11px]">Download</button>`
                  : ""
              }
              <button type="button" data-delete-gen-id="${escapeHtml(
                g.id
              )}" class="px-2.5 py-1 rounded bg-[#F9EBE9] text-[#9E3B33] font-mono-tech text-[10px] font-semibold hover:bg-[#9E3B33] hover:text-[#FAF8F3] transition-colors">
                Delete
              </button>
            </div>
          </div>
        </article>
      `;
      })
      .join("");
  }

  async function downloadGenerationById(genId, fallbackUrl = "", ext = "jpg") {
    try {
      if (genId && authToken) {
        const res = await fetch(`/api/generations/${encodeURIComponent(genId)}/asset`, {
          method: "GET",
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (res.ok) {
          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = objectUrl;
          a.download = `vidsynth-${genId}.${ext || "jpg"}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
          return;
        }
      }
      if (fallbackUrl) {
        const a = document.createElement("a");
        a.href = fallbackUrl;
        a.download = `vidsynth-ai-${Date.now()}.${ext || "jpg"}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (_) {
      showToast("Could not download image asset.", "error");
    }
  }

  function initMyGenerationsEvents() {
    document.querySelectorAll("[data-gen-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentGenFilter = btn.getAttribute("data-gen-filter") || "all";
        document.querySelectorAll("[data-gen-filter]").forEach((b) =>
          b.classList.toggle("active", b === btn)
        );
        renderMyGenerationsGallery();
      });
    });

    const detailModal = document.getElementById("generation-detail-modal");
    document.querySelectorAll("[data-close-gen-detail]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (detailModal) detailModal.classList.add("hidden");
        document.body.style.overflow = "";
      });
    });

    document.addEventListener("click", async (e) => {
      const dlCardBtn = e.target.closest("[data-download-gen-id]");
      if (dlCardBtn) {
        const genId = dlCardBtn.getAttribute("data-download-gen-id");
        const item = userGenerations.find((g) => g.id === genId);
        if (item) {
          const ext = item.output_mime_type === "image/png" ? "png" : "jpg";
          await downloadGenerationById(item.id, item.output_image_url, ext);
        }
        return;
      }

      const viewBtn = e.target.closest("[data-view-gen-id]");
      if (viewBtn) {
        const genId = viewBtn.getAttribute("data-view-gen-id");
        const item = userGenerations.find((g) => g.id === genId);
        if (!item || !detailModal) return;

        document.getElementById("gen-detail-title").textContent = item.title || "Generation Details";
        document.getElementById("gen-detail-status").textContent = item.status || "completed";
        document.getElementById("gen-detail-date").textContent = formatShortDate(item.created_at);
        document.getElementById("gen-detail-prompt").textContent = item.prompt || "";
        document.getElementById("gen-detail-description").textContent =
          item.description || "No additional instructions specified.";
        document.getElementById("gen-detail-settings").textContent = `Style: ${
          item.style_preset || "Default"
        } • Ratio: ${item.aspect_ratio || "1:1"} • Mode: ${item.processing_mode || "VS-CHAR-2.4"}`;

        const imgEl = document.getElementById("gen-detail-image");
        if (imgEl) imgEl.src = item.output_image_url || "";

        const refBox = document.getElementById("gen-detail-ref-box");
        const refImg = document.getElementById("gen-detail-ref-img");
        if (item.input_image_url && refBox && refImg) {
          refImg.src = item.input_image_url;
          refBox.classList.remove("hidden");
        } else if (refBox) {
          refBox.classList.add("hidden");
        }

        const dlBtn = document.getElementById("gen-detail-download-btn");
        if (dlBtn) {
          dlBtn.href = item.output_image_url || "#";
          dlBtn.onclick = (ev) => {
            ev.preventDefault();
            const ext = item.output_mime_type === "image/png" ? "png" : "jpg";
            downloadGenerationById(item.id, item.output_image_url, ext);
          };
        }

        detailModal.classList.remove("hidden");
        document.body.style.overflow = "hidden";
      }

      const delBtn = e.target.closest("[data-delete-gen-id]");
      if (delBtn) {
        const genId = delBtn.getAttribute("data-delete-gen-id");
        if (!genId) return;
        try {
          const res = await fetch(`/api/generations/${encodeURIComponent(genId)}`, {
            method: "DELETE",
            headers: getAuthHeaders()
          });
          if (res.ok) {
            userGenerations = userGenerations.filter((g) => g.id !== genId);
            renderMyGenerationsGallery();
            showToast("Generation deleted from your library.", "info");
          }
        } catch (_) {
          showToast("Failed to delete generation.", "error");
        }
      }
    });
  }

  // --------------------------------------------------------------------------
  // 8. AI Image Generation & Editing Studio (Guest Preview + Live Engine)
  // --------------------------------------------------------------------------
  function openCreditsExhaustedModal() {
    const modal = document.getElementById("credits-exhausted-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeCreditsExhaustedModal() {
    const modal = document.getElementById("credits-exhausted-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    document.body.style.overflow = "";
  }

  function initGenerationStudio() {
    const form = document.getElementById("studio-generate-form");
    const promptInput = document.getElementById("studio-prompt-input");
    const addInstructionsInput = document.getElementById("studio-additional-instructions");
    const clearPromptBtn = document.getElementById("studio-clear-prompt-btn");
    const charCount = document.getElementById("studio-char-count");
    const styleSelect = document.getElementById("studio-style-preset");
    const aspectSelect = document.getElementById("studio-aspect-ratio");
    const widthSelect = document.getElementById("studio-width-input");
    const heightSelect = document.getElementById("studio-height-input");
    const guidanceInput = document.getElementById("studio-guidance-input");
    const guidanceVal = document.getElementById("studio-guidance-val");
    const seedInput = document.getElementById("studio-seed-input");
    const randomSeedBtn = document.getElementById("studio-random-seed-btn");

    const generateBtn = document.getElementById("studio-generate-btn");
    const generateBtnLabel = document.getElementById("studio-generate-btn-label");
    const activeModePill = document.getElementById("studio-mode-badge");
    const modeHelperText = document.getElementById("studio-mode-helper-text");
    const samplePreviewBtn = document.getElementById("studio-demo-preview-btn");

    const downloadBtn = document.getElementById("studio-download-btn");
    const generateAgainBtn = document.getElementById("studio-generate-again-btn");
    const editAgainBtn = document.getElementById("studio-edit-again-btn");
    const copyPromptBtn = document.getElementById("studio-copy-prompt-btn");
    const saveLibraryBtn = document.getElementById("studio-save-library-btn");
    const confirmRestoredBtn = document.getElementById("studio-confirm-restored-btn");

    // Reference Image Upload Controls
    const refFileInput = document.getElementById("studio-ref-file-input");
    const refDropzone = document.getElementById("studio-ref-dropzone");
    const refIdle = document.getElementById("studio-ref-idle");
    const refUploading = document.getElementById("studio-ref-uploading");
    const refPreviewBox = document.getElementById("studio-ref-preview-box");
    const refPreviewImg = document.getElementById("studio-ref-preview-img");
    const refFilename = document.getElementById("studio-ref-filename");
    const refDimensions = document.getElementById("studio-ref-meta");
    const refRemoveBtn = document.getElementById("studio-ref-remove-btn");

    document.querySelectorAll("[data-close-credits-modal]").forEach((btn) =>
      btn.addEventListener("click", closeCreditsExhaustedModal)
    );
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-open-credits-exhausted]")) {
        e.preventDefault();
        openCreditsExhaustedModal();
      }
    });

    function syncStudioModeUI() {
      const hasRef = Boolean(selectedReferenceFile || selectedReferenceDataUrl);
      if (activeModePill) {
        activeModePill.textContent = hasRef
          ? "MODE: IMAGE-TO-IMAGE EDITING"
          : "MODE: TEXT-TO-IMAGE GENERATION";
      }
      if (generateBtnLabel) {
        generateBtnLabel.textContent = hasRef ? "Edit Image" : "Generate Image";
      }
      if (modeHelperText) {
        modeHelperText.textContent = hasRef
          ? "Image-to-Image Editing mode active: Your reference image will be conditioned with your prompt."
          : "Text-to-Image mode active. Upload a reference image above to switch to Image-to-Image Editing.";
      }
    }

    if (promptInput && charCount) {
      promptInput.addEventListener("input", () => {
        charCount.textContent = `${promptInput.value.length} / 1000`;
      });
    }

    if (clearPromptBtn) {
      clearPromptBtn.addEventListener("click", () => {
        if (promptInput) {
          promptInput.value = "";
          promptInput.dispatchEvent(new Event("input"));
          promptInput.focus();
        }
        if (addInstructionsInput) {
          addInstructionsInput.value = "";
        }
        document.querySelectorAll("[data-studio-preset-prompt]").forEach((c) => c.classList.remove("active"));
      });
    }

    // Aspect Ratio -> Width & Height Synchronization
    if (aspectSelect && widthSelect && heightSelect) {
      aspectSelect.addEventListener("change", () => {
        const ratio = aspectSelect.value;
        const map = {
          "1:1": ["1024", "1024"],
          "16:9": ["1024", "576"],
          "9:16": ["576", "1024"],
          "4:5": ["768", "960"],
          "3:4": ["768", "1024"],
          "4:3": ["1024", "768"]
        };
        if (map[ratio]) {
          widthSelect.value = map[ratio][0];
          heightSelect.value = map[ratio][1];
        }
      });
    }

    if (guidanceInput && guidanceVal) {
      guidanceInput.addEventListener("input", () => {
        guidanceVal.textContent = guidanceInput.value;
      });
    }

    if (randomSeedBtn && seedInput) {
      randomSeedBtn.addEventListener("click", () => {
        seedInput.value = String(Math.floor(100000 + Math.random() * 900000000));
      });
    }

    document.querySelectorAll("[data-studio-preset-prompt]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const text = chip.getAttribute("data-studio-preset-prompt") || "";
        if (promptInput) {
          promptInput.value = text;
          promptInput.dispatchEvent(new Event("input"));
          promptInput.focus();
        }
        document.querySelectorAll("[data-studio-preset-prompt]").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
      });
    });

    document.querySelectorAll("[data-studio-model]").forEach((card) => {
      card.addEventListener("click", () => {
        selectedStudioModel = card.getAttribute("data-studio-model") || "VS-CHAR-2.4";
        document.querySelectorAll("[data-studio-model]").forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
      });
    });

    // Local + Authenticated Reference Image Preview (Works for Guests & Logged-In Users)
    function attachReferenceFile(file) {
      if (!file) return;
      try {
        window.generationEngine.validateReferenceImageFile(file);
      } catch (validationErr) {
        showToast(validationErr.message, "warning");
        return;
      }

      selectedReferenceFile = file;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        selectedReferenceDataUrl = dataUrl;
        if (refPreviewImg) {
          refPreviewImg.onload = () => {
            if (refDimensions) {
              refDimensions.textContent = `${refPreviewImg.naturalWidth || "—"}×${
                refPreviewImg.naturalHeight || "—"
              }px • Auto-resized < 512×512 on server`;
            }
          };
          refPreviewImg.src = dataUrl;
        }
        if (refFilename) refFilename.textContent = file.name;
        if (refIdle) refIdle.classList.add("hidden");
        if (refUploading) refUploading.classList.add("hidden");
        if (refPreviewBox) refPreviewBox.classList.remove("hidden");
        syncStudioModeUI();
      };
      reader.readAsDataURL(file);
    }

    window._attachStudioReferenceFile = attachReferenceFile;

    if (refDropzone && refFileInput) {
      refDropzone.addEventListener("click", (e) => {
        if (e.target.closest("#studio-ref-remove-btn")) return;
        refFileInput.click();
      });

      refDropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        refDropzone.classList.add("drag-over");
      });
      refDropzone.addEventListener("dragleave", () => {
        refDropzone.classList.remove("drag-over");
      });
      refDropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        refDropzone.classList.remove("drag-over");
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) attachReferenceFile(file);
      });

      refFileInput.addEventListener("change", () => {
        const file = refFileInput.files && refFileInput.files[0];
        if (file) attachReferenceFile(file);
      });
    }

    document.getElementById("studio-ref-replace-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (refFileInput) refFileInput.click();
    });

    document.getElementById("studio-dismiss-restored-btn")?.addEventListener("click", () => {
      document.getElementById("studio-restored-draft-banner")?.classList.add("hidden");
    });

    if (refDropzone) {
      refDropzone.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && refFileInput) {
          e.preventDefault();
          refFileInput.click();
        }
      });
    }

    if (refRemoveBtn) {
      refRemoveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        selectedReferenceFile = null;
        selectedReferenceDataUrl = "";
        uploadedReferenceAsset = null;
        if (refFileInput) refFileInput.value = "";
        if (refPreviewBox) refPreviewBox.classList.add("hidden");
        if (refIdle) refIdle.classList.remove("hidden");
        syncStudioModeUI();
        showToast("Reference image removed. Switched to Generate Image mode.", "info");
      });
    }

    // Canvas State & Comparison View Mode Switcher
    function showCanvasState(stateName) {
      document.getElementById("studio-empty-state")?.classList.toggle("hidden", stateName !== "empty");
      document.getElementById("studio-loading-state")?.classList.toggle("hidden", stateName !== "loading");
      document.getElementById("studio-error-state")?.classList.toggle("hidden", stateName !== "error");
      document.getElementById("studio-output-wrapper")?.classList.toggle("hidden", stateName !== "output");
      document.getElementById("studio-view-mode-bar")?.classList.toggle("hidden", stateName !== "output");
    }

    function setStudioComparisonViewMode(viewMode) {
      document.querySelectorAll("[data-studio-view-mode]").forEach((btn) => {
        const active = btn.getAttribute("data-studio-view-mode") === viewMode;
        btn.classList.toggle("active", active);
        btn.className = active
          ? "px-2.5 py-1 rounded font-mono-tech text-[10px] bg-[#FAF8F3] text-[#292720] font-semibold active"
          : "px-2.5 py-1 rounded font-mono-tech text-[10px] text-[#C9BBA5] hover:text-[#FAF8F3]";
      });
      document.getElementById("studio-single-view")?.classList.toggle("hidden", viewMode !== "single");
      document.getElementById("studio-sidebyside-view")?.classList.toggle("hidden", viewMode !== "side-by-side");
      document.getElementById("studio-slider-view")?.classList.toggle("hidden", viewMode !== "slider");
    }

    document.querySelectorAll("[data-studio-view-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-studio-view-mode") || "single";
        setStudioComparisonViewMode(mode);
      });
    });

    function setPostActionButtonsDisabled(disabled) {
      [downloadBtn, generateAgainBtn, editAgainBtn, copyPromptBtn, saveLibraryBtn].forEach((b) => {
        if (b) b.disabled = disabled;
      });
    }

    // Clearly Labeled Sample Result / Demo Preview (0 Credits Used, No Auto-Generation)
    if (samplePreviewBtn) {
      samplePreviewBtn.addEventListener("click", () => {
        const sampleBefore = "assets/showcase/before/before1.jpg";
        const sampleAfter = "assets/showcase/after/after1.jpeg";
        currentBeforeImageUrl = sampleBefore;
        currentGeneratedAssetUrl = sampleAfter;
        currentGeneratedExt = "jpg";
        currentGeneratedRecordId = null;

        const resultImg = document.getElementById("studio-result-image");
        const sbsBefore = document.getElementById("studio-sbs-before-img");
        const sbsAfter = document.getElementById("studio-sbs-after-img");
        const baBefore = document.getElementById("studio-slider-before-img");
        const baAfter = document.getElementById("studio-slider-after-img");
        const compBar = document.getElementById("studio-compare-toggle-group");
        const telemetry = document.getElementById("studio-result-telemetry");

        if (resultImg) resultImg.src = sampleAfter;
        if (sbsBefore) sbsBefore.src = sampleBefore;
        if (sbsAfter) sbsAfter.src = sampleAfter;
        if (baBefore) baBefore.src = sampleBefore;
        if (baAfter) baAfter.src = sampleAfter;
        if (compBar) compBar.classList.remove("hidden");
        setStudioComparisonViewMode("side-by-side");

        if (telemetry) {
          telemetry.textContent =
            "DEMO PREVIEW — SAMPLE RESULT (0 CREDITS USED) • SIGN IN TO GENERATE LIVE AI OUTPUT";
        }
        setPostActionButtonsDisabled(false);
        showCanvasState("output");
        const demoBadge = document.getElementById("studio-result-badge");
        if (demoBadge) demoBadge.textContent = "SAMPLE RESULT • DEMO PREVIEW";
        showToast("Loaded Sample Result / Demo Preview (no credits used).", "info");
      });
    }

    // Post-Generation Action Buttons
    if (downloadBtn) {
      downloadBtn.addEventListener("click", () => {
        if (!currentGeneratedAssetUrl) return;
        downloadGenerationById(currentGeneratedRecordId, currentGeneratedAssetUrl, currentGeneratedExt);
      });
    }

    if (generateAgainBtn) {
      generateAgainBtn.addEventListener("click", () => {
        if (seedInput) {
          seedInput.value = String(Math.floor(100000 + Math.random() * 900000000));
        }
        form?.requestSubmit();
      });
    }

    if (editAgainBtn) {
      editAgainBtn.addEventListener("click", async () => {
        if (!currentGeneratedAssetUrl) return;
        try {
          const res = await fetch(currentGeneratedAssetUrl);
          const blob = await res.blob();
          const file = new File([blob], `vidsynth-output.${currentGeneratedExt}`, {
            type: blob.type || "image/jpeg"
          });
          attachReferenceFile(file);
          promptInput?.focus();
          showToast(
            "Loaded generated result as Reference Image for iterative Image-to-Image editing.",
            "info"
          );
        } catch (_) {
          showToast("Could not load output image into reference slot.", "warning");
        }
      });
    }

    if (copyPromptBtn) {
      copyPromptBtn.addEventListener("click", () => {
        const text = (promptInput?.value || "").trim();
        if (!text) return;
        copyTextToClipboard(text).then(() => {
          showToast("Prompt copied to clipboard.", "success");
        });
      });
    }

    if (saveLibraryBtn) {
      saveLibraryBtn.addEventListener("click", () => {
        if (!currentUser) {
          openAuthModal("login", "Sign in to access your My Generations library.");
          return;
        }
        switchDashboardTab("generations", true);
        showToast("Opened your saved generations in My Generations.", "success");
      });
    }

    if (confirmRestoredBtn) {
      confirmRestoredBtn.addEventListener("click", () => {
        document.getElementById("studio-restored-draft-banner")?.classList.add("hidden");
        form?.requestSubmit();
      });
    }

    // Live Generation / Editing Submission
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const promptText = (promptInput?.value || "").trim();
        if (promptText.length < 3) {
          showToast("Please enter a prompt describing your image or edit.", "warning");
          promptInput?.focus();
          return;
        }

        // 1. If Guest: Save prepared studio draft & open Auth Modal
        if (!currentUser || !authToken) {
          saveGuestStudioDraft();
          pendingScrollToSandbox = true;
          openAuthModal(
            "login",
            "Sign in or create your VidSynth AI account to run your prepared generation with 2 free credits."
          );
          return;
        }

        // 2. Validate credits
        const remaining = Number(currentUser.remainingCredits ?? currentUser.credits ?? 0);
        if (remaining < 1) {
          openCreditsExhaustedModal();
          showToast("You have used all 2 of your free credits.", "warning");
          return;
        }

        document.getElementById("studio-restored-draft-banner")?.classList.add("hidden");
        if (generateBtn) generateBtn.disabled = true;
        setPostActionButtonsDisabled(true);

        const isEditMode = Boolean(selectedReferenceFile);
        const loadingLabel = document.getElementById("studio-progress-stage");
        if (loadingLabel) {
          loadingLabel.textContent = isEditMode
            ? "PREPROCESSING REFERENCE (<512×512) & EDITING IMAGE..."
            : "RUNNING VIDSYNTH AI IMAGE SYNTHESIS...";
        }

        showCanvasState("loading");
        showToast(
          isEditMode ? "Image-to-Image editing started..." : "Image generation started...",
          "info"
        );

        try {
          const result = await window.generationEngine.generate({
            prompt: promptText,
            description: (addInstructionsInput?.value || "").trim(),
            referenceFiles: selectedReferenceFile ? [selectedReferenceFile] : [],
            stylePreset: styleSelect ? styleSelect.value : "Cinematic Editorial Realism",
            aspectRatio: aspectSelect ? aspectSelect.value : "1:1",
            width: widthSelect ? Number(widthSelect.value) : 1024,
            height: heightSelect ? Number(heightSelect.value) : 1024,
            guidance: guidanceInput ? Number(guidanceInput.value) : 3.5,
            seed: seedInput && seedInput.value !== "" ? Number(seedInput.value) : null,
            processingMode: selectedStudioModel,
            accessToken: authToken
          });

          if (typeof result.remainingCredits === "number" && currentUser) {
            currentUser.credits = result.remainingCredits;
            currentUser.remainingCredits = result.remainingCredits;
          }
          updateApplicationUI();

          currentGeneratedAssetUrl = result.imageUrl || "";
          currentGeneratedExt = result.outputExtension || "jpg";
          currentGeneratedRecordId = result.generation ? result.generation.id : null;
          currentBeforeImageUrl = selectedReferenceDataUrl || result.inputImageUrl || "";

          const resultImage = document.getElementById("studio-result-image");
          if (resultImage && currentGeneratedAssetUrl) {
            resultImage.src = currentGeneratedAssetUrl;
          }

          const compBar = document.getElementById("studio-compare-toggle-group");
          const sbsBefore = document.getElementById("studio-sbs-before-img");
          const sbsAfter = document.getElementById("studio-sbs-after-img");
          const baBefore = document.getElementById("studio-slider-before-img");
          const baAfter = document.getElementById("studio-slider-after-img");

          if (isEditMode && currentBeforeImageUrl) {
            if (sbsBefore) sbsBefore.src = currentBeforeImageUrl;
            if (sbsAfter) sbsAfter.src = currentGeneratedAssetUrl;
            if (baBefore) baBefore.src = currentBeforeImageUrl;
            if (baAfter) baAfter.src = currentGeneratedAssetUrl;
            if (compBar) compBar.classList.remove("hidden");
            setStudioComparisonViewMode("side-by-side");
          } else {
            if (compBar) compBar.classList.add("hidden");
            setStudioComparisonViewMode("single");
          }

          setPostActionButtonsDisabled(!currentGeneratedAssetUrl);

          const telemetry = document.getElementById("studio-result-telemetry");
          if (telemetry) {
            telemetry.textContent = `MODE: ${(result.mode || "text-to-image").toUpperCase()} • ${
              result.width || 1024
            }×${result.height || 1024} • CREDITS: ${currentUser.remainingCredits}`;
          }

          showCanvasState("output");
          const liveBadge = document.getElementById("studio-result-badge");
          if (liveBadge) liveBadge.textContent = "GENERATED OUTPUT";
          showToast(
            `${isEditMode ? "Image edit" : "Image generation"} completed! CREDITS: ${currentUser.remainingCredits}`,
            "success"
          );
          await syncProfileAndAssetsFromBackend();
        } catch (err) {
          if (
            err.code === "INSUFFICIENT_CREDITS" ||
            err.code === "CREDITS_EXHAUSTED" ||
            err.code === "SANDBOX_QUOTA_EXCEEDED"
          ) {
            if (currentUser) {
              currentUser.credits = 0;
              currentUser.remainingCredits = 0;
            }
            updateApplicationUI();
            showCanvasState("empty");
            openCreditsExhaustedModal();
            showToast("You have used all 2 of your free credits.", "warning");
            return;
          }

          if (typeof err.remainingCredits === "number" && currentUser) {
            currentUser.credits = err.remainingCredits;
            currentUser.remainingCredits = err.remainingCredits;
            updateApplicationUI();
          }

          const errTitle = document.getElementById("studio-error-title");
          const errMsg = document.getElementById("studio-error-msg");
          if (errTitle) errTitle.textContent = "VidSynth AI Generation Notice";
          if (errMsg) errMsg.textContent = err.message;
          showCanvasState("error");
          showToast(
            err.message || "Generation failed. Your reserved credit was automatically refunded.",
            "warning"
          );
        } finally {
          if (generateBtn) generateBtn.disabled = false;
        }
      });
    }
  }

  // --------------------------------------------------------------------------
  // 9. Navigation, Motion Reveal, VFX Showcase Filtering & Before/After Sliders
  // --------------------------------------------------------------------------
  function initNavigationAndShowcases() {
    const siteHeader = document.getElementById("site-header");
    const mobileMenuBtn = document.getElementById("mobile-menu-btn");
    const mobileMenuCloseBtn = document.getElementById("mobile-menu-close-btn");
    const mobileDrawer = document.getElementById("mobile-nav-drawer");

    // Sticky Header Scroll State (Part 5.2)
    if (siteHeader) {
      const updateHeaderScroll = () => {
        siteHeader.classList.toggle("is-scrolled", window.scrollY > 16);
      };
      window.addEventListener("scroll", updateHeaderScroll, { passive: true });
      updateHeaderScroll();
    }

    // Active Navigation Section Indicator (Part 2.2)
    const navLinks = document.querySelectorAll('.nav-link-item[href^="#"]');
    if (navLinks.length > 0 && "IntersectionObserver" in window) {
      const secObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && entry.target.id) {
              navLinks.forEach((link) => {
                link.classList.toggle(
                  "active",
                  link.getAttribute("href") === `#${entry.target.id}`
                );
              });
            }
          });
        },
        { rootMargin: "-30% 0px -55% 0px", threshold: 0.05 }
      );
      [
        "featured-showcase",
        "video-comparison",
        "capabilities",
        "character-showcase",
        "interactive-sandbox",
        "user-dashboard"
      ].forEach((secId) => {
        const el = document.getElementById(secId);
        if (el) secObserver.observe(el);
      });
    }

    if (mobileMenuBtn && mobileDrawer) {
      mobileMenuBtn.addEventListener("click", () => {
        mobileDrawer.classList.remove("hidden");
        mobileMenuBtn.setAttribute("aria-expanded", "true");
        document.body.style.overflow = "hidden";
      });
    }
    if (mobileMenuCloseBtn && mobileDrawer) {
      mobileMenuCloseBtn.addEventListener("click", () => {
        mobileDrawer.classList.add("hidden");
        if (mobileMenuBtn) mobileMenuBtn.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
      });
    }
    if (mobileDrawer) {
      mobileDrawer.addEventListener("click", (e) => {
        if (e.target === mobileDrawer || e.target.closest("a[href^='#']")) {
          mobileDrawer.classList.add("hidden");
          if (mobileMenuBtn) mobileMenuBtn.setAttribute("aria-expanded", "false");
          document.body.style.overflow = "";
        }
      });
    }

    // VFX Showcase Theme Filter (Part 5.5 & Part 6.6)
    const vfxFilterBtns = document.querySelectorAll("[data-vfx-filter]");
    const vfxCards = document.querySelectorAll("[data-vfx-card]");
    if (vfxFilterBtns.length > 0 && vfxCards.length > 0) {
      vfxFilterBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const selectedTheme = btn.getAttribute("data-vfx-filter") || "all";
          vfxFilterBtns.forEach((b) => {
            const active = b === btn;
            b.classList.toggle("active", active);
            b.setAttribute("aria-selected", String(active));
          });

          vfxCards.forEach((card) => {
            const cardTheme = card.getAttribute("data-vfx-card") || "";
            const isMatch = selectedTheme === "all" || cardTheme === selectedTheme;
            const vid = card.querySelector("video");
            if (isMatch) {
              card.classList.remove("is-hidden-by-filter");
              requestAnimationFrame(() => {
                card.classList.remove("is-filtering-out");
              });
              if (vid) vid.play().catch(() => {});
            } else {
              card.classList.add("is-filtering-out");
              if (vid) vid.pause();
              setTimeout(() => {
                if (card.classList.contains("is-filtering-out")) {
                  card.classList.add("is-hidden-by-filter");
                }
              }, 220);
            }
          });
        });
      });
    }

    // VFX Showcase "Load Prompt" into Studio (Part 6.5)
    document.addEventListener("click", (e) => {
      const tryPromptBtn = e.target.closest("[data-try-vfx-prompt]");
      if (tryPromptBtn) {
        e.preventDefault();
        const promptText = tryPromptBtn.getAttribute("data-try-vfx-prompt") || "";
        const promptInput = document.getElementById("studio-prompt-input");
        if (promptInput && promptText) {
          promptInput.value = promptText;
          promptInput.dispatchEvent(new Event("input"));
        }
        document.getElementById("interactive-sandbox")?.scrollIntoView({ behavior: "smooth" });
        showToast("Loaded VFX transformation prompt into Generation Studio.", "info");
      }
    });

    // Scroll Reveal
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealEls = document.querySelectorAll("[data-reveal]");
    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      revealEls.forEach((el) => el.classList.add("is-revealed"));
    } else {
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-revealed");
              obs.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.1 }
      );
      revealEls.forEach((el) => obs.observe(el));
    }

    // Hero Video Switcher
    const heroVideo = document.getElementById("hero-main-video");
    const heroLabel = document.getElementById("hero-reel-label");
    document.querySelectorAll("[data-hero-reel-btn]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const videoSrc = btn.getAttribute("data-video");
        const posterSrc = btn.getAttribute("data-poster");
        const labelText = btn.getAttribute("data-label");
        if (!heroVideo || !videoSrc) return;
        document.querySelectorAll("[data-hero-reel-btn]").forEach((b) => {
          b.className =
            "px-2.5 py-1 rounded-md font-mono-tech text-[10px] bg-[#E8DFD0] text-[#75624E] hover:text-[#292720] transition-colors";
        });
        btn.className =
          "px-2.5 py-1 rounded-md font-mono-tech text-[10px] bg-[#292720] text-[#FAF8F3] transition-colors";
        if (heroLabel && labelText) heroLabel.textContent = labelText;
        heroVideo.poster = posterSrc || "";
        heroVideo.src = videoSrc;
        heroVideo.load();
        heroVideo.play().catch(() => {});
      });
    });

    // Character & Studio Before/After Sliders (with touch-action lock during drag)
    document.querySelectorAll("[data-ba-slider]").forEach((stageEl) => {
      const beforeLayer = stageEl.querySelector(".ba-layer-before");
      const divider = stageEl.querySelector(".ba-divider-line");
      if (!beforeLayer || !divider) return;
      let split = Number(stageEl.getAttribute("data-initial-split") || 50);
      let dragging = false;

      function setSplit(pct) {
        split = Math.max(2, Math.min(98, Number(pct)));
        beforeLayer.style.clipPath = `inset(0 ${100 - split}% 0 0)`;
        divider.style.left = `${split}%`;
        divider.setAttribute("aria-valuenow", String(Math.round(split)));
      }

      stageEl.addEventListener("pointerdown", (e) => {
        if (e.target.closest("[data-ba-expand]")) return;
        dragging = true;
        stageEl.classList.add("is-dragging");
        try {
          stageEl.setPointerCapture(e.pointerId);
        } catch (_) {}
        const rect = stageEl.getBoundingClientRect();
        if (rect.width) setSplit(((e.clientX - rect.left) / rect.width) * 100);
      });
      stageEl.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const rect = stageEl.getBoundingClientRect();
        if (rect.width) setSplit(((e.clientX - rect.left) / rect.width) * 100);
      });
      const stopDrag = () => {
        dragging = false;
        stageEl.classList.remove("is-dragging");
      };
      stageEl.addEventListener("pointerup", stopDrag);
      stageEl.addEventListener("pointercancel", stopDrag);
      setSplit(split);
      stageEl._setBaSplit = setSplit;
    });

    // Character Lightbox
    const lightboxModal = document.getElementById("ba-lightbox-modal");
    document.querySelectorAll("[data-ba-expand]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!lightboxModal) return;
        document.getElementById("ba-lightbox-title").textContent =
          btn.getAttribute("data-title") || "Character Study";
        document.getElementById("ba-lightbox-desc").textContent =
          btn.getAttribute("data-desc") || "";
        document.getElementById("ba-lightbox-before").src = btn.getAttribute("data-before") || "";
        document.getElementById("ba-lightbox-after").src = btn.getAttribute("data-after") || "";
        lightboxModal.classList.remove("hidden");
        document.body.style.overflow = "hidden";
      });
    });
    document.getElementById("ba-lightbox-close")?.addEventListener("click", () => {
      if (lightboxModal) lightboxModal.classList.add("hidden");
      document.body.style.overflow = "";
    });
  }

  function initDeveloperApiAndEarlyAccess() {
    const apiModal = document.getElementById("api-access-modal");
    document.querySelectorAll("[data-open-api-modal]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (apiModal) {
          apiModal.classList.remove("hidden");
          document.body.style.overflow = "hidden";
        }
      });
    });
    document.querySelectorAll("[data-close-api-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (apiModal) apiModal.classList.add("hidden");
        document.body.style.overflow = "";
      });
    });

    document.getElementById("api-access-request-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fullName = (document.getElementById("api-req-name")?.value || "").trim();
      const email = (document.getElementById("api-req-email")?.value || "").trim();
      const company = (document.getElementById("api-req-company")?.value || "").trim();
      const website = (document.getElementById("api-req-website")?.value || "").trim();
      const intendedUseCase = (document.getElementById("api-req-usecase")?.value || "").trim();
      const expectedUsage = document.getElementById("api-req-usage")?.value || "";
      const additionalDescription = (document.getElementById("api-req-description")?.value || "").trim();
      const feedback = document.getElementById("api-req-feedback");

      if (!fullName || !validateEmail(email) || !company || !intendedUseCase) {
        showToast("Please complete all required Developer API request fields.", "warning");
        return;
      }

      const res = await fetch("/api/developer-access", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          fullName,
          email,
          company,
          website,
          intendedUseCase,
          expectedUsage,
          additionalDescription
        })
      });
      const data = await res.json();
      if (feedback) {
        feedback.textContent =
          data.message || "Your Developer API Private Beta request has been saved.";
        feedback.classList.remove("hidden");
      }
      if (res.ok) {
        e.target.reset();
        showToast("Developer API access request submitted.", "success");
      }
    });

    // Early Access Modal & Section Form
    const eaModal = document.getElementById("early-access-modal");
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-open-early-access]")) {
        e.preventDefault();
        closeCreditsExhaustedModal();
        if (eaModal) {
          eaModal.classList.remove("hidden");
          document.body.style.overflow = "hidden";
        }
      }
    });
    document.getElementById("ea-modal-close-btn")?.addEventListener("click", () => {
      if (eaModal) eaModal.classList.add("hidden");
      document.body.style.overflow = "";
    });

    document.getElementById("ea-copy-email-btn")?.addEventListener("click", () => {
      copyTextToClipboard(FOUNDER_EMAIL).then(() => {
        const tip = document.getElementById("ea-copy-tooltip");
        if (tip) {
          tip.classList.add("show");
          setTimeout(() => tip.classList.remove("show"), 1800);
        }
      });
    });

    document.getElementById("ea-modal-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = (document.getElementById("ea-modal-email-input")?.value || "").trim();
      if (!validateEmail(email)) {
        showToast("Please enter a valid work email.", "warning");
        return;
      }
      await fetch("/api/early-access", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: email.split("@")[0],
          email,
          interest: "Early Access Modal",
          source: "modal"
        })
      });
      document.getElementById("ea-modal-success-msg")?.classList.remove("hidden");
      e.target.reset();
    });

    document.getElementById("section-early-access-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = (document.getElementById("ea-section-name")?.value || "").trim();
      const email = (document.getElementById("ea-section-email")?.value || "").trim();
      const interest = document.getElementById("ea-section-interest")?.value || "";
      if (!name || !validateEmail(email)) {
        showToast("Please enter your name and valid email.", "warning");
        return;
      }
      const res = await fetch("/api/early-access", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ name, email, interest, source: "homepage" })
      });
      const data = await res.json();
      const fb = document.getElementById("ea-section-feedback");
      if (fb) {
        fb.textContent = data.message || "Early access request recorded.";
        fb.classList.remove("hidden");
      }
      if (res.ok) {
        e.target.reset();
        showToast("Early access request recorded.", "success");
      }
    });
  }

  function boot() {
    updateApplicationUI();
    initNavigationAndShowcases();
    initSupabaseAuthentication();
    initDashboardAndSettings();
    initMyGenerationsEvents();
    initGenerationStudio();
    initDeveloperApiAndEarlyAccess();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
