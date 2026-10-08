/* ============================================================
   Production Planner — Full JavaScript
   Real data from Django + Auto/Manual plan + Saved plans
   ============================================================ */

document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  console.log("📦 planner.js loaded");

  if (window.lucide) lucide.createIcons();

  /* =========================================
     Constants
     ========================================= */
  const PROCESS_STEPS = [
    'Order Receive', 'Verification', 'Grey Yarn Collection', 'Yarn Testing',
    'Unpacking', 'Pre-treatment', 'Dyeing Loading', 'Dyeing', 'Washing',
    'Drying', 'Finishing', 'Rewinding', 'Packing', 'Storage', 'Delivery'
  ];

  const STEP_BASE_DURATIONS = {
    'Order Receive': 2, 'Verification': 4, 'Grey Yarn Collection': 8,
    'Yarn Testing': 6, 'Unpacking': 4, 'Pre-treatment': 12,
    'Dyeing Loading': 6, 'Dyeing': 24, 'Washing': 8,
    'Drying': 16, 'Finishing': 12, 'Rewinding': 10,
    'Packing': 6, 'Storage': 4, 'Delivery': 8,
  };

  /* =========================================
     Read Django data
     ========================================= */
  function readJSON(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  const ORDERS   = readJSON("orders-data")   || [];
  const MACHINES = readJSON("machines-data") || [];

  console.log("📦 Orders:", ORDERS.length, "| Machines:", MACHINES.length);

  /* =========================================
     State
     ========================================= */
  let generatedPlans = [];
  let individualPlans = {};
  let manualPlans = [];
  let currentTab = 'auto';
  let currentMode = 'all';
  let isGenerating = false;
  let expandedOrder = null;

  /* =========================================
     Utilities
     ========================================= */
  function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString() + ' ' +
           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function addHours(date, hours) {
    return new Date(date.getTime() + hours * 3600000);
  }

  function findBestMachine(qty) {
    if (MACHINES.length === 0) return null;
    const sorted = [...MACHINES].sort((a, b) => a.capacity - b.capacity);
    const exact = sorted.find(m => m.capacity === qty);
    if (exact) return exact.id;
    const suitable = sorted.find(m => m.capacity >= qty);
    if (suitable) return suitable.id;
    return sorted[sorted.length - 1].id;
  }

  function getMachineLabel(machineId) {
    const m = MACHINES.find(x => x.id === machineId);
    return m ? m.label : null;
  }

  function calculateDuration(step, qty) {
    const base = STEP_BASE_DURATIONS[step] || 4;
    return Math.ceil(base * (1 + qty / 1000));
  }

  function getStepBadgeClass(step) {
    if (['Dyeing', 'Dyeing Loading'].includes(step)) return 'badge-purple';
    if (['Washing', 'Drying'].includes(step)) return 'badge-blue';
    if (['Finishing', 'Rewinding'].includes(step)) return 'badge-green';
    if (['Packing', 'Delivery'].includes(step)) return 'badge-orange';
    return 'badge-gray';
  }

  /* =========================================
     Tab Switching
     ========================================= */
  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const tab = btn.dataset.tab;
      currentTab = tab;

      document.getElementById("autoTab").classList.toggle("hidden", tab !== "auto");
      document.getElementById("savedTab").classList.toggle("hidden", tab !== "saved");
      document.getElementById("manualTab").classList.toggle("hidden", tab !== "manual");

      document.getElementById("tabAuto").className = "tab-btn" + (tab === "auto" ? " active-auto" : "");
      document.getElementById("tabSaved").className = "tab-btn" + (tab === "saved" ? " active-saved" : "");
      document.getElementById("tabManual").className = "tab-btn" + (tab === "manual" ? " active-manual" : "");

      if (tab === "saved") renderSavedPlans();
      if (tab === "manual") renderManualPlans();
    });
  });

  /* =========================================
     Mode Switching
     ========================================= */
  document.getElementById("modeAll")?.addEventListener("click", () => switchMode("all"));
  document.getElementById("modeIndividual")?.addEventListener("click", () => switchMode("individual"));

  function switchMode(mode) {
    currentMode = mode;
    document.getElementById("modeAll").className = "mode-btn" + (mode === "all" ? " active-all" : "");
    document.getElementById("modeIndividual").className = "mode-btn" + (mode === "individual" ? " active-individual" : "");
    document.getElementById("allModeContent").classList.toggle("hidden", mode !== "all");
    document.getElementById("individualModeContent").classList.toggle("hidden", mode !== "individual");
    if (mode === "individual") renderIndividualOrders();
  }

  /* =========================================
     Unallocated Orders — Warning List
     ========================================= */
  function renderUnallocatedList() {
    const listEl = document.getElementById("unallocatedList");
    if (!listEl) return;
    const unallocated = ORDERS.filter(o => o.status === "Pending" && !o.allocated);
    if (unallocated.length === 0) return;

    listEl.innerHTML = '<ul>' + unallocated.map(o => `
      <li>
        <span style="color:#dc2626;font-weight:700;">•</span>
        <span class="font-semibold">${o.id}</span>
        <span>— ${o.customer}</span>
        <span class="text-muted">(${o.qty} kg)</span>
        <button class="btn btn-sm btn-red" style="margin-left:auto;" onclick="allocateNow('${o.id}')">
          <i data-lucide="plus-circle"></i> Allocate Now
        </button>
      </li>
    `).join('') + '</ul>';
    if (window.lucide) lucide.createIcons();
  }

  /* =========================================
     Allocate Now
     ========================================= */
  window.allocateNow = function (orderId) {
    const order = ORDERS.find(o => o.id === orderId);
    if (!order) return;

    const machineId = findBestMachine(order.qty);
    if (!machineId) {
      alert("No machines available. Please add machines first.");
      return;
    }

    fetch("/api/planner/allocate/" + orderId + "/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": window.CSRF_TOKEN || "",
      },
      body: JSON.stringify({ machineId: machineId }),
    })
    .then(r => r.json())
    .then(json => {
      if (json.success) {
        order.allocated = true;
        order.machineId = machineId;
        alert("✅ Machine allocated to " + orderId + ": " + json.machine.label);
        window.location.reload();
      } else {
        alert("Error: " + (json.error || "Unknown"));
      }
    })
    .catch(err => alert("Network error: " + err.message));
  };

  /* =========================================
     Generate All Plans
     ========================================= */
  const generateAllBtn = document.getElementById("generateAllBtn");
  if (generateAllBtn) {
    generateAllBtn.addEventListener("click", function () {
      if (isGenerating) return;
      isGenerating = true;

      generateAllBtn.disabled = true;
      generateAllBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Generating...';
      if (window.lucide) lucide.createIcons();

      setTimeout(() => {
        const unplanned = ORDERS.filter(o => o.status === "Pending" && o.allocated);
        let currentStart = new Date();
        currentStart.setHours(8, 0, 0, 0);
        currentStart.setDate(currentStart.getDate() + 1);
        generatedPlans = [];

        unplanned.forEach(order => {
          let stepStart = new Date(currentStart);
          const machineId = order.machineId || findBestMachine(order.qty);
          PROCESS_STEPS.forEach(step => {
            const duration = calculateDuration(step, order.qty);
            const stepEnd = addHours(stepStart, duration);
            let assignedMachine = null;
            if (["Dyeing", "Dyeing Loading", "Washing"].includes(step)) {
              assignedMachine = machineId;
            }
            generatedPlans.push({
              orderId: order.id,
              step,
              startDate: stepStart.toISOString(),
              endDate: stepEnd.toISOString(),
              duration,
              machineId: assignedMachine,
              status: "pending",
            });
            stepStart = stepEnd;
          });
          currentStart = addHours(stepStart, 4);
        });

        renderGeneratedPlan();
        isGenerating = false;
        generateAllBtn.disabled = false;
        generateAllBtn.innerHTML = '<i data-lucide="wand-2"></i> Regenerate Plan for All';
        if (window.lucide) lucide.createIcons();
      }, 1200);
    });
  }

  function renderGeneratedPlan() {
    const card = document.getElementById("generatedPlanCard");
    if (generatedPlans.length === 0) {
      card.classList.add("hidden");
      return;
    }
    card.classList.remove("hidden");

    const uniqueOrders = new Set(generatedPlans.map(p => p.orderId));
    document.getElementById("generatedSummary").textContent =
      generatedPlans.length + " steps across " + uniqueOrders.size + " orders";

    const tbody = document.getElementById("generatedPlanBody");
    tbody.innerHTML = generatedPlans.map(p => `
      <tr>
        <td class="font-semibold">${p.orderId}</td>
        <td><span class="badge ${getStepBadgeClass(p.step)}">${p.step}</span></td>
        <td>${p.machineId ? '<span class="machine-tag">' + getMachineLabel(p.machineId) + '</span>' : '<span class="text-xs text-muted">Manual</span>'}</td>
        <td class="text-sm">${formatDate(p.startDate)}</td>
        <td class="text-sm">${formatDate(p.endDate)}</td>
        <td class="text-sm">${p.duration}h</td>
        <td><span class="badge badge-yellow">Pending</span></td>
      </tr>
    `).join("");

    const totalDuration = generatedPlans.reduce((s, p) => s + p.duration, 0);
    document.getElementById("generatedPlanSummary").innerHTML = `
      <div><p class="text-xs text-muted">Total Steps</p><p class="font-semibold" style="color:#1e40af;">${generatedPlans.length}</p></div>
      <div><p class="text-xs text-muted">Orders Planned</p><p class="font-semibold" style="color:#1e40af;">${uniqueOrders.size}</p></div>
      <div><p class="text-xs text-muted">Total Duration</p><p class="font-semibold" style="color:#1e40af;">${Math.ceil(totalDuration / 24)} days</p></div>
      <div><p class="text-xs text-muted">Est. Completion</p><p class="font-semibold" style="color:#1e40af;">${new Date(generatedPlans[generatedPlans.length - 1].endDate).toLocaleDateString()}</p></div>
    `;
  }

  /* =========================================
     Save Generated Plan
     ========================================= */
  const saveGeneratedBtn = document.getElementById("saveGeneratedPlan");
  if (saveGeneratedBtn) {
    saveGeneratedBtn.addEventListener("click", function () {
      if (generatedPlans.length === 0) return;
      savePlan("auto", "Auto Plan " + new Date().toLocaleDateString(), generatedPlans);
    });
  }

  async function savePlan(planType, name, steps) {
    try {
      const res = await fetch("/api/planner/generate/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": window.CSRF_TOKEN || "",
        },
        body: JSON.stringify({
          planType: planType,
          name: name,
          steps: steps,
        }),
      });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch (e) {
        alert("Server error. Check console.");
        return;
      }
      if (json.success) {
        alert("✅ Plan saved successfully!");
        window.location.reload();
      } else {
        alert("Error: " + (json.error || "Unknown"));
      }
    } catch (err) {
      alert("Network error: " + err.message);
    }
  }

  /* =========================================
     Individual Orders
     ========================================= */
  function renderIndividualOrders() {
    const container = document.getElementById("individualOrderList");
    if (!container) return;

    const pending = ORDERS.filter(o => o.status === "Pending");

    if (pending.length === 0) {
      container.innerHTML = '<div class="empty-state"><i data-lucide="inbox" class="empty-icon"></i><p class="empty-title">No pending orders</p></div>';
      if (window.lucide) lucide.createIcons();
      return;
    }

    container.innerHTML = pending.map(order => {
      const hasPlan = !!individualPlans[order.id];
      const plans = individualPlans[order.id] || [];
      const dyeingStep = plans.find(p => p.step === "Dyeing");
      const machineId = dyeingStep ? dyeingStep.machineId : order.machineId;
      const machineLabel = machineId ? getMachineLabel(machineId) : null;

      return `
        <div class="order-card ${hasPlan ? "generated" : ""}">
          <div class="order-header">
            <div style="display:flex;align-items:center;gap:1rem;flex:1;min-width:0;">
              <div style="width:0.5rem;height:3rem;border-radius:9999px;background:${order.priority === "Emergency" ? "#f97316" : "#3b82f6"};"></div>
              <div>
                <div style="display:flex;flex-wrap:wrap;gap:0.4rem;align-items:center;">
                  <span class="font-bold">${order.id}</span>
                  ${order.priority === "Emergency" ? '<span class="badge badge-orange">🚨 Emergency</span>' : ''}
                  <span class="badge badge-yellow">Pending</span>
                  ${order.allocated ? '<span class="badge badge-green">✓ Allocated</span>' : '<span class="badge badge-red">⚠️ Not Allocated</span>'}
                  ${hasPlan ? '<span class="badge badge-blue">✓ Plan Generated</span>' : ''}
                </div>
                <p class="text-sm text-muted mt-2">${order.customer}</p>
              </div>
            </div>
            <div class="order-meta">
              <div class="meta-item"><p class="meta-label">Qty</p><p class="meta-value" style="color:#1d4ed8;">${order.qty} kg</p></div>
              <div class="meta-item"><p class="meta-label">Yarn</p><p class="meta-value">${order.yarn || "—"}</p></div>
              <div class="meta-item"><p class="meta-label">Color</p><p class="meta-value">${order.color || "—"}</p></div>
              <div class="meta-item"><p class="meta-label">Date</p><p class="meta-value">${order.date}</p></div>
              ${machineLabel ? `<div class="meta-item"><p class="meta-label">Machine</p><p class="meta-value" style="color:#7c3aed;">${machineLabel}</p></div>` : ""}
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
              <button class="btn btn-sm ${order.allocated ? "btn-success" : "btn-outline"}" onclick="openBatchModal('${order.id}')">
                <i data-lucide="list-ordered"></i> ${order.allocated ? "Batches" : "Auto Allocation"}
              </button>
              <button class="btn btn-sm ${order.allocated ? (hasPlan ? "btn-primary" : "btn-success") : "btn-disabled"}"
                ${!order.allocated ? "disabled" : ""} onclick="generateIndividualPlan('${order.id}')">
                <i data-lucide="wand-2"></i> ${hasPlan ? "Regenerate" : "Generate Plan"}
              </button>
              ${hasPlan ? `
                <button class="btn btn-sm btn-outline" onclick="toggleIndividualPlan('${order.id}')">
                  <i data-lucide="chevron-${expandedOrder === order.id ? "up" : "down"}"></i>
                </button>
              ` : ""}
            </div>
          </div>
          ${hasPlan && expandedOrder === order.id ? renderIndividualPlanDetails(order.id) : ""}
        </div>
      `;
    }).join("");

    if (window.lucide) lucide.createIcons();
  }

  window.toggleIndividualPlan = function (orderId) {
    expandedOrder = expandedOrder === orderId ? null : orderId;
    renderIndividualOrders();
  };

  function renderIndividualPlanDetails(orderId) {
    const plans = individualPlans[orderId] || [];
    if (plans.length === 0) return "";

    const totalDuration = plans.reduce((s, p) => s + p.duration, 0);
    const dyeingStep = plans.find(p => p.step === "Dyeing");
    const machineLabel = dyeingStep && dyeingStep.machineId ? getMachineLabel(dyeingStep.machineId) : "—";

    return `
      <div class="plan-details">
        <div class="plan-summary">
          <div><p class="text-xs text-muted">Total Steps</p><p class="font-semibold" style="color:#1e40af;">${plans.length}</p></div>
          <div><p class="text-xs text-muted">Total Duration</p><p class="font-semibold" style="color:#1e40af;">${Math.ceil(totalDuration / 24)} days</p></div>
          <div><p class="text-xs text-muted">Dyeing Machine</p><p class="font-semibold" style="color:#7c3aed;">${machineLabel}</p></div>
          <div><p class="text-xs text-muted">Est. Completion</p><p class="font-semibold" style="color:#15803d;">${new Date(plans[plans.length - 1].endDate).toLocaleDateString()}</p></div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>#</th><th>Process Step</th><th>Machine</th><th>Start</th><th>End</th><th>Duration</th></tr></thead>
            <tbody>
              ${plans.map((p, i) => `
                <tr>
                  <td class="text-xs text-muted">${i + 1}</td>
                  <td><span class="badge ${getStepBadgeClass(p.step)}">${p.step}</span></td>
                  <td>${p.machineId ? '<span class="machine-tag">' + getMachineLabel(p.machineId) + '</span>' : '<span class="text-xs text-muted">—</span>'}</td>
                  <td class="text-xs">${formatDate(p.startDate)}</td>
                  <td class="text-xs">${formatDate(p.endDate)}</td>
                  <td class="text-xs">${p.duration}h</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <div style="margin-top:1rem;display:flex;justify-content:flex-end;">
          <button class="btn btn-success" onclick="saveIndividualPlan('${orderId}')">
            <i data-lucide="save"></i> Save This Plan
          </button>
        </div>
      </div>
    `;
  }

  window.generateIndividualPlan = function (orderId) {
    const order = ORDERS.find(o => o.id === orderId);
    if (!order || !order.allocated) {
      alert("⚠️ Complete machine allocation first.");
      return;
    }

    let stepStart = new Date();
    stepStart.setHours(8, 0, 0, 0);
    stepStart.setDate(stepStart.getDate() + 1);

    const machineId = order.machineId || findBestMachine(order.qty);
    const plans = [];

    PROCESS_STEPS.forEach(step => {
      const duration = calculateDuration(step, order.qty);
      const stepEnd = addHours(stepStart, duration);
      let assignedMachine = null;
      if (["Dyeing", "Dyeing Loading", "Washing"].includes(step)) {
        assignedMachine = machineId;
      }
      plans.push({
        orderId,
        step,
        startDate: stepStart.toISOString(),
        endDate: stepEnd.toISOString(),
        duration,
        machineId: assignedMachine,
        status: "pending",
      });
      stepStart = stepEnd;
    });

    individualPlans[orderId] = plans;
    expandedOrder = orderId;
    renderIndividualOrders();
  };

  window.saveIndividualPlan = function (orderId) {
    const plans = individualPlans[orderId];
    if (!plans) return;
    const order = ORDERS.find(o => o.id === orderId);
    savePlan("auto", "Auto Plan — " + orderId + " (" + (order?.customer || "") + ")", plans);
  };

  /* =========================================
     Manual Plan
     ========================================= */
  const addManualBtn = document.getElementById("addManualPlanBtn");
  if (addManualBtn) {
    addManualBtn.addEventListener("click", function () {
      const orderId = document.getElementById("manualOrderSelect").value;
      const startDate = document.getElementById("manualStartDate").value;
      const machineSelect = document.getElementById("manualMachineSelect").value;

      if (!orderId || !startDate) {
        alert("Please select an order and start date.");
        return;
      }

      const order = ORDERS.find(o => o.id === orderId);
      if (!order) return;

      if (!order.allocated) {
        document.getElementById("manualWarningMsg").classList.remove("hidden");
        alert("⚠️ This order needs machine allocation first.");
        return;
      }
      document.getElementById("manualWarningMsg").classList.add("hidden");

      let stepStart = new Date(startDate);
      const machineId = machineSelect || order.machineId || findBestMachine(order.qty);

      PROCESS_STEPS.forEach(step => {
        const duration = calculateDuration(step, order.qty);
        const stepEnd = addHours(stepStart, duration);
        let assignedMachine = null;
        if (["Dyeing", "Dyeing Loading", "Washing"].includes(step)) {
          assignedMachine = machineId;
        }
        manualPlans.push({
          orderId: order.id,
          step,
          startDate: stepStart.toISOString(),
          endDate: stepEnd.toISOString(),
          duration,
          machineId: assignedMachine,
          status: "pending",
        });
        stepStart = stepEnd;
      });

      renderManualPlans();
      document.getElementById("manualOrderSelect").value = "";
      document.getElementById("manualMachineSelect").value = "";
    });
  }

  function renderManualPlans() {
    const container = document.getElementById("manualPlansContainer");
    const empty = document.getElementById("manualEmptyState");
    if (!container) return;

    if (manualPlans.length === 0) {
      container.classList.add("hidden");
      empty.classList.remove("hidden");
      return;
    }
    container.classList.remove("hidden");
    empty.classList.add("hidden");

    const totalDuration = manualPlans.reduce((s, p) => s + p.duration, 0);
    document.getElementById("manualPlanSummary").innerHTML = `
      <div><p class="text-xs text-muted">Total Steps</p><p class="font-semibold" style="color:#065f46;">${manualPlans.length}</p></div>
      <div><p class="text-xs text-muted">Orders</p><p class="font-semibold" style="color:#065f46;">${new Set(manualPlans.map(p => p.orderId)).size}</p></div>
      <div><p class="text-xs text-muted">Total Duration</p><p class="font-semibold" style="color:#065f46;">${Math.ceil(totalDuration / 24)} days</p></div>
    `;

    document.getElementById("manualPlanBody").innerHTML = manualPlans.map(p => `
      <tr>
        <td class="font-semibold">${p.orderId}</td>
        <td><span class="badge ${getStepBadgeClass(p.step)}">${p.step}</span></td>
        <td>${p.machineId ? '<span class="machine-tag">' + getMachineLabel(p.machineId) + '</span>' : '<span class="text-xs text-muted">Manual</span>'}</td>
        <td class="text-sm">${formatDate(p.startDate)}</td>
        <td class="text-sm">${formatDate(p.endDate)}</td>
        <td class="text-sm">${p.duration}h</td>
      </tr>
    `).join("");
  }

  const saveManualBtn = document.getElementById("saveManualPlansBtn");
  if (saveManualBtn) {
    saveManualBtn.addEventListener("click", function () {
      if (manualPlans.length === 0) return;
      savePlan("manual", "Manual Plan " + new Date().toLocaleDateString(), manualPlans);
      manualPlans = [];
    });
  }

  const clearManualBtn = document.getElementById("clearManualPlansBtn");
  if (clearManualBtn) {
    clearManualBtn.addEventListener("click", function () {
      if (!confirm("Clear all manual plans?")) return;
      manualPlans = [];
      renderManualPlans();
    });
  }

  /* =========================================
     Saved Plans — list render
     ========================================= */
  function renderSavedPlans() {
    const container = document.getElementById("savedPlansContainer");
    if (!container) return;

    fetch("/api/planner/list/")
      .then(r => r.json())
      .then(json => {
        if (!json.success || !json.plans || json.plans.length === 0) {
          container.innerHTML =
            '<div class="empty-state">' +
              '<i data-lucide="list" class="empty-icon"></i>' +
              '<p class="empty-title">No saved plans yet</p>' +
              '<p class="empty-sub">Generate an auto plan and save it</p>' +
            '</div>';
          if (window.lucide) lucide.createIcons();
          return;
        }

        container.innerHTML = json.plans.map(plan => {
          // ✅ UNIQUE order IDs — duplicate remove
          const uniqueOrders = [...new Set(plan.orderIds || [])];

          // Order badges
          const orderBadges = uniqueOrders.map(oid =>
            `<span class="sp-order-badge">${oid}</span>`
          ).join("");

          return `
            <div class="sp-card">
              <div class="sp-header">
                <div class="sp-header-left">
                  <div class="sp-icon">
                    <i data-lucide="file-text"></i>
                  </div>
                  <div>
                    <h4 class="sp-title">${plan.name}</h4>
                    <p class="sp-meta">
                      <i data-lucide="clock"></i>
                      ${new Date(plan.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div class="sp-actions">
                  <button class="sp-btn sp-btn-view" onclick="viewSavedPlan('${plan.id}')">
                    <i data-lucide="eye"></i> View
                  </button>
                  <button class="sp-btn sp-btn-delete" onclick="deleteSavedPlan('${plan.id}')">
                    <i data-lucide="trash-2"></i>
                  </button>
                </div>
              </div>

              <div class="sp-body">
                <div class="sp-stat">
                  <span class="sp-stat-label">Orders</span>
                  <span class="sp-stat-value">${uniqueOrders.length}</span>
                </div>
                <div class="sp-stat">
                  <span class="sp-stat-label">Steps</span>
                  <span class="sp-stat-value">${plan.stepCount || '—'}</span>
                </div>
                <div class="sp-stat">
                  <span class="sp-stat-label">Type</span>
                  <span class="sp-stat-value sp-type-${plan.planType}">${plan.planType}</span>
                </div>
              </div>

              <div class="sp-orders">
                <span class="sp-orders-label">Order IDs:</span>
                <div class="sp-orders-list">${orderBadges}</div>
              </div>
            </div>
          `;
        }).join("");

        if (window.lucide) lucide.createIcons();
      })
      .catch(err => {
        console.error("Failed to load plans:", err);
        container.innerHTML = '<div class="empty-state"><p>Error loading plans</p></div>';
      });
  }

  /* =========================================
     View Saved Plan — Modal
     ========================================= */
  window.viewSavedPlan = async function (planId) {
    console.log("📂 Viewing plan:", planId);

    try {
      const res = await fetch("/api/planner/" + planId + "/");
      const json = await res.json();

      if (!json.success) {
        alert("Failed to load plan: " + (json.error || "Unknown"));
        return;
      }

      const plan = json.plan;

      let stepsHtml = "";
      if (plan.steps && plan.steps.length > 0) {
        stepsHtml = `
          <div style="overflow-x:auto; margin-top:1rem; border:1px solid #e2e8f0; border-radius:0.5rem;">
            <table style="width:100%; font-size:0.8rem; border-collapse:collapse;">
              <thead>
                <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0;">
                  <th style="text-align:left; padding:0.6rem;">#</th>
                  <th style="text-align:left; padding:0.6rem;">Order ID</th>
                  <th style="text-align:left; padding:0.6rem;">Process Step</th>
                  <th style="text-align:left; padding:0.6rem;">Machine</th>
                  <th style="text-align:left; padding:0.6rem;">Start</th>
                  <th style="text-align:left; padding:0.6rem;">End</th>
                  <th style="text-align:left; padding:0.6rem;">Duration</th>
                </tr>
              </thead>
              <tbody>
                ${plan.steps.map((s, i) => `
                  <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:0.6rem; color:#94a3b8;">${i + 1}</td>
                    <td style="padding:0.6rem; font-weight:600;">${s.orderId}</td>
                    <td style="padding:0.6rem;">${s.step}</td>
                    <td style="padding:0.6rem;">${s.machineId || "—"}</td>
                    <td style="padding:0.6rem; font-size:0.75rem;">${new Date(s.startDate).toLocaleString()}</td>
                    <td style="padding:0.6rem; font-size:0.75rem;">${new Date(s.endDate).toLocaleString()}</td>
                    <td style="padding:0.6rem;">${s.duration}h</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `;
      } else {
        stepsHtml = '<p style="color:#94a3b8; text-align:center; padding:2rem;">No steps in this plan</p>';
      }

      const modalHtml = `
        <div id="savedPlanModal" style="position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:2000; padding:1rem;">
          <div style="background:#ffffff; border-radius:0.75rem; max-width:960px; width:100%; max-height:90vh; overflow-y:auto; box-shadow:0 25px 50px rgba(0,0,0,0.35);">
            <div style="display:flex; align-items:center; justify-content:space-between; padding:1.25rem 1.5rem; border-bottom:1px solid #e2e8f0; position:sticky; top:0; background:#ffffff;">
              <div>
                <h3 style="margin:0; font-size:1.1rem; font-weight:700; color:#0f172a;">${plan.name}</h3>
                <p style="margin:0.25rem 0 0 0; font-size:0.8rem; color:#64748b;">
                  Created: ${new Date(plan.createdAt).toLocaleString()} • Type: ${plan.planType}
                </p>
              </div>
              <button onclick="document.getElementById('savedPlanModal').remove()"
                style="background:transparent; border:none; font-size:1.5rem; cursor:pointer; color:#64748b; padding:0.25rem 0.5rem; line-height:1;">×</button>
            </div>
            <div style="padding:1.5rem;">
              ${stepsHtml}
            </div>
            <div style="padding:1rem 1.5rem; border-top:1px solid #e2e8f0; text-align:right; background:#f8fafc;">
              <button onclick="document.getElementById('savedPlanModal').remove()"
                style="padding:0.5rem 1.25rem; border:1px solid #cbd5e1; background:#ffffff; border-radius:0.5rem; cursor:pointer; font-weight:500; font-family:inherit;">
                Close
              </button>
            </div>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML("beforeend", modalHtml);

      setTimeout(() => {
        const modal = document.getElementById("savedPlanModal");
        if (modal) {
          modal.addEventListener("click", function (e) {
            if (e.target === modal) modal.remove();
          });
        }
      }, 50);

    } catch (err) {
      console.error("❌ Error loading plan:", err);
      alert("Network error: " + err.message);
    }
  };

  /* =========================================
     Delete Saved Plan
     ========================================= */
  window.deleteSavedPlan = function (planId) {
    if (!confirm("Delete this saved plan?")) return;

    fetch("/api/planner/" + planId + "/delete/", {
      method: "POST",
      headers: {
        "X-CSRFToken": window.CSRF_TOKEN || "",
      },
    })
    .then(r => r.json())
    .then(json => {
      if (json.success) {
        alert("✅ Plan deleted.");
        renderSavedPlans();
      } else {
        alert("Error: " + (json.error || "Unknown"));
      }
    })
    .catch(err => alert("Network error: " + err.message));
  };

  /* =========================================
     Init
     ========================================= */
  renderUnallocatedList();
  renderManualPlans();
  if (currentMode === "individual") renderIndividualOrders();

  console.log("✅ planner.js initialized");
});