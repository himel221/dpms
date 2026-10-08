/* ============================================================
   Batch Process Tracker — Django Integration
   ============================================================ */

(function () {
  "use strict";

  console.log("📦 tracker.js loaded");

  if (window.lucide) lucide.createIcons();

  /* =========================================
     Constants
     ========================================= */
  const BATCH_PROCESS_STEPS = [
    'Store', 'Soft winding', 'Dyeing', 'Hydro', 'Dryer', 'Quality check',
    'Finishing', 'Packing', 'Store (Final)', 'Delivery', 'Completed'
  ];

  const BATCH_STEPS_FOR_COMPLETE = [
    'Store', 'Soft winding', 'Dyeing', 'Hydro', 'Dryer', 'Quality check',
    'Finishing', 'Packing', 'Store (Final)', 'Delivery'
  ];

  /* =========================================
     Read Django data
     ========================================= */
  function readJSON(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[char];
    });
  }

  const BATCH          = readJSON("batch-data");
  const ALL_BATCHES    = readJSON("all-batches-data") || [];
  const ALL_STEPS      = readJSON("all-steps-data") || [];
  const STEP_COMMENTS  = readJSON("step-comments-data") || {};

  console.log("📦 Batch:", BATCH ? BATCH.id : "none", "| All batches:", ALL_BATCHES.length);

  /* =========================================
     State
     ========================================= */
  let expandedBatches = new Set();
  if (BATCH) expandedBatches.add(BATCH.id);

  let stepComments = { ...STEP_COMMENTS };
  let rejectionModalState = null;
  let deliveryModalState = null;
  let reallocationMode = 'auto';

  /* =========================================
     Stepper Render
     ========================================= */
  function renderStepper() {
    if (!BATCH) return;
    const bar = document.getElementById('stepperBar');
    if (!bar) return;

    const completedSteps = BATCH.completed_steps || [];
    const currentStep = BATCH.current_step;

    bar.innerHTML = ALL_STEPS.map((step, index) => {
      let state = 'pending';
      if (completedSteps.includes(step)) state = 'completed';
      else if (currentStep === step) state = 'active';

      const circle = state === 'completed'
        ? '<i data-lucide="check" style="width:0.65rem;height:0.65rem;"></i>'
        : (index + 1);

      const isLast = index === ALL_STEPS.length - 1;
      return `
        <div class="stepper-item">
          <div class="stepper-circle ${state}">${circle}</div>
          <span class="stepper-label">${step}</span>
        </div>
        ${!isLast ? `<div class="stepper-line ${state === 'completed' ? 'completed' : ''}"></div>` : ''}
      `;
    }).join('');
    if (window.lucide) lucide.createIcons();
  }

  /* =========================================
     Step Grid Render
     ========================================= */
  function renderStepGrid() {
    if (!BATCH) return;
    const grid = document.getElementById('stepsGrid');
    if (!grid) return;

    const completedSteps = BATCH.completed_steps || [];
    const currentStep = BATCH.current_step;

    grid.innerHTML = ALL_STEPS.map((step, index) => {
      let status = 'pending';
      if (completedSteps.includes(step)) status = 'completed';
      else if (currentStep === step) status = 'current';

      let icon = 'circle';
      if (status === 'completed') icon = 'check-circle';
      else if (status === 'current') icon = 'clock';

      return `
        <div class="step-card ${status}">
          <i data-lucide="${icon}" class="step-icon"></i>
          <div class="step-info">
            <div class="step-num">Step ${index + 1}</div>
            <div class="step-name">${step}</div>
            ${status === 'current' ? '<div class="step-status">In Progress</div>' : ''}
            ${status === 'completed' ? '<div class="step-status">✓ Done</div>' : ''}
            ${status === 'pending' ? '<div class="step-status" style="color:#94a3b8;">Pending</div>' : ''}
          </div>
        </div>
      `;
    }).join('');
    if (window.lucide) lucide.createIcons();
  }

  /* =========================================
     Progress Summary Render
     ========================================= */
  function renderProgress() {
    if (!BATCH) return;
    const el = document.getElementById('progressSummary');
    if (!el) return;

    const total = ALL_STEPS.length;
    const completedSteps = BATCH.completed_steps || [];
    const completedCount = completedSteps.length;
    const currentStep = BATCH.current_step;
    const currentIdx = currentStep ? ALL_STEPS.indexOf(currentStep) : total;
    const remaining = total - (currentStep ? currentIdx : total);
    const percent = currentStep
      ? Math.round(((currentIdx + 1) / total) * 100)
      : (completedCount === total ? 100 : 0);

    el.innerHTML = `
      <div class="progress-grid">
        <div class="progress-item">
          <div class="label">Completed Steps</div>
          <div class="value" style="color:#16a34a;">${completedCount}</div>
        </div>
        <div class="progress-item">
          <div class="label">Current Step</div>
          <div class="value" style="color:#2563eb;">${currentStep ? currentIdx + 1 : '-'}</div>
        </div>
        <div class="progress-item">
          <div class="label">Remaining Steps</div>
          <div class="value" style="color:#ea580c;">${remaining}</div>
        </div>
        <div class="progress-item">
          <div class="label">Progress</div>
          <div class="value" style="color:#7c3aed;">${percent}%</div>
        </div>
      </div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width:${percent}%;"></div>
      </div>
    `;
  }

  /* =========================================
     Step Comments Render
     ========================================= */
  function renderStepComments() {
    if (!BATCH) return;
    const list = document.getElementById('stepCommentsList');
    if (!list) return;

    list.innerHTML = ALL_STEPS.map((step, index) => `
      <div class="comment-row">
        <div class="step-label">Step ${index + 1}: ${step}</div>
        <textarea
          placeholder="Add comment for ${step}..."
          data-step="${step}"
          rows="1"
        >${stepComments[step] || ''}</textarea>
      </div>
    `).join('');

    // Attach change handlers
    list.querySelectorAll('textarea[data-step]').forEach(el => {
      el.addEventListener('change', function () {
        const step = el.dataset.step;
        const comment = el.value;
        stepComments[step] = comment;
        saveStepComment(step, comment);
      });
    });
  }

  async function saveStepComment(step, comment) {
    if (!BATCH) return;
    try {
      await fetch("/api/tracker/step-comment/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": window.CSRF_TOKEN || "",
        },
        body: JSON.stringify({
          order_id: BATCH.order_id,
          step_name: step,
          comment: comment,
        }),
      });
    } catch (err) {
      console.error("Failed to save step comment:", err);
    }
  }

  /* =========================================
     Batch List Render
     ========================================= */
  function renderBatches() {
    const list = document.getElementById('batchList');
    if (!list) return;

    list.innerHTML = ALL_BATCHES.map(batch => {
      const isExpanded = expandedBatches.has(batch.id);
      const statusClass = getStatusClass(batch.current_step);

      return `
        <div class="batch-card">
          <div class="batch-card-header" onclick="toggleBatch('${batch.id}')">
            <div class="batch-title">
              <i data-lucide="chevron-${isExpanded ? 'down' : 'right'}" class="chevron"></i>
              <span class="batch-id">${batch.id}</span>
              <span class="batch-name">${batch.name}</span>
              <span class="batch-machine-tag">
                <span class="dot"></span>${batch.machine_name}
              </span>
            </div>
            <div class="batch-meta">
              <span class="batch-qty">${batch.quantity} kg</span>
              <span class="status-pill ${statusClass}">${batch.current_step}</span>
            </div>
          </div>
          ${isExpanded ? renderBatchBody(batch) : ''}
        </div>
      `;
    }).join('');
    if (window.lucide) lucide.createIcons();

    list.querySelectorAll('[data-batch-step-comment]').forEach(el => {
      el.addEventListener('change', function () {
        saveBatchStepComment(
          el.dataset.allocationId,
          el.dataset.stepName,
          el.value
        );
      });
    });
  }

  function getStatusClass(step) {
    if (step === 'Completed') return 'completed';
    if (step === 'Quality check') return 'quality';
    if (step === 'Dyeing') return 'dyeing';
    if (step === 'Delivery') return 'delivery';
    if (step === 'Store' || step === 'Store (Final)') return 'store';
    return 'default';
  }

  function renderBatchBody(batch) {
    const completedCount = (batch.completed_steps || []).length;

    let html = `
      <div class="batch-body-section blue">
        <h5>Machine Allocation</h5>
        <div class="info-grid">
          <div class="item"><div class="label">Machine</div><div class="value">${batch.machine_name}</div></div>
          <div class="item"><div class="label">Quantity</div><div class="value">${batch.quantity} kg</div></div>
          <div class="item"><div class="label">Order</div><div class="value">${batch.order_id}</div></div>
        </div>
      </div>
    `;

    // Manufacturing steps
    html += `<div class="batch-body-section purple"><h5>Manufacturing Process</h5><div class="process-steps-grid">`;
    BATCH_PROCESS_STEPS.filter(s => s !== 'Completed').forEach(step => {
      const isCompleted = (batch.completed_steps || []).includes(step);
      const isCurrent = batch.current_step === step;
      const ts = batch.step_timestamps && batch.step_timestamps[step];
      const stepRejections = (batch.rejections || []).filter(rejection => rejection.step === step);

      let cls = 'pending';
      let icon = 'circle';
      if (isCompleted) { cls = 'completed'; icon = 'check-circle'; }
      else if (isCurrent) { cls = 'current'; icon = 'clock'; }

      html += `
        <div class="process-step-mini ${cls}">
          <div class="row">
            <i data-lucide="${icon}" style="width:0.75rem;height:0.75rem;"></i>
            <span class="name">${step}</span>
          </div>
          ${isCompleted && ts ? `
            <div class="date">${new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</div>
            <div class="date">${new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
          ` : ''}
          ${isCurrent ? '<div class="status">● In Progress</div>' : ''}
          ${!isCompleted && !isCurrent ? '<div class="status">Pending</div>' : ''}
          ${stepRejections.map(rejection => `
            <div class="process-step-rejection">
              <strong>Rejected ${new Date(rejection.timestamp).toLocaleString()}</strong>
              <span>${escapeHtml(rejection.reason)}</span>
            </div>
          `).join('')}
          <textarea
            class="process-step-comment"
            data-batch-step-comment
            data-batch-id="${escapeHtml(batch.id)}"
            data-allocation-id="${escapeHtml(batch.allocation_id)}"
            data-step-name="${escapeHtml(step)}"
            rows="2"
            aria-label="Comment for ${escapeHtml(step)} in ${escapeHtml(batch.id)}"
            placeholder="Comment for this step..."
          >${escapeHtml((batch.step_comments || {})[step] || '')}</textarea>
        </div>
      `;
    });
    html += `</div></div>`;

    // Quality check
    if (batch.current_step === 'Quality check') {
      html += `
        <div class="batch-body-section yellow">
          <h5>Quality Check Decision</h5>
          <div class="action-row">
            <button class="action-btn green" onclick="advanceBatch('${batch.id}')">
              <i data-lucide="check-circle"></i> Complete - Pass Quality
            </button>
            <button class="action-btn red" onclick="openRejectionModal('${batch.id}')">
              <i data-lucide="x-circle"></i> Reject - Return to Dyeing
            </button>
          </div>
        </div>
      `;
    }

    // Delivery
    if (batch.current_step === 'Delivery') {
      html += `
        <div class="batch-body-section green">
          <h5><i data-lucide="check-circle" style="color:#16a34a;"></i> Delivery Step</h5>
          <div class="action-row">
            <button class="action-btn green" onclick="advanceBatch('${batch.id}')">
              <i data-lucide="check-circle"></i> Complete Delivery — Mark Batch as Done
            </button>
          </div>
          <div class="action-row" style="margin-top:0.5rem;">
            <button class="action-btn orange" onclick="openDeliveryModal('${batch.id}')">
              <i data-lucide="alert-triangle"></i> Report Delivery Issue
            </button>
          </div>
        </div>
      `;
    }

    // Regular advancement
    if (batch.current_step !== 'Quality check' &&
        batch.current_step !== 'Delivery' &&
        batch.current_step !== 'Completed') {
      html += `
        <div class="action-row" style="margin-bottom:1rem;">
          <button class="action-btn blue" onclick="advanceBatch('${batch.id}')">
            <i data-lucide="arrow-right"></i> Complete ${batch.current_step} — Move to Next Step
          </button>
        </div>
      `;
    }

    // Rejections
    if (batch.rejections && batch.rejections.length > 0) {
      html += `<div class="batch-body-section red"><h5>Rejection History</h5>`;
      batch.rejections.forEach((r, idx) => {
        html += `
          <div class="rejection-item">
            <div><strong>#${batch.rejections.length - idx}</strong> — Step: ${escapeHtml(r.step)}</div>
            <div class="reason">Reason: ${escapeHtml(r.reason)}</div>
            <div class="time">${escapeHtml(new Date(r.timestamp).toLocaleString())}</div>
          </div>
        `;
      });
      html += `</div>`;
    }

    // Batch comments
    html += `
      <div>
        <label style="font-size:0.8rem;color:#475569;display:flex;align-items:center;gap:0.4rem;margin-bottom:0.4rem;">
          <i data-lucide="message-square"></i> Batch Comments
        </label>
        <textarea
          style="width:100%;padding:0.5rem 0.75rem;border:1px solid #cbd5e1;border-radius:0.4rem;font-size:0.82rem;resize:vertical;font-family:inherit;"
          rows="2"
          placeholder="Add comments about this batch..."
          onchange="updateBatchComment('${batch.id}', this.value)"
        >${escapeHtml(batch.comment || '')}</textarea>
      </div>
    `;

    return `<div class="batch-body">${html}</div>`;
  }

  async function saveBatchStepComment(allocationId, stepName, comment) {
    const batch = ALL_BATCHES.find(item => String(item.allocation_id) === String(allocationId));
    if (!batch) return;

    try {
      const response = await fetch(
        "/api/tracker/allocation/" + encodeURIComponent(allocationId) + "/step-comment/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": window.CSRF_TOKEN || "",
          },
          body: JSON.stringify({ step_name: stepName, comment: comment }),
        }
      );
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Could not save step comment");
      }

      if (!batch.step_comments) batch.step_comments = {};
      batch.step_comments[stepName] = comment;
    } catch (err) {
      alert("Could not save step comment: " + err.message);
    }
  }

  /* =========================================
     Toggle Batch
     ========================================= */
  window.toggleBatch = function (id) {
    if (expandedBatches.has(id)) expandedBatches.delete(id);
    else expandedBatches.add(id);
    renderBatches();
  };

  /* =========================================
     Update Batch Comment
     ========================================= */
  window.updateBatchComment = function (id, value) {
    const b = ALL_BATCHES.find(x => x.id === id);
    if (b) b.comment = value;

    fetch("/api/tracker/" + id + "/comment/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": window.CSRF_TOKEN || "",
      },
      body: JSON.stringify({ comment: value }),
    }).catch(err => console.error("Failed to save comment:", err));
  };

  /* =========================================
     Advance Batch
     ========================================= */
  window.advanceBatch = async function (id) {
    try {
      const res = await fetch("/api/tracker/" + id + "/advance/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": window.CSRF_TOKEN || "",
        },
      });
      const json = await res.json();
      if (json.success) {
        const b = ALL_BATCHES.find(x => x.id === id);
        if (b) {
          b.current_step = json.current_step;
          b.completed_steps = json.completed_steps;
          b.step_timestamps = json.step_timestamps;
        }
        renderBatches();
      } else {
        alert("Error: " + (json.error || "Unknown"));
      }
    } catch (err) {
      alert("Network error: " + err.message);
    }
  };

  /* =========================================
     Rejection Modal
     ========================================= */
  window.openRejectionModal = function (batchId) {
    const b = ALL_BATCHES.find(x => x.id === batchId);
    if (!b) return;

    rejectionModalState = batchId;
    reallocationMode = 'auto';

    document.getElementById('rejectionBatchName').textContent = b.name;
    document.getElementById('rejectionReasonInput').value = '';
    updateReallocUI();
    document.getElementById('rejectionModal').classList.remove('hidden');
  };

  window.closeRejectionModal = function () {
    document.getElementById('rejectionModal').classList.add('hidden');
    rejectionModalState = null;
  };

  window.selectReallocMode = function (mode) {
    reallocationMode = mode;
    updateReallocUI();
  };

  function updateReallocUI() {
    const autoEl = document.getElementById('reallocAutoOption');
    const manualEl = document.getElementById('reallocManualOption');
    if (autoEl) autoEl.classList.toggle('selected', reallocationMode === 'auto');
    if (manualEl) manualEl.classList.toggle('selected', reallocationMode === 'manual');

    const autoInput = document.querySelector('input[name="realloc"][value="auto"]');
    const manualInput = document.querySelector('input[name="realloc"][value="manual"]');
    if (autoInput) autoInput.checked = reallocationMode === 'auto';
    if (manualInput) manualInput.checked = reallocationMode === 'manual';
  }

  window.confirmRejection = async function () {
    const reason = document.getElementById('rejectionReasonInput').value.trim();
    if (!reason) {
      alert('Please enter a rejection reason');
      return;
    }

    try {
      const res = await fetch("/api/tracker/" + rejectionModalState + "/reject/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": window.CSRF_TOKEN || "",
        },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (json.success) {
        const b = ALL_BATCHES.find(x => x.id === rejectionModalState);
        if (b) {
          b.current_step = json.current_step;
          b.completed_steps = json.completed_steps;
          if (json.rejection) {
            if (!b.rejections) b.rejections = [];
            b.rejections.unshift(json.rejection);
          }
        }
        closeRejectionModal();
        renderBatches();
      } else {
        alert("Error: " + (json.error || "Unknown"));
      }
    } catch (err) {
      alert("Network error: " + err.message);
    }
  };

  /* =========================================
     Delivery Issue Modal
     ========================================= */
  window.openDeliveryModal = function (batchId) {
    const b = ALL_BATCHES.find(x => x.id === batchId);
    if (!b) return;

    deliveryModalState = batchId;
    document.getElementById('deliveryBatchName').textContent = b.name;
    document.getElementById('deliveryIssueInput').value = '';
    document.getElementById('deliveryModal').classList.remove('hidden');
  };

  window.closeDeliveryModal = function () {
    document.getElementById('deliveryModal').classList.add('hidden');
    deliveryModalState = null;
  };

  window.confirmDeliveryIssue = async function () {
    const desc = document.getElementById('deliveryIssueInput').value.trim();
    if (!desc) {
      alert('Please describe the delivery issue');
      return;
    }

    try {
      const res = await fetch("/api/tracker/" + deliveryModalState + "/delivery-issue/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": window.CSRF_TOKEN || "",
        },
        body: JSON.stringify({ description: desc }),
      });
      const json = await res.json();
      if (json.success) {
        const b = ALL_BATCHES.find(x => x.id === deliveryModalState);
        if (b) {
          b.current_step = json.current_step;
          b.completed_steps = json.completed_steps;
        }
        closeDeliveryModal();
        renderBatches();
      } else {
        alert("Error: " + (json.error || "Unknown"));
      }
    } catch (err) {
      alert("Network error: " + err.message);
    }
  };

  /* =========================================
     Init
     ========================================= */
  if (BATCH) {
    renderStepper();
    renderStepGrid();
    renderProgress();
    renderStepComments();
  }
  renderBatches();

  console.log("✅ tracker.js initialized");
})();