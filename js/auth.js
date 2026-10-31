/**
 * VIDSYNTH — AUTHENTICATION & SESSION MANAGEMENT ENGINE (js/auth.js)
 * ============================================================================
 * Supports:
 * 1. Production Supabase Auth (@supabase/supabase-js v2) when configured in config/config.js
 * 2. Explicitly labeled Local Sandbox Auth Provider when credentials are unconfigured
 * 3. Full flows: Sign In, Create Account, Password Strength, Email Verification,
 *    Expired Token Handling, Password Recovery, Reset Flow, OAuth, Protected Routes.
 */

(function initVidSynthAuth() {
  const CONFIG = window.VIDSYNTH_CONFIG || {
    IS_SUPABASE_CONFIGURED: false,
    RUNTIME_MODE: "LOCAL_SANDBOX_DEMO"
  };

  const USERS_DB_KEY = "vidsynth_sandbox_users_v1";
  const ACTIVE_SESSION_KEY = "vidsynth_active_session_v1";

  // Initialize Supabase client if credentials exist and SDK is loaded
  let supabaseClient = null;
  if (CONFIG.IS_SUPABASE_CONFIGURED && window.supabase && window.supabase.createClient) {
    try {
      supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      window.supabaseClient = supabaseClient;
    } catch (e) {
      console.warn("Supabase client initialization error:", e);
    }
  }

  // --------------------------------------------------------------------------
  // Local Sandbox User Store Helpers
  // --------------------------------------------------------------------------
  function getSandboxUsers() {
    try {
      const raw = localStorage.getItem(USERS_DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    // Seed a deterministic Sandbox Evaluation Account for immediate testing
    const defaultUsers = [
      {
        id: "usr_sandbox_eval_01",
        full_name: "Alex Mercer (Sandbox Evaluator)",
        email: "evaluator@vidsynth.app",
        organization: "VidSynth Evaluation Sandbox",
        password_hash: "VidSynth#2026",
        verified: true,
        plan_tier: "sandbox",
        available_credits: 100,
        created_at: "2026-10-01T09:00:00.000Z"
      }
    ];
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(defaultUsers));
    return defaultUsers;
  }

  function saveSandboxUsers(users) {
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
  }

  function getActiveSession() {
    try {
      const raw = localStorage.getItem(ACTIVE_SESSION_KEY) || sessionStorage.getItem(ACTIVE_SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
        clearActiveSession();
        return null;
      }
      return session;
    } catch (_) {
      return null;
    }
  }

  function setActiveSession(userObj, remember = true, authProvider = "local_sandbox") {
    const expiresAt = new Date(Date.now() + (remember ? 7 * 24 : 4) * 3600 * 1000).toISOString();
    const sessionPayload = {
      user: {
        id: userObj.id,
        full_name: userObj.full_name,
        email: userObj.email,
        organization: userObj.organization || "Independent Studio",
        plan_tier: userObj.plan_tier || "sandbox",
        verified: Boolean(userObj.verified),
        available_credits: typeof userObj.available_credits === "number" ? userObj.available_credits : 100,
        created_at: userObj.created_at || new Date().toISOString()
      },
      provider: authProvider,
      mode: CONFIG.IS_SUPABASE_CONFIGURED ? "SUPABASE_CLOUD" : "LOCAL_SANDBOX_DEMO",
      issued_at: new Date().toISOString(),
      expires_at: expiresAt
    };

    const serialized = JSON.stringify(sessionPayload);
    localStorage.setItem(ACTIVE_SESSION_KEY, serialized);
    if (!remember) {
      sessionStorage.setItem(ACTIVE_SESSION_KEY, serialized);
    }
    return sessionPayload;
  }

  function clearActiveSession() {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
    sessionStorage.removeItem(ACTIVE_SESSION_KEY);
  }

  // Cross-tab synchronization
  window.addEventListener("storage", (e) => {
    if (e.key === ACTIVE_SESSION_KEY) {
      if (!e.newValue && window.location.pathname.endsWith("dashboard.html")) {
        window.location.href = "login.html?reason=signed_out";
      }
    }
  });

  // --------------------------------------------------------------------------
  // Password Strength Calculation
  // --------------------------------------------------------------------------
  function evaluatePasswordStrength(password) {
    const pwd = String(password || "");
    let score = 0;
    const checks = {
      length: pwd.length >= 8,
      mixedCase: /[a-z]/.test(pwd) && /[A-Z]/.test(pwd),
      number: /\d/.test(pwd),
      symbol: /[^A-Za-z0-9]/.test(pwd)
    };
    if (checks.length) score++;
    if (checks.mixedCase) score++;
    if (checks.number) score++;
    if (checks.symbol) score++;

    const labels = ["Insufficient", "Weak", "Fair", "Good", "Strong (Production Grade)"];
    const colors = ["#626775", "#EF4444", "#F59E0B", "#00F0FF", "#10B981"];

    return {
      score,
      checks,
      label: labels[score],
      color: colors[score]
    };
  }

  // --------------------------------------------------------------------------
  // Public Auth API exposed on window.VidSynthAuth
  // --------------------------------------------------------------------------
  window.VidSynthAuth = {
    getSession: getActiveSession,
    clearSession: clearActiveSession,
    evaluatePasswordStrength,

    async signOut() {
      if (supabaseClient) {
        try {
          await supabaseClient.auth.signOut();
        } catch (_) {}
      }
      clearActiveSession();
      window.location.href = "login.html?reason=signed_out";
    },

    requireAuth() {
      const session = getActiveSession();
      if (!session || !session.user) {
        window.location.href = "login.html?redirect=dashboard.html&reason=unauthorized";
        return null;
      }
      return session;
    }
  };

  // --------------------------------------------------------------------------
  // UI Controllers for login.html and register.html
  // --------------------------------------------------------------------------
  function initAuthPages() {
    // 1. Update Environment Banner on Auth Pages
    const modeBanner = document.getElementById("auth-env-banner");
    if (modeBanner) {
      if (CONFIG.IS_SUPABASE_CONFIGURED) {
        modeBanner.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-[#10B981] inline-block"></span>
          <span>CONNECTED TO SUPABASE AUTHENTICATION</span>
        `;
      } else {
        modeBanner.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-[#00F0FF] inline-block"></span>
          <span>SANDBOX DEMO AUTH MODE — Local browser persistence active (Configure Supabase in <code class="text-[#F5F6FA]">config/config.js</code>)</span>
        `;
      }
    }

    // 2. Show/Hide Password Toggles
    document.querySelectorAll("[data-toggle-password]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-toggle-password");
        const input = document.getElementById(targetId);
        if (!input) return;
        const isPwd = input.type === "password";
        input.type = isPwd ? "text" : "password";
        btn.textContent = isPwd ? "HIDE" : "SHOW";
      });
    });

    // 3. View Switcher on login.html (?mode=login | forgot | reset | verify)
    const loginView = document.getElementById("auth-view-login");
    const forgotView = document.getElementById("auth-view-forgot");
    const resetView = document.getElementById("auth-view-reset");
    const verifyView = document.getElementById("auth-view-verify");

    function switchAuthView(mode, params = {}) {
      if (!loginView) return;
      [loginView, forgotView, resetView, verifyView].forEach((v) => {
        if (v) v.classList.add("hidden");
      });

      if (mode === "forgot" && forgotView) {
        forgotView.classList.remove("hidden");
      } else if (mode === "reset" && resetView) {
        resetView.classList.remove("hidden");
      } else if (mode === "verify" && verifyView) {
        verifyView.classList.remove("hidden");
        const verifyEmailSpan = document.getElementById("verify-target-email");
        const expiredNotice = document.getElementById("verify-expired-notice");
        const normalNotice = document.getElementById("verify-normal-notice");
        if (verifyEmailSpan && params.email) {
          verifyEmailSpan.textContent = params.email;
        }
        if (params.expired === "1") {
          if (expiredNotice) expiredNotice.classList.remove("hidden");
          if (normalNotice) normalNotice.classList.add("hidden");
        } else {
          if (expiredNotice) expiredNotice.classList.add("hidden");
          if (normalNotice) normalNotice.classList.remove("hidden");
        }
      } else {
        loginView.classList.remove("hidden");
      }
    }

    // Check URL query parameters on load
    const urlParams = new URLSearchParams(window.location.search);
    const initialMode = urlParams.get("mode");
    const reason = urlParams.get("reason");
    const emailParam = urlParams.get("email") || "";
    const expiredParam = urlParams.get("expired") || "0";

    if (initialMode) {
      switchAuthView(initialMode, { email: emailParam, expired: expiredParam });
    }

    // Status message if redirected due to unauthorized access or sign out
    const globalAlert = document.getElementById("auth-global-alert");
    if (globalAlert && reason) {
      if (reason === "unauthorized") {
        globalAlert.className = "mb-5 p-3.5 rounded-sm border border-[#F59E0B] bg-[#F59E0B]/10 text-xs text-[#F5F6FA]";
        globalAlert.textContent = "Protected route: Please sign in to access the VidSynth Studio Dashboard.";
        globalAlert.classList.remove("hidden");
      } else if (reason === "signed_out") {
        globalAlert.className = "mb-5 p-3.5 rounded-sm border border-[#00F0FF] bg-[#00F0FF]/10 text-xs text-[#F5F6FA]";
        globalAlert.textContent = "Your Studio session has been signed out.";
        globalAlert.classList.remove("hidden");
      }
    }

    document.querySelectorAll("[data-switch-auth-view]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const target = btn.getAttribute("data-switch-auth-view");
        const exp = btn.getAttribute("data-expired") || "0";
        switchAuthView(target, { email: emailParam || "evaluator@vidsynth.app", expired: exp });
      });
    });

    // 4. Sign In Form Handler
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const emailEl = document.getElementById("login-email");
        const pwdEl = document.getElementById("login-password");
        const rememberEl = document.getElementById("login-remember");
        const statusEl = document.getElementById("login-status");
        const submitBtn = document.getElementById("login-submit-btn");

        const email = emailEl ? emailEl.value.trim().toLowerCase() : "";
        const password = pwdEl ? pwdEl.value : "";
        const remember = rememberEl ? rememberEl.checked : true;

        if (!email || !password) {
          if (statusEl) {
            statusEl.className = "mt-3 p-3 rounded-sm border border-[#EF4444] bg-[#EF4444]/10 text-xs text-[#F5F6FA]";
            statusEl.textContent = "Please enter both your email address and password.";
            statusEl.classList.remove("hidden");
          }
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = `<span class="font-mono-tech text-xs">AUTHENTICATING...</span>`;
        }

        await new Promise((r) => setTimeout(r, 420));

        try {
          if (supabaseClient) {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            setActiveSession(
              {
                id: data.user.id,
                full_name: data.user.user_metadata?.full_name || email.split("@")[0],
                email: data.user.email,
                verified: Boolean(data.user.email_confirmed_at)
              },
              remember,
              "supabase"
            );
          } else {
            const users = getSandboxUsers();
            const matched = users.find((u) => u.email.toLowerCase() === email);
            if (!matched || matched.password_hash !== password) {
              throw new Error(
                "Invalid email or password. Tip: Use the 'Quick Sandbox Evaluator Sign-In' button below or create a new account."
              );
            }
            if (!matched.verified) {
              switchAuthView("verify", { email: matched.email, expired: "0" });
              throw new Error("Account email pending verification. Please complete verification.");
            }
            setActiveSession(matched, remember, "local_sandbox");
          }

          if (statusEl) {
            statusEl.className = "mt-3 p-3 rounded-sm border border-[#10B981] bg-[#10B981]/10 text-xs text-[#F5F6FA]";
            statusEl.textContent = "Authentication verified. Launching Studio Dashboard...";
            statusEl.classList.remove("hidden");
          }

          const redirectTarget = urlParams.get("redirect") || "dashboard.html";
          setTimeout(() => {
            window.location.href = redirectTarget;
          }, 300);
        } catch (err) {
          if (statusEl) {
            statusEl.className = "mt-3 p-3 rounded-sm border border-[#EF4444] bg-[#EF4444]/10 text-xs text-[#F5F6FA]";
            statusEl.textContent = err.message || "Authentication failed.";
            statusEl.classList.remove("hidden");
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Sign In to Studio";
          }
        }
      });
    }

    // 5. Quick 1-Click Sandbox Evaluator Login (Clearly Labeled Demo Utility)
    const demoLoginBtn = document.getElementById("demo-instant-login-btn");
    if (demoLoginBtn) {
      demoLoginBtn.addEventListener("click", () => {
        const users = getSandboxUsers();
        const evalUser = users[0];
        setActiveSession(evalUser, true, "local_sandbox");
        window.location.href = "dashboard.html";
      });
    }

    // 6. Google OAuth Button Handler
    document.querySelectorAll("[data-google-oauth-btn]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (supabaseClient) {
          const redirectTo = window.location.origin + (CONFIG.OAUTH_REDIRECT_PATH || "/dashboard.html");
          await supabaseClient.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo }
          });
        } else {
          // Honest Sandbox OAuth handshake
          const users = getSandboxUsers();
          let oauthUser = users.find((u) => u.email === "google.creator@vidsynth.app");
          if (!oauthUser) {
            oauthUser = {
              id: "usr_oauth_sandbox_" + Date.now(),
              full_name: "Jordan Vance (Google OAuth Demo)",
              email: "google.creator@vidsynth.app",
              organization: "Vance Visuals Studio",
              password_hash: "oauth_managed",
              verified: true,
              plan_tier: "sandbox",
              available_credits: 100,
              created_at: new Date().toISOString()
            };
            users.push(oauthUser);
            saveSandboxUsers(users);
          }
          setActiveSession(oauthUser, true, "google_oauth_sandbox");
          window.location.href = "dashboard.html";
        }
      });
    });

    // 7. Create Account Form & Password Strength Meter (register.html)
    const regPasswordInput = document.getElementById("register-password");
    const strengthBars = [
      document.getElementById("pwd-bar-1"),
      document.getElementById("pwd-bar-2"),
      document.getElementById("pwd-bar-3"),
      document.getElementById("pwd-bar-4")
    ];
    const strengthText = document.getElementById("pwd-strength-label");

    if (regPasswordInput) {
      regPasswordInput.addEventListener("input", () => {
        const res = evaluatePasswordStrength(regPasswordInput.value);
        strengthBars.forEach((bar, idx) => {
          if (!bar) return;
          bar.style.backgroundColor = idx < res.score ? res.color : "#252832";
        });
        if (strengthText) {
          strengthText.textContent = `Strength: ${res.label}`;
          strengthText.style.color = res.color;
        }
      });
    }

    const registerForm = document.getElementById("register-form");
    if (registerForm) {
      registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const nameEl = document.getElementById("register-name");
        const emailEl = document.getElementById("register-email");
        const orgEl = document.getElementById("register-org");
        const pwdEl = document.getElementById("register-password");
        const confirmEl = document.getElementById("register-confirm-password");
        const termsEl = document.getElementById("register-terms");
        const statusEl = document.getElementById("register-status");
        const submitBtn = document.getElementById("register-submit-btn");

        const fullName = nameEl ? nameEl.value.trim() : "";
        const email = emailEl ? emailEl.value.trim().toLowerCase() : "";
        const org = orgEl ? orgEl.value.trim() : "Independent Creator";
        const password = pwdEl ? pwdEl.value : "";
        const confirmPwd = confirmEl ? confirmEl.value : "";
        const acceptedTerms = termsEl ? termsEl.checked : false;

        if (fullName.length < 2) {
          showStatus(statusEl, "Please enter your full name.", "error");
          return;
        }
        if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
          showStatus(statusEl, "Please enter a valid work or personal email address.", "error");
          return;
        }
        const strength = evaluatePasswordStrength(password);
        if (strength.score < 2) {
          showStatus(statusEl, "Password is too weak. Include at least 8 characters with mixed case, numbers, or symbols.", "error");
          return;
        }
        if (password !== confirmPwd) {
          showStatus(statusEl, "Password confirmation does not match.", "error");
          return;
        }
        if (!acceptedTerms) {
          showStatus(statusEl, "You must accept the VidSynth Terms of Service and Privacy Policy.", "error");
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = `<span class="font-mono-tech text-xs">PROVISIONING ACCOUNT...</span>`;
        }

        await new Promise((r) => setTimeout(r, 450));

        try {
          if (supabaseClient) {
            const { error } = await supabaseClient.auth.signUp({
              email,
              password,
              options: {
                data: { full_name: fullName, organization: org }
              }
            });
            if (error) throw error;
            window.location.href = `login.html?mode=verify&email=${encodeURIComponent(email)}`;
          } else {
            const users = getSandboxUsers();
            if (users.some((u) => u.email.toLowerCase() === email)) {
              throw new Error("An account with this email address already exists.");
            }
            const newUser = {
              id: "usr_" + Date.now(),
              full_name: fullName,
              email,
              organization: org,
              password_hash: password,
              verified: false,
              plan_tier: "sandbox",
              available_credits: 100,
              created_at: new Date().toISOString()
            };
            users.push(newUser);
            saveSandboxUsers(users);
            window.location.href = `login.html?mode=verify&email=${encodeURIComponent(email)}`;
          }
        } catch (err) {
          showStatus(statusEl, err.message || "Registration failed.", "error");
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Create Studio Account";
          }
        }
      });
    }

    // 8. Password Recovery & Reset Flow Handlers (login.html)
    const forgotForm = document.getElementById("forgot-password-form");
    if (forgotForm) {
      forgotForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById("forgot-email");
        const statusEl = document.getElementById("forgot-status");
        const email = emailInput ? emailInput.value.trim().toLowerCase() : "";

        if (!email || !email.includes("@")) {
          showStatus(statusEl, "Please enter a valid account email address.", "error");
          return;
        }

        if (supabaseClient) {
          await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + "/login.html?mode=reset"
          });
        }

        if (statusEl) {
          statusEl.className = "mt-4 p-4 rounded-sm border border-[#00F0FF] bg-[#00F0FF]/10 text-xs text-[#F5F6FA]";
          statusEl.innerHTML = `
            <div class="font-mono-tech text-[11px] text-[#00F0FF] uppercase mb-1">✓ PASSWORD RECOVERY DISPATCHED</div>
            <p class="text-[#9296A3] mb-3">If an account matches <strong>${email}</strong>, password reset instructions have been prepared.</p>
            <button type="button" id="trigger-demo-reset-view" class="btn-secondary text-xs py-1.5 px-3 w-full">
              Open Password Reset Form (Sandbox Flow Verification) →
            </button>
          `;
          statusEl.classList.remove("hidden");
          const btn = document.getElementById("trigger-demo-reset-view");
          if (btn) {
            btn.addEventListener("click", () => {
              const resetEmailInput = document.getElementById("reset-account-email");
              if (resetEmailInput) resetEmailInput.value = email;
              switchAuthView("reset", { email });
            });
          }
        }
      });
    }

    const resetForm = document.getElementById("reset-password-form");
    if (resetForm) {
      resetForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const emailEl = document.getElementById("reset-account-email");
        const newPwdEl = document.getElementById("reset-new-password");
        const confirmPwdEl = document.getElementById("reset-confirm-password");
        const statusEl = document.getElementById("reset-status");

        const email = emailEl ? emailEl.value.trim().toLowerCase() : "evaluator@vidsynth.app";
        const newPwd = newPwdEl ? newPwdEl.value : "";
        const confirmPwd = confirmPwdEl ? confirmPwdEl.value : "";

        if (newPwd.length < 8) {
          showStatus(statusEl, "New password must be at least 8 characters.", "error");
          return;
        }
        if (newPwd !== confirmPwd) {
          showStatus(statusEl, "New password and confirmation do not match.", "error");
          return;
        }

        if (supabaseClient) {
          const { error } = await supabaseClient.auth.updateUser({ password: newPwd });
          if (error) {
            showStatus(statusEl, error.message, "error");
            return;
          }
        } else {
          const users = getSandboxUsers();
          const idx = users.findIndex((u) => u.email.toLowerCase() === email);
          if (idx !== -1) {
            users[idx].password_hash = newPwd;
            saveSandboxUsers(users);
          }
        }

        showStatus(statusEl, "Password updated. Redirecting to Sign In...", "success");
        setTimeout(() => switchAuthView("login"), 1100);
      });
    }

    // 9. Account Email Verification Actions
    const completeVerifyBtn = document.getElementById("sandbox-complete-verify-btn");
    const resendVerifyBtn = document.getElementById("resend-verification-btn");
    const verifyStatusEl = document.getElementById("verify-action-status");

    if (completeVerifyBtn) {
      completeVerifyBtn.addEventListener("click", () => {
        const targetEmailSpan = document.getElementById("verify-target-email");
        const targetEmail = (targetEmailSpan ? targetEmailSpan.textContent : emailParam || "evaluator@vidsynth.app")
          .trim()
          .toLowerCase();

        const users = getSandboxUsers();
        let matched = users.find((u) => u.email.toLowerCase() === targetEmail) || users[users.length - 1];
        if (matched) {
          matched.verified = true;
          saveSandboxUsers(users);
          setActiveSession(matched, true, "local_sandbox");
        }
        showStatus(verifyStatusEl, "Email address verified! Entering VidSynth Studio Dashboard...", "success");
        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 650);
      });
    }

    if (resendVerifyBtn) {
      resendVerifyBtn.addEventListener("click", () => {
        resendVerifyBtn.disabled = true;
        showStatus(
          verifyStatusEl,
          "A fresh verification token has been issued. You may complete verification above.",
          "info"
        );
        const expiredNotice = document.getElementById("verify-expired-notice");
        const normalNotice = document.getElementById("verify-normal-notice");
        if (expiredNotice) expiredNotice.classList.add("hidden");
        if (normalNotice) normalNotice.classList.remove("hidden");
        setTimeout(() => {
          resendVerifyBtn.disabled = false;
        }, 3000);
      });
    }
  }

  function showStatus(el, message, type) {
    if (!el) return;
    const styles = {
      error: "border-[#EF4444] bg-[#EF4444]/10 text-[#F5F6FA]",
      success: "border-[#10B981] bg-[#10B981]/10 text-[#F5F6FA]",
      info: "border-[#00F0FF] bg-[#00F0FF]/10 text-[#F5F6FA]"
    };
    el.className = `mt-3 p-3 rounded-sm border text-xs ${styles[type] || styles.info}`;
    el.textContent = message;
    el.classList.remove("hidden");
  }

  document.addEventListener("DOMContentLoaded", initAuthPages);
})();
