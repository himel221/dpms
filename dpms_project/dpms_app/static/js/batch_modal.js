/* ============================================================
   Batch Allocation Modal — Fully Dynamic
   All data (score, reasoning, combos) comes from server
   ============================================================ */

(function () {
  "use strict";

  let currentOrder = null;
  let currentMachines = [];
  let currentMode = 'auto';
  let selectedComboId = null;
  let manualBatches = [];
  let combinations = [];
  let expandedAnalysis = null;

  /* ==========================================
     Modal helpers
     ========================================== */
  function showModal() {
    const modalEl = document.getElementById("batchModalOverlay");
    if (!modalEl) {
      console.error("❌ batchModalOverlay not found!");
      return;
    }
    modalEl.hidden = false;
    modalEl.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  function hideModal() {
    const modalEl = document.getElementById("batchModalOverlay");
    if (!modalEl) return;
    modalEl.hidden = true;
    modalEl.style.display = "none";
    document.body.style.overflow = "";
  }

  /* ==========================================
     Modal open — Fetch data from server
     ========================================== */
  window.openBatchModal = function (orderId) {
    console.log("📂 Opening batch modal for:", orderId);

    fetch("/api/batch-allocation/" + orderId + "/", {
      method: "GET",
      headers: { "Accept": "application/json" },
    })
    .then(r => r.json())
    .then(json => {
      if (!json.success) {
        alert("Failed to load order data: " + (json.error || "Unknown"));
        return;
      }

      currentOrder = json.order;
      currentMachines = json.machines;
      combinations = json.combinations || [];   // ✅ Server theke ashe

      manualBatches = (json.existingAllocations || []).map(a => ({
        batchId: a.batchId,
        machineId: a.machineId,
        allocatedQty: a.allocatedQty,
        batchTimeHours: a.batchTimeHours,
        status: a.status || 'planned',
      }));

      console.log("✅ Order loaded:", currentOrder.id);
      console.log("✅ Machines loaded:", currentMachines.length);
      console.log("✅ Combinations loaded:", combinations.length);

      // Header
      document.getElementById("bmHeaderOrderId").textContent = currentOrder.id;
      document.getElementById("bmHeaderCustomer").textContent = currentOrder.customerName;
      document.getElementById("bmHeaderQty").textContent = (currentOrder.dyeingQty || currentOrder.orderQty) + " kg";
      document.getElementById("bmHeaderYarn").textContent =
        (currentOrder.yarnType || "—") + " (" + (currentOrder.yarnCode || "—") + ")";

      // Best match select
      const best = combinations.find(c => c.isBestMatch);
      selectedComboId = best ? best.id : (combinations[0]?.id || null);

      // Show modal
      showModal();

      if (window.lucide) lucide.createIcons();

      // Render
      renderAutoMode();
      renderManualMode();
      updateFooter();
    })
    .catch(err => {
      console.error("❌ Error loading modal:", err);
      alert("Network error: " + err.message);
    });
  };

  /* ==========================================
     Close modal
     ========================================== */
  function closeModal() {
    hideModal();
    currentOrder = null;
    manualBatches = [];
    combinations = [];
  }

  document.getElementById("bmCloseBtn")?.addEventListener("click", closeModal);
  document.getElementById("bmCancelBtn")?.addEventListener("click", closeModal);

  document.getElementById("batchModalOverlay")?.addEventListener("click", function (e) {
    if (e.target === this) closeModal();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      const modalEl = document.getElementById("batchModalOverlay");
      if (modalEl && !modalEl.hidden) closeModal();
    }
  });

  /* ==========================================
     Mode toggle
     ========================================== */
  document.getElementById("bmModeAutoBtn")?.addEventListener("click", () => switchMode("auto"));
  document.getElementById("bmModeManualBtn")?.addEventListener("click", () => switchMode("manual"));

  function switchMode(mode) {
    currentMode = mode;
    document.getElementById("bmModeAutoBtn").classList.toggle("active", mode === "auto");
    document.getElementById("bmModeManualBtn").classList.toggle("active", mode === "manual");
    document.getElementById("bmAutoModeContent").classList.toggle("hidden", mode !== "auto");
    document.getElementById("bmManualModeContent").classList.toggle("hidden", mode !== "manual");
    updateFooter();
  }

  /* ==========================================
     Auto Mode Render (DATA-DRIVEN)
     ========================================== */
  function renderAutoMode() {
    const best = combinations.find(c => c.isBestMatch);
    const selected = combinations.find(c => c.id === selectedComboId) || best;

    // ============ Best Match Banner ============
    if (best) {
      document.getElementById("bmBestMatchTitle").textContent =
        `✨ Recommended: ${best.id} — ${best.recommendation.summary}`;
      document.getElementById("bmBestMatchReasoning").textContent =
        best.recommendation.reasoning;
      document.getElementById("bmBestMatchPros").innerHTML =
        best.recommendation.pros.map(p => `<li>• ${p}</li>`).join("");
      document.getElementById("bmBestMatchCons").innerHTML =
        best.recommendation.cons.map(c => `<li>• ${c}</li>`).join("");
    } else {
      document.getElementById("bmBestMatchTitle").textContent = "No combinations available";
      document.getElementById("bmBestMatchReasoning").textContent = "Add more machines to generate combinations";
      document.getElementById("bmBestMatchPros").innerHTML = "";
      document.getElementById("bmBestMatchCons").innerHTML = "";
    }

    // ============ Schedule Table ============
    if (selected) {
      document.getElementById("bmScheduleComboId").textContent = selected.id;
      const tbody = document.getElementById("bmScheduleBody");

      tbody.innerHTML = selected.batches.map(b => {
        const start = b.startTime
          ? new Date(b.startTime).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
          : '—';
        const end = b.endTime
          ? new Date(b.endTime).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
          : '—';

        return `<tr>
          <td class="font-semibold" style="color:#1d4ed8;">${b.batchId}</td>
          <td>${b.machineName}</td>
          <td class="font-semibold" style="color:#15803d;">${b.allocatedQty.toFixed(1)}</td>
          <td style="color:#b45309;">${b.batchTimeHours}h</td>
          <td style="color:#7c3aed;">${start}</td>
          <td style="color:#7c3aed;">${end}</td>
          <td><span style="color:#16a34a;font-size:0.7rem;">✓ Available</span></td>
        </tr>`;
      }).join("");
    }

    // ============ Combination Cards ============
    const list = document.getElementById("bmCombinationsList");

    if (combinations.length === 0) {
      list.innerHTML = `
        <div class="panel" style="text-align:center;padding:2rem;">
          <p style="color:#64748b;font-size:0.9rem;">
            ⚠️ No combinations available. Add more machines or check yarn capacity.
          </p>
        </div>
      `;
      return;
    }

    list.innerHTML = combinations.map(combo => {
      const isSelected = combo.id === selectedComboId;
      const isBest = combo.isBestMatch;

      return `
        <div class="combo-card ${isSelected ? 'selected' : ''} ${isBest ? 'best' : ''}" data-combo-id="${combo.id}">
          <div class="combo-header">
            <div class="combo-title">
              <h3>${combo.id}</h3>
              ${isBest ? '<span class="badge-best">BEST MATCH</span>' : ''}
              <div class="combo-stats">
                <span class="stat stat-blue">Score: ${combo.score.toFixed(1)}</span>
                <span class="stat stat-purple">${combo.totalBatches} Batch${combo.totalBatches > 1 ? 'es' : ''}</span>
                <span class="stat stat-cyan">${combo.machinesUsed} Machine${combo.machinesUsed > 1 ? 's' : ''}</span>
                <span class="stat stat-amber">${combo.totalTime}h Total</span>
              </div>
            </div>
          </div>

          <div class="criteria-grid">
            <div class="criteria-item">
              <div class="label">Batch Optimization</div>
              <div class="bar"><div style="width:${combo.criteria.batch_optimization}%;background:#3b82f6;"></div></div>
              <div class="value">${combo.criteria.batch_optimization.toFixed(0)}%</div>
            </div>
            <div class="criteria-item">
              <div class="label">Machine Feasibility</div>
              <div class="bar"><div style="width:${combo.criteria.machine_feasibility}%;background:#22c55e;"></div></div>
              <div class="value">${combo.criteria.machine_feasibility.toFixed(0)}%</div>
            </div>
            <div class="criteria-item">
              <div class="label">Machine Availability</div>
              <div class="bar"><div style="width:${combo.criteria.machine_availability}%;background:#8b5cf6;"></div></div>
              <div class="value">${combo.criteria.machine_availability.toFixed(0)}%</div>
            </div>
            <div class="criteria-item">
              <div class="label">Time Efficiency</div>
              <div class="bar"><div style="width:${combo.criteria.time_efficiency}%;background:#f59e0b;"></div></div>
              <div class="value">${combo.criteria.time_efficiency.toFixed(0)}%</div>
            </div>
          </div>

          <div class="combo-summary">
            <div class="title">${combo.recommendation.summary}</div>
            <div class="pros-cons">
              <div class="pros"><span class="font-semibold">Pros:</span>
                <ul>${combo.recommendation.pros.slice(0, 2).map(p => `<li>✓ ${p}</li>`).join("")}</ul>
              </div>
              <div class="cons"><span class="font-semibold">Cons:</span>
                <ul>${combo.recommendation.cons.slice(0, 2).map(c => `<li>! ${c}</li>`).join("")}</ul>
              </div>
            </div>
          </div>

          <div class="batch-pills">
            ${combo.batches.map(b => `
              <div class="batch-pill">
                <div class="id">${b.batchId}</div>
                <div class="machine">${b.machineName}</div>
                <div class="qty-time">
                  <span class="qty">${b.allocatedQty.toFixed(1)} kg</span>
                  <span class="time">${b.batchTimeHours}h</span>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }).join("");

    // Attach click handlers
    list.querySelectorAll(".combo-card").forEach(card => {
      card.addEventListener("click", () => {
        selectedComboId = card.dataset.comboId;
        renderAutoMode();
      });
    });
  }

  /* ==========================================
     Manual Mode Render (same as before)
     ========================================== */
  function renderManualMode() {
    renderBookingGrid();
    renderManualBatches();
    updateQtySummary();
  }

  function renderBookingGrid() {
    const grid = document.getElementById("bmBookingGrid");
    if (!grid) return;

    grid.innerHTML = currentMachines.map(m => {
      const min = currentOrder.yarnType === "Knit" ? m.knitYarnMin : m.sweaterYarnMin;
      const max = currentOrder.yarnType === "Knit" ? m.knitYarnMax : m.sweaterYarnMax;
      const bookings = m.bookings || [];
      const isBusy = bookings.some(b => b.status === "running");
      const stateClass = isBusy ? "busy" : (bookings.length > 0 ? "booked" : "free");
      const statusText = isBusy ? "Busy" : (bookings.length === 0 ? "Free" : "Booked");
      const bookedQty = bookings.reduce((s, b) => s + b.qty, 0);
      const bookedHours = bookings.reduce((s, b) => s + b.hours, 0);

      return `
        <div class="machine-booking-card ${stateClass}">
          <div class="top">
            <span class="name">${m.company} ${m.machineCapacityDisplay}</span>
            <span class="status-pill ${stateClass}">${statusText}</span>
          </div>
          <div class="detail">
            <div>Capacity: <strong>${min}–${max} kg</strong></div>
            ${bookings.length > 0
              ? `<div style="color:#b45309;">${bookings.length} booking(s) · ${bookedQty}kg · ${bookedHours}h</div>`
              : '<div style="color:#16a34a;">✓ No active bookings</div>'
            }
          </div>
        </div>
      `;
    }).join("");
  }

  function renderManualBatches() {
    const list = document.getElementById("bmManualBatchesList");
    const emptyCard = document.getElementById("bmNoManualBatchesCard");
    if (!list || !emptyCard) return;

    if (manualBatches.length === 0) {
      list.innerHTML = "";
      emptyCard.classList.remove("hidden");
      return;
    }
    emptyCard.classList.add("hidden");

    list.innerHTML = manualBatches.map((batch, idx) => {
      const options = currentMachines.map(m => {
        const min = currentOrder.yarnType === "Knit" ? m.knitYarnMin : m.sweaterYarnMin;
        const max = currentOrder.yarnType === "Knit" ? m.knitYarnMax : m.sweaterYarnMax;
        return `<option value="${m.id}" ${m.id === batch.machineId ? "selected" : ""}>${m.company} ${m.machineCapacityDisplay} — ${min}–${max} kg</option>`;
      }).join("");

      return `
        <div class="manual-batch-card">
          <div class="manual-batch-grid">
            <div>
              <label>Machine</label>
              <select data-idx="${idx}" data-field="machineId">${options}</select>
            </div>
            <div>
              <label>Quantity (kg)</label>
              <input type="number" value="${batch.allocatedQty}" min="0" data-idx="${idx}" data-field="allocatedQty">
            </div>
            <div>
              <label>Batch Time (h)</label>
              <input type="number" value="${batch.batchTimeHours}" min="1" data-idx="${idx}" data-field="batchTimeHours">
            </div>
            <div>
              <button class="btn-remove" data-remove="${idx}">Remove</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    list.querySelectorAll("select[data-idx], input[data-idx]").forEach(el => {
      el.addEventListener("change", (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        const field = e.target.dataset.field;
        const value = field === "machineId" ? e.target.value : parseFloat(e.target.value) || 0;
        manualBatches[idx][field] = value;
        updateQtySummary();
        updateFooter();
      });
    });

    list.querySelectorAll("[data-remove]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(e.target.dataset.remove, 10);
        manualBatches.splice(idx, 1);
        renderManualBatches();
        updateQtySummary();
        updateFooter();
      });
    });
  }

  document.getElementById("bmAddBatchBtn")?.addEventListener("click", () => {
    if (currentMachines.length === 0) return;
    manualBatches.push({
      batchId: "B-" + (manualBatches.length + 1),
      machineId: currentMachines[0].id,
      allocatedQty: 0,
      batchTimeHours: 8,
      status: "planned",
    });
    renderManualBatches();
    updateQtySummary();
    updateFooter();
  });

  /* ==========================================
     Qty summary
     ========================================== */
  function updateQtySummary() {
    if (!currentOrder) return;

    const total = manualBatches.reduce((s, b) => s + (b.allocatedQty || 0), 0);
    const orderQty = currentOrder.dyeingQty || currentOrder.orderQty;
    const remaining = orderQty - total;

    document.getElementById("bmManualTotalQty").textContent = total.toFixed(1) + " kg";
    const remEl = document.getElementById("bmManualRemainingQty");
    remEl.textContent = remaining.toFixed(1) + " kg";
    remEl.className = "bm-qty-value " + (Math.abs(remaining) < 0.1 ? "green" : "amber");

    const summary = document.getElementById("bmQtySummary");
    summary.classList.toggle("complete", Math.abs(remaining) < 0.1);

    const warn = document.getElementById("bmManualWarning");
    const warnText = document.getElementById("bmManualWarningText");
    if (manualBatches.length > 0 && Math.abs(remaining) > 0.1) {
      warn.classList.remove("hidden");
      warnText.textContent = remaining > 0
        ? `${remaining.toFixed(1)} kg not yet allocated.`
        : `Over-allocated by ${Math.abs(remaining).toFixed(1)} kg.`;
    } else {
      warn.classList.add("hidden");
    }
  }

  /* ==========================================
     Footer
     ========================================== */
  function updateFooter() {
    const saveBtn = document.getElementById("bmSaveBtn");
    if (!saveBtn) return;
    if (currentMode === "auto") {
      saveBtn.disabled = !selectedComboId;
    } else {
      const total = manualBatches.reduce((s, b) => s + (b.allocatedQty || 0), 0);
      const orderQty = currentOrder.dyeingQty || currentOrder.orderQty;
      saveBtn.disabled = manualBatches.length === 0 || (orderQty - total) < -0.1;
    }
  }

  /* ==========================================
     Save
     ========================================== */
  document.getElementById("bmSaveBtn")?.addEventListener("click", async () => {
    if (!currentOrder) return;

    let allocations = [];

    if (currentMode === "auto") {
      const combo = combinations.find(c => c.id === selectedComboId);
      if (!combo) return;
      allocations = combo.batches.map(b => ({
        batchId: b.batchId,
        machineId: b.machineId,
        allocatedQty: b.allocatedQty,
        batchTimeHours: b.batchTimeHours,
        status: "planned",
      }));
    } else {
      allocations = manualBatches.map(b => ({
        batchId: b.batchId,
        machineId: b.machineId,
        allocatedQty: b.allocatedQty,
        batchTimeHours: b.batchTimeHours,
        status: b.status || "planned",
      }));
    }

    try {
      const res = await fetch("/api/batch-allocation/" + currentOrder.id + "/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": window.CSRF_TOKEN || "",
        },
        body: JSON.stringify({ allocations }),
      });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch (e) {
        alert("Server error");
        return;
      }
      if (json.success) {
        alert("✅ Allocation saved successfully!");
        closeModal();
        window.location.reload();
      } else {
        alert("Error: " + (json.error || "Unknown"));
      }
    } catch (err) {
      alert("Network error: " + err.message);
    }
  });

  console.log("📦 batch_modal.js loaded");
})();