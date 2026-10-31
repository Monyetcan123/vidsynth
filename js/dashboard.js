/**
 * VIDSYNTH — CUSTOMER STUDIO DASHBOARD ENGINE (js/dashboard.js)
 * ============================================================================
 * Implements:
 * - Protected route verification via window.VidSynthAuth.requireAuth()
 * - 10 Sidebar Views: Overview, Create Project, My Projects, Render History,
 *   Models, Assets, Credits & Usage, Billing, Settings, Help Center
 * - Full Project CRUD: Create, Rename (modal), Delete (confirmation modal),
 *   Filter/Search, and Sandbox Pipeline Pass Simulation
 * - Auditable Credit Ledger & Render Job History scoped strictly to authenticated user
 */

(function initStudioDashboard() {
  const CONFIG = window.VIDSYNTH_CONFIG || {
    IS_SUPABASE_CONFIGURED: false,
    RUNTIME_MODE: "LOCAL_SANDBOX_DEMO"
  };

  let currentSession = null;
  let projects = [];
  let renderJobs = [];
  let creditLedger = [];
  let activeRenameProjectId = null;
  let activeDeleteProjectId = null;

  function storageKey(prefix) {
    const uid = currentSession && currentSession.user ? currentSession.user.id : "anon";
    return `vidsynth_${prefix}_${uid}_v1`;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDateTime(isoString) {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (_) {
      return isoString;
    }
  }

  // --------------------------------------------------------------------------
  // Data Persistence Layer (Supabase or User-Scoped Local Storage)
  // --------------------------------------------------------------------------
  function loadUserData() {
    try {
      const rawProj = localStorage.getItem(storageKey("projects"));
      projects = rawProj ? JSON.parse(rawProj) : getInitialDemoProjects();
      if (!rawProj) saveProjects();

      const rawJobs = localStorage.getItem(storageKey("render_jobs"));
      renderJobs = rawJobs ? JSON.parse(rawJobs) : [];

      const rawLedger = localStorage.getItem(storageKey("credit_ledger"));
      if (rawLedger) {
        creditLedger = JSON.parse(rawLedger);
      } else {
        creditLedger = [
          {
            id: "led_init_01",
            delta: 100,
            balance_after: 100,
            reason: "Initial Sandbox Evaluation Allocation (Demo Environment)",
            reference_type: "system_grant",
            created_at: currentSession.user.created_at || new Date().toISOString()
          }
        ];
        saveCreditLedger();
      }
    } catch (e) {
      console.error("Failed loading user studio state:", e);
      projects = [];
      renderJobs = [];
      creditLedger = [];
    }
  }

  function getInitialDemoProjects() {
    const now = new Date().toISOString();
    return [
      {
        id: "proj_demo_chronos_01",
        name: "[DEMO SEED] Chronos — Neo-Tokyo Character Pass",
        transformation_mode: "Character Transformation",
        model_id: "VS-CHAR-2.4",
        motion_preset: "Dolly In",
        resolution: "1920x1080",
        fps: 24,
        export_format: "16-bit OpenEXR",
        project_status: "configured",
        render_status: "idle",
        notes: "Seeded demonstration project for evaluating character conditioning settings.",
        created_at: now,
        updated_at: now
      }
    ];
  }

  function saveProjects() {
    localStorage.setItem(storageKey("projects"), JSON.stringify(projects));
  }

  function saveRenderJobs() {
    localStorage.setItem(storageKey("render_jobs"), JSON.stringify(renderJobs));
  }

  function saveCreditLedger() {
    localStorage.setItem(storageKey("credit_ledger"), JSON.stringify(creditLedger));
  }

  function getCurrentCredits() {
    if (creditLedger.length > 0) {
      return creditLedger[0].balance_after;
    }
    return currentSession?.user?.available_credits ?? 100;
  }

  // --------------------------------------------------------------------------
  // View Navigation Controller
  // --------------------------------------------------------------------------
  function switchDashboardView(viewId) {
    const navButtons = document.querySelectorAll("[data-dash-nav]");
    const viewSections = document.querySelectorAll("[data-dash-view]");
    const headerTitle = document.getElementById("dash-current-view-title");

    const titleMap = {
      overview: "Studio Overview",
      "create-project": "Create New Project",
      projects: "My Projects",
      "render-history": "Render History & Job Telemetry",
      models: "Conditioning Models Catalog",
      assets: "Reference Plates & Media Assets",
      credits: "Credits & Consumption Ledger",
      billing: "Commercial Plan & Billing Architecture",
      settings: "Account & Environment Settings",
      help: "Documentation & Help Center"
    };

    navButtons.forEach((btn) => {
      const target = btn.getAttribute("data-dash-nav");
      if (target === viewId) {
        btn.classList.add("active");
        btn.setAttribute("aria-current", "page");
      } else {
        btn.classList.remove("active");
        btn.removeAttribute("aria-current");
      }
    });

    viewSections.forEach((sec) => {
      const key = sec.getAttribute("data-dash-view");
      if (key === viewId) {
        sec.classList.remove("hidden");
      } else {
        sec.classList.add("hidden");
      }
    });

    if (headerTitle && titleMap[viewId]) {
      headerTitle.textContent = titleMap[viewId];
    }

    // Close mobile sidebar if open
    const sidebar = document.getElementById("dash-sidebar");
    if (sidebar && window.innerWidth < 1024) {
      sidebar.classList.add("-translate-x-full");
    }

    renderAllDashboardWidgets();
  }

  // --------------------------------------------------------------------------
  // Render Dashboard Metrics, Tables & Cards
  // --------------------------------------------------------------------------
  function renderAllDashboardWidgets() {
    if (!currentSession || !currentSession.user) return;
    const u = currentSession.user;
    const credits = getCurrentCredits();

    // Header & Welcome User Info
    document.querySelectorAll("[data-user-fullname]").forEach((el) => (el.textContent = u.full_name));
    document.querySelectorAll("[data-user-email]").forEach((el) => (el.textContent = u.email));
    document.querySelectorAll("[data-user-org]").forEach((el) => (el.textContent = u.organization || "Independent Studio"));
    document.querySelectorAll("[data-user-credits]").forEach((el) => (el.textContent = `${credits} CR`));
    document.querySelectorAll("[data-project-count]").forEach((el) => (el.textContent = String(projects.length)));
    document.querySelectorAll("[data-render-count]").forEach((el) => (el.textContent = String(renderJobs.length)));

    const totalConsumed = creditLedger
      .filter((item) => item.delta < 0)
      .reduce((acc, item) => acc + Math.abs(item.delta), 0);
    document.querySelectorAll("[data-credits-consumed]").forEach((el) => (el.textContent = `${totalConsumed} CR`));

    renderOverviewRecentProjects();
    renderProjectsList();
    renderRenderHistoryTable();
    renderCreditLedgerTable();
  }

  function getStatusBadgeHtml(status) {
    const map = {
      draft: `<span class="px-2 py-0.5 text-[10px] font-mono-tech uppercase rounded-xs border border-[#626775] text-[#9296A3]">DRAFT</span>`,
      configured: `<span class="px-2 py-0.5 text-[10px] font-mono-tech uppercase rounded-xs border border-[#00F0FF]/50 bg-[#00F0FF]/10 text-[#00F0FF]">CONFIGURED</span>`,
      simulated_complete: `<span class="px-2 py-0.5 text-[10px] font-mono-tech uppercase rounded-xs border border-[#10B981]/50 bg-[#10B981]/10 text-[#10B981]">SIMULATED READY</span>`
    };
    return map[status] || map.configured;
  }

  function getRenderBadgeHtml(rStatus) {
    const map = {
      idle: `<span class="text-xs font-mono-tech text-[#9296A3]">● Idle (Not Queued)</span>`,
      processing: `<span class="text-xs font-mono-tech text-[#F59E0B]">● Simulating Pass...</span>`,
      completed: `<span class="text-xs font-mono-tech text-[#10B981]">● Simulation Complete</span>`
    };
    return map[rStatus] || map.idle;
  }

  function renderOverviewRecentProjects() {
    const container = document.getElementById("overview-recent-projects");
    if (!container) return;

    if (projects.length === 0) {
      container.innerHTML = `
        <div class="p-8 text-center border border-dashed border-[#252832] rounded-sm bg-[#08080C]">
          <p class="text-sm text-[#F5F6FA] font-medium mb-1">No Projects in Workspace</p>
          <p class="text-xs text-[#9296A3] mb-4">Create your first character transformation or motion conditioning project to begin.</p>
          <div class="flex items-center justify-center gap-3">
            <button type="button" data-goto-create class="btn-primary text-xs py-2 px-4">+ Create New Project</button>
            <button type="button" data-seed-demo-project class="btn-secondary text-xs py-2 px-4">Seed Reference Project [DEMO]</button>
          </div>
        </div>
      `;
      bindDynamicProjectActions(container);
      return;
    }

    const recent = projects.slice(0, 3);
    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-[#252832] text-[11px] font-mono-tech uppercase text-[#626775]">
              <th class="py-2.5 px-3">Project Name</th>
              <th class="py-2.5 px-3">Conditioning Mode</th>
              <th class="py-2.5 px-3">Spec</th>
              <th class="py-2.5 px-3">Project Status</th>
              <th class="py-2.5 px-3">Last Modified</th>
              <th class="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#252832] text-xs">
            ${recent
              .map(
                (p) => `
              <tr class="hover:bg-[#151720]/60 transition-colors">
                <td class="py-3 px-3 font-medium text-[#F5F6FA]">${escapeHtml(p.name)}</td>
                <td class="py-3 px-3 text-[#9296A3]">
                  <span class="font-mono-tech text-[11px] text-[#00F0FF] mr-1.5">${escapeHtml(p.model_id)}</span>
                  ${escapeHtml(p.transformation_mode)}
                </td>
                <td class="py-3 px-3 font-mono-tech text-[11px] text-[#9296A3]">${escapeHtml(p.resolution)} @ ${p.fps}fps</td>
                <td class="py-3 px-3">${getStatusBadgeHtml(p.project_status)}</td>
                <td class="py-3 px-3 font-mono-tech text-[11px] text-[#626775]">${formatDateTime(p.updated_at)}</td>
                <td class="py-3 px-3 text-right whitespace-nowrap">
                  <button type="button" data-simulate-render="${p.id}" class="text-[11px] font-mono-tech text-[#00F0FF] hover:underline mr-3">Simulate Pass</button>
                  <button type="button" data-rename-project="${p.id}" class="text-[11px] font-mono-tech text-[#9296A3] hover:text-[#F5F6FA] mr-3">Rename</button>
                  <button type="button" data-delete-project="${p.id}" class="text-[11px] font-mono-tech text-[#EF4444] hover:underline">Delete</button>
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
    bindDynamicProjectActions(container);
  }

  function renderProjectsList() {
    const container = document.getElementById("projects-list-container");
    const searchInput = document.getElementById("project-search-input");
    const filterSelect = document.getElementById("project-status-filter");
    if (!container) return;

    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    const statusFilter = filterSelect ? filterSelect.value : "all";

    const filtered = projects.filter((p) => {
      const matchesQuery =
        !query ||
        p.name.toLowerCase().includes(query) ||
        p.transformation_mode.toLowerCase().includes(query) ||
        p.model_id.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || p.project_status === statusFilter;
      return matchesQuery && matchesStatus;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="p-10 text-center border border-dashed border-[#252832] rounded-sm bg-[#08080C]">
          <p class="text-sm font-medium text-[#F5F6FA] mb-1">No Matching Studio Projects</p>
          <p class="text-xs text-[#9296A3] mb-5">Create a new project or seed a demonstration reference project to test project management controls.</p>
          <div class="flex flex-wrap items-center justify-center gap-3">
            <button type="button" data-goto-create class="btn-primary text-xs py-2 px-4">+ Create New Project</button>
            <button type="button" data-seed-demo-project class="btn-secondary text-xs py-2 px-4">Seed Reference Project [DEMO]</button>
          </div>
        </div>
      `;
      bindDynamicProjectActions(container);
      return;
    }

    container.innerHTML = `
      <div class="grid grid-cols-1 gap-4">
        ${filtered
          .map(
            (p) => `
          <div class="surface-elevated p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:border-[#3A3F50] transition-colors">
            <div class="space-y-1.5">
              <div class="flex flex-wrap items-center gap-2.5">
                <h3 class="text-sm font-semibold text-[#F5F6FA]">${escapeHtml(p.name)}</h3>
                ${getStatusBadgeHtml(p.project_status)}
                <span class="px-2 py-0.5 text-[10px] font-mono-tech rounded-xs bg-[#08080C] border border-[#252832] text-[#00F0FF]">${escapeHtml(p.model_id)}</span>
              </div>
              <div class="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[#9296A3]">
                <span>Mode: <strong class="text-[#F5F6FA] font-normal">${escapeHtml(p.transformation_mode)}</strong></span>
                <span>Motion Rig: <strong class="text-[#F5F6FA] font-normal">${escapeHtml(p.motion_preset)}</strong></span>
                <span class="font-mono-tech text-[11px]">${escapeHtml(p.resolution)} • ${p.fps}fps • ${escapeHtml(p.export_format)}</span>
              </div>
              <div class="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] font-mono-tech text-[#626775]">
                <span>Created: ${formatDateTime(p.created_at)}</span>
                <span>Modified: ${formatDateTime(p.updated_at)}</span>
                <span>Render State: ${getRenderBadgeHtml(p.render_status)}</span>
              </div>
              ${p.notes ? `<p class="text-xs text-[#9296A3] pt-1 italic">"${escapeHtml(p.notes)}"</p>` : ""}
            </div>
            <div class="flex flex-wrap items-center gap-2 shrink-0">
              <button type="button" data-simulate-render="${p.id}" class="btn-primary text-xs py-2 px-3.5">
                Simulate Render Pass (10 CR)
              </button>
              <button type="button" data-rename-project="${p.id}" class="btn-secondary text-xs py-2 px-3">
                Rename
              </button>
              <button type="button" data-delete-project="${p.id}" class="btn-secondary text-xs py-2 px-3 text-[#EF4444] hover:border-[#EF4444]">
                Delete
              </button>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    `;
    bindDynamicProjectActions(container);
  }

  function renderRenderHistoryTable() {
    const container = document.getElementById("render-history-container");
    if (!container) return;

    if (renderJobs.length === 0) {
      container.innerHTML = `
        <div class="p-8 text-center border border-dashed border-[#252832] rounded-sm bg-[#08080C]">
          <p class="text-sm font-medium text-[#F5F6FA] mb-1">No Render Jobs Logged Yet</p>
          <p class="text-xs text-[#9296A3]">In compliance with VidSynth data integrity rules, new accounts do not display fabricated render histories. Click "Simulate Render Pass" on any project to test pipeline execution logging.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-[#252832] text-[11px] font-mono-tech uppercase text-[#626775]">
              <th class="py-2.5 px-3">Job ID</th>
              <th class="py-2.5 px-3">Project</th>
              <th class="py-2.5 px-3">Model & Pass</th>
              <th class="py-2.5 px-3">Output Spec</th>
              <th class="py-2.5 px-3">Execution Environment</th>
              <th class="py-2.5 px-3">Credits</th>
              <th class="py-2.5 px-3">Timestamp</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#252832] text-xs">
            ${renderJobs
              .map(
                (j) => `
              <tr class="hover:bg-[#151720]/60">
                <td class="py-3 px-3 font-mono-tech text-[11px] text-[#00F0FF]">${escapeHtml(j.id)}</td>
                <td class="py-3 px-3 font-medium text-[#F5F6FA]">${escapeHtml(j.project_name_snapshot)}</td>
                <td class="py-3 px-3 text-[#9296A3]">${escapeHtml(j.model_id)} • ${escapeHtml(j.pass_type)}</td>
                <td class="py-3 px-3 font-mono-tech text-[11px] text-[#9296A3]">${escapeHtml(j.resolution)} (${j.frame_count}F)</td>
                <td class="py-3 px-3">
                  <span class="px-2 py-0.5 text-[10px] font-mono-tech uppercase rounded-xs border border-[#7161FF]/50 bg-[#7161FF]/15 text-[#F5F6FA]">
                    SANDBOX SIMULATION
                  </span>
                </td>
                <td class="py-3 px-3 font-mono-tech text-[11px] text-[#F59E0B]">-${j.credits_consumed} CR</td>
                <td class="py-3 px-3 font-mono-tech text-[11px] text-[#626775]">${formatDateTime(j.created_at)}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderCreditLedgerTable() {
    const container = document.getElementById("credit-ledger-container");
    if (!container) return;

    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-[#252832] text-[11px] font-mono-tech uppercase text-[#626775]">
              <th class="py-2.5 px-3">Event ID</th>
              <th class="py-2.5 px-3">Description / Reason</th>
              <th class="py-2.5 px-3">Change</th>
              <th class="py-2.5 px-3">Balance After</th>
              <th class="py-2.5 px-3">Timestamp</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#252832] text-xs">
            ${creditLedger
              .map(
                (entry) => `
              <tr>
                <td class="py-3 px-3 font-mono-tech text-[11px] text-[#9296A3]">${escapeHtml(entry.id)}</td>
                <td class="py-3 px-3 text-[#F5F6FA]">${escapeHtml(entry.reason)}</td>
                <td class="py-3 px-3 font-mono-tech text-[11px] ${
                  entry.delta >= 0 ? "text-[#10B981]" : "text-[#F59E0B]"
                }">
                  ${entry.delta >= 0 ? `+${entry.delta} CR` : `${entry.delta} CR`}
                </td>
                <td class="py-3 px-3 font-mono-tech text-[11px] text-[#F5F6FA]">${entry.balance_after} CR</td>
                <td class="py-3 px-3 font-mono-tech text-[11px] text-[#626775]">${formatDateTime(entry.created_at)}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // Dynamic Project Action Handlers (Create, Rename, Delete, Simulate Pass)
  // --------------------------------------------------------------------------
  function bindDynamicProjectActions(rootEl) {
    rootEl.querySelectorAll("[data-goto-create]").forEach((btn) => {
      btn.addEventListener("click", () => switchDashboardView("create-project"));
    });

    rootEl.querySelectorAll("[data-seed-demo-project]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const now = new Date().toISOString();
        projects.unshift({
          id: "proj_seed_" + Date.now().toString().slice(-5),
          name: "[DEMO SEED] Valence — Semantic Armor Pass",
          transformation_mode: "Segmentation Mask",
          model_id: "VS-MATTE-3.0",
          motion_preset: "360° Orbit",
          resolution: "2560x1440",
          fps: 24,
          export_format: "16-bit OpenEXR",
          project_status: "configured",
          render_status: "idle",
          notes: "Seeded demonstration project for inspecting multi-pass EXR conditioning.",
          created_at: now,
          updated_at: now
        });
        saveProjects();
        renderAllDashboardWidgets();
        if (window.VidSynthToast) {
          window.VidSynthToast.show("Seeded reference demonstration project into your workspace.", "info");
        }
      });
    });

    rootEl.querySelectorAll("[data-rename-project]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pid = btn.getAttribute("data-rename-project");
        openRenameModal(pid);
      });
    });

    rootEl.querySelectorAll("[data-delete-project]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pid = btn.getAttribute("data-delete-project");
        openDeleteModal(pid);
      });
    });

    rootEl.querySelectorAll("[data-simulate-render]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pid = btn.getAttribute("data-simulate-render");
        simulateProjectRender(pid, btn);
      });
    });
  }

  function openRenameModal(projectId) {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return;
    activeRenameProjectId = projectId;
    const modal = document.getElementById("rename-project-modal");
    const input = document.getElementById("rename-project-input");
    if (input) input.value = proj.name;
    if (modal) modal.classList.remove("hidden");
  }

  function openDeleteModal(projectId) {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return;
    activeDeleteProjectId = projectId;
    const modal = document.getElementById("delete-project-modal");
    const nameSpan = document.getElementById("delete-project-target-name");
    if (nameSpan) nameSpan.textContent = proj.name;
    if (modal) modal.classList.remove("hidden");
  }

  function simulateProjectRender(projectId, triggerBtn) {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return;

    const currentBalance = getCurrentCredits();
    const cost = 10;
    if (currentBalance < cost) {
      if (window.VidSynthToast) {
        window.VidSynthToast.show(
          "Insufficient Sandbox evaluation credits (10 CR required). Reset your demo credit allocation in Credits & Usage.",
          "warning"
        );
      }
      return;
    }

    proj.render_status = "processing";
    saveProjects();
    renderAllDashboardWidgets();

    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.textContent = "Simulating Pass...";
    }

    setTimeout(() => {
      const now = new Date().toISOString();
      proj.project_status = "simulated_complete";
      proj.render_status = "completed";
      proj.updated_at = now;
      saveProjects();

      const newBalance = Math.max(0, currentBalance - cost);
      const jobId = "JOB-" + Date.now().toString().slice(-6);

      renderJobs.unshift({
        id: jobId,
        project_id: proj.id,
        project_name_snapshot: proj.name,
        model_id: proj.model_id,
        pass_type: proj.transformation_mode,
        resolution: proj.resolution,
        frame_count: 96,
        credits_consumed: cost,
        execution_mode: "sandbox_simulation",
        status: "completed",
        created_at: now
      });
      saveRenderJobs();

      creditLedger.unshift({
        id: "LED-" + Date.now().toString().slice(-6),
        delta: -cost,
        balance_after: newBalance,
        reason: `Sandbox Pass Simulation: ${proj.name} (${jobId})`,
        reference_type: "render_job",
        created_at: now
      });
      saveCreditLedger();

      renderAllDashboardWidgets();
      if (window.VidSynthToast) {
        window.VidSynthToast.show(
          `Simulated pipeline pass complete for "${proj.name}" (-${cost} Sandbox CR). Logged in Render History.`,
          "success"
        );
      }
    }, 650);
  }

  // --------------------------------------------------------------------------
  // Initialize All Dashboard Event Listeners
  // --------------------------------------------------------------------------
  function bindDashboardEvents() {
    // Sidebar view switching
    document.querySelectorAll("[data-dash-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-dash-nav");
        switchDashboardView(view);
      });
    });

    // Mobile sidebar drawer toggle
    const mobileToggle = document.getElementById("dash-mobile-sidebar-btn");
    const sidebar = document.getElementById("dash-sidebar");
    if (mobileToggle && sidebar) {
      mobileToggle.addEventListener("click", () => {
        sidebar.classList.toggle("-translate-x-full");
      });
    }

    // Sign out buttons
    document.querySelectorAll("[data-signout-btn]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (window.VidSynthAuth) window.VidSynthAuth.signOut();
      });
    });

    // Create Project Form
    const createForm = document.getElementById("create-project-form");
    if (createForm) {
      createForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const nameInput = document.getElementById("cp-name");
        const modeInput = document.getElementById("cp-mode");
        const modelInput = document.getElementById("cp-model");
        const motionInput = document.getElementById("cp-motion");
        const resInput = document.getElementById("cp-resolution");
        const fpsInput = document.getElementById("cp-fps");
        const formatInput = document.getElementById("cp-format");
        const notesInput = document.getElementById("cp-notes");

        const name = nameInput ? nameInput.value.trim() : "";
        if (name.length < 2) {
          if (window.VidSynthToast) {
            window.VidSynthToast.show("Project name must be at least 2 characters.", "error");
          }
          if (nameInput) nameInput.classList.add("input-error");
          return;
        }
        if (nameInput) nameInput.classList.remove("input-error");

        const now = new Date().toISOString();
        const newProj = {
          id: "proj_" + Date.now().toString().slice(-6),
          name,
          transformation_mode: modeInput ? modeInput.value : "Character Transformation",
          model_id: modelInput ? modelInput.value : "VS-CHAR-2.4",
          motion_preset: motionInput ? motionInput.value : "Dolly In",
          resolution: resInput ? resInput.value : "1920x1080",
          fps: fpsInput ? Number(fpsInput.value) : 24,
          export_format: formatInput ? formatInput.value : "16-bit OpenEXR",
          project_status: "configured",
          render_status: "idle",
          notes: notesInput ? notesInput.value.trim() : "",
          created_at: now,
          updated_at: now
        };

        projects.unshift(newProj);
        saveProjects();
        createForm.reset();

        if (window.VidSynthToast) {
          window.VidSynthToast.show(`Project "${name}" created in workspace.`, "success");
        }
        switchDashboardView("projects");
      });
    }

    // Rename Project Modal Form
    const renameForm = document.getElementById("rename-project-form");
    const renameModal = document.getElementById("rename-project-modal");
    document.querySelectorAll("[data-close-rename-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (renameModal) renameModal.classList.add("hidden");
      });
    });

    if (renameForm) {
      renameForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = document.getElementById("rename-project-input");
        const newName = input ? input.value.trim() : "";
        if (newName.length < 2) {
          if (window.VidSynthToast) window.VidSynthToast.show("Please enter a valid project name (min 2 chars).", "error");
          return;
        }
        const target = projects.find((p) => p.id === activeRenameProjectId);
        if (target) {
          target.name = newName;
          target.updated_at = new Date().toISOString();
          saveProjects();
          renderAllDashboardWidgets();
          if (window.VidSynthToast) window.VidSynthToast.show(`Project renamed to "${newName}".`, "success");
        }
        if (renameModal) renameModal.classList.add("hidden");
      });
    }

    // Delete Project Confirmation Modal
    const deleteModal = document.getElementById("delete-project-modal");
    const confirmDeleteBtn = document.getElementById("confirm-delete-project-btn");
    document.querySelectorAll("[data-close-delete-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (deleteModal) deleteModal.classList.add("hidden");
      });
    });

    if (confirmDeleteBtn) {
      confirmDeleteBtn.addEventListener("click", () => {
        const idx = projects.findIndex((p) => p.id === activeDeleteProjectId);
        if (idx !== -1) {
          const removed = projects.splice(idx, 1)[0];
          saveProjects();
          renderAllDashboardWidgets();
          if (window.VidSynthToast) {
            window.VidSynthToast.show(`Deleted project "${removed.name}".`, "info");
          }
        }
        if (deleteModal) deleteModal.classList.add("hidden");
      });
    }

    // Search & Filter inputs on My Projects
    const searchInput = document.getElementById("project-search-input");
    const filterSelect = document.getElementById("project-status-filter");
    if (searchInput) searchInput.addEventListener("input", renderProjectsList);
    if (filterSelect) filterSelect.addEventListener("change", renderProjectsList);

    // Model Catalog "Use Model in New Project" buttons
    document.querySelectorAll("[data-select-model]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const modelId = btn.getAttribute("data-select-model");
        const modeName = btn.getAttribute("data-select-mode") || "Character Transformation";
        const modelSelect = document.getElementById("cp-model");
        const modeSelect = document.getElementById("cp-mode");
        if (modelSelect) modelSelect.value = modelId;
        if (modeSelect) modeSelect.value = modeName;
        switchDashboardView("create-project");
      });
    });

    // Reset Sandbox Credits Utility Button
    const resetCreditsBtn = document.getElementById("reset-sandbox-credits-btn");
    if (resetCreditsBtn) {
      resetCreditsBtn.addEventListener("click", () => {
        const current = getCurrentCredits();
        const delta = 100 - current;
        creditLedger.unshift({
          id: "LED-" + Date.now().toString().slice(-6),
          delta: delta >= 0 ? delta : 100,
          balance_after: 100,
          reason: "Manual Sandbox Evaluation Credit Reset (Demo Utility)",
          reference_type: "sandbox_reset",
          created_at: new Date().toISOString()
        });
        saveCreditLedger();
        renderAllDashboardWidgets();
        if (window.VidSynthToast) {
          window.VidSynthToast.show("Sandbox evaluation credits restored to 100 CR.", "success");
        }
      });
    }

    // Settings Form: Update Profile & Optional Supabase Connection
    const profileForm = document.getElementById("settings-profile-form");
    if (profileForm) {
      profileForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const nameInput = document.getElementById("settings-fullname");
        const orgInput = document.getElementById("settings-org");
        if (nameInput && nameInput.value.trim().length >= 2) {
          currentSession.user.full_name = nameInput.value.trim();
        }
        if (orgInput) {
          currentSession.user.organization = orgInput.value.trim();
        }
        localStorage.setItem("vidsynth_active_session_v1", JSON.stringify(currentSession));
        renderAllDashboardWidgets();
        if (window.VidSynthToast) {
          window.VidSynthToast.show("Account profile updated.", "success");
        }
      });
    }

    const supaForm = document.getElementById("settings-supabase-form");
    const clearSupaBtn = document.getElementById("clear-supabase-config-btn");
    if (supaForm) {
      supaForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const urlEl = document.getElementById("settings-supa-url");
        const keyEl = document.getElementById("settings-supa-key");
        const urlVal = urlEl ? urlEl.value.trim() : "";
        const keyVal = keyEl ? keyEl.value.trim() : "";
        if (!urlVal.startsWith("https://") || !keyVal) {
          if (window.VidSynthToast) {
            window.VidSynthToast.show("Provide a valid https:// Supabase URL and public anon key.", "error");
          }
          return;
        }
        localStorage.setItem("vidsynth_custom_supabase_url", urlVal);
        localStorage.setItem("vidsynth_custom_supabase_key", keyVal);
        if (window.VidSynthToast) {
          window.VidSynthToast.show("Supabase configuration saved. Reloading runtime...", "success");
        }
        setTimeout(() => window.location.reload(), 700);
      });
    }

    if (clearSupaBtn) {
      clearSupaBtn.addEventListener("click", () => {
        localStorage.removeItem("vidsynth_custom_supabase_url");
        localStorage.removeItem("vidsynth_custom_supabase_key");
        window.location.reload();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!window.location.pathname.endsWith("dashboard.html")) return;
    if (!window.VidSynthAuth) return;

    currentSession = window.VidSynthAuth.requireAuth();
    if (!currentSession) return;

    // Populate Settings inputs with current user & config values
    const nameInput = document.getElementById("settings-fullname");
    const orgInput = document.getElementById("settings-org");
    const emailInput = document.getElementById("settings-email");
    if (nameInput) nameInput.value = currentSession.user.full_name || "";
    if (orgInput) orgInput.value = currentSession.user.organization || "";
    if (emailInput) emailInput.value = currentSession.user.email || "";

    const supaUrlInput = document.getElementById("settings-supa-url");
    const supaKeyInput = document.getElementById("settings-supa-key");
    if (supaUrlInput) supaUrlInput.value = CONFIG.SUPABASE_URL || "";
    if (supaKeyInput) supaKeyInput.value = CONFIG.SUPABASE_ANON_KEY || "";

    loadUserData();
    bindDashboardEvents();
    renderAllDashboardWidgets();
  });
})();
