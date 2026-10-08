/* ============================================================
   All Batches — Gantt + Machine Schedule
   ============================================================ */

document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  console.log("📦 batches.js loaded");

  if (window.lucide) lucide.createIcons();

  /* =========================================
     Read Django data
     ========================================= */
  function readJSON(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  const MACHINES_RAW = readJSON("machines-data") || [];
  const BATCHES_RAW  = readJSON("batches-data") || [];

  console.log("📦 Machines:", MACHINES_RAW.length, "| Batches:", BATCHES_RAW.length);

  /* =========================================
     Constants
     ========================================= */
  const PROCESS_STEPS = [
    'Store', 'Soft winding', 'Dyeing', 'Hydro', 'Dryer', 'Quality check',
    'Finishing', 'Packing', 'Store (Final)', 'Delivery', 'Completed'
  ];

  const STEP_COLORS = {
    'Store': 'background:#f1f5f9;color:#334155;border-color:#cbd5e1;',
    'Soft winding': 'background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe;',
    'Dyeing': 'background:#f3e8ff;color:#6b21a8;border-color:#e9d5ff;',
    'Hydro': 'background:#cffafe;color:#155e75;border-color:#a5f3fc;',
    'Dryer': 'background:#ffedd5;color:#9a3412;border-color:#fed7aa;',
    'Quality check': 'background:#fefce8;color:#854d0e;border-color:#fef08a;',
    'Finishing': 'background:#eef2ff;color:#3730a3;border-color:#c7d2fe;',
    'Packing': 'background:#f0fdfa;color:#115e59;border-color:#99f6e4;',
    'Store (Final)': 'background:#f1f5f9;color:#475569;border-color:#cbd5e1;',
    'Delivery': 'background:#f0fdf4;color:#166534;border-color:#bbf7d0;',
    'Completed': 'background:#dcfce7;color:#14532d;border-color:#86efac;'
  };

  /* =========================================
     State
     ========================================= */
  let viewMode = 'gantt';
  let showAllocatedOnly = true;
  let selectedMachineId = null;
  let filterFrom = '';
  let filterTo = '';
  let dragging = null;
  let dragOverKey = null;

  /* =========================================
     Date Helpers
     ========================================= */
  function startOfDay(d) { const r = new Date(d); r.setHours(0,0,0,0); return r; }
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function dateKey(d) { return d.toISOString().slice(0,10); }
  function sameDay(a, b) { return dateKey(a) === dateKey(b); }
  function dayLabel(d) {
    return {
      dow: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      day: d.toLocaleDateString('en-GB', { day: '2-digit' }),
      mon: d.toLocaleDateString('en-GB', { month: 'short' })
    };
  }

  /* =========================================
     Build Machine Groups
     ========================================= */
  function buildMachineGroups() {
    const map = new Map();

    // Seed with machines
    for (const m of MACHINES_RAW) {
      const fullName = m.full_name;
      if (!map.has(fullName)) {
        map.set(fullName, {
          machineId: fullName,
          machineName: fullName,
          batches: []
        });
      }
    }

    // Add batches
    for (const batch of BATCHES_RAW) {
      const key = batch.machine_name || 'Unallocated';
      if (!map.has(key)) {
        map.set(key, { machineId: key, machineName: key, batches: [] });
      }
      map.get(key).batches.push({ order: { id: batch.order_id, customerName: batch.customer_name }, batch });
    }

    // Sort batches per machine
    for (const g of map.values()) {
      g.batches.sort((a, b) => {
        if (a.batch.start_time && b.batch.start_time) {
          return new Date(a.batch.start_time) - new Date(b.batch.start_time);
        }
        if (a.batch.start_time) return -1;
        if (b.batch.start_time) return 1;
        return a.batch.batch_id.localeCompare(b.batch.batch_id);
      });
    }

    return [...map.values()].sort((a, b) => a.machineName.localeCompare(b.machineName));
  }

  let machineGroups = buildMachineGroups();

  /* =========================================
     Helpers
     ========================================= */
  function getVisibleGroups() {
    return showAllocatedOnly ? machineGroups.filter(g => g.batches.length > 0) : machineGroups;
  }

  function batchCardStyle(batch) {
    if (batch.is_rejection_reallocated) return 'rejected';
    const step = batch.current_process_step;
    const completed = batch.completed_process_steps || [];
    const currentIdx = PROCESS_STEPS.indexOf(step);
    const dyeingIdx = PROCESS_STEPS.indexOf('Dyeing');

    if (batch.status === 'completed' || step === 'Completed' || completed.includes('Dyeing')) return 'completed';
    if (batch.status === 'running' || step === 'Dyeing' || currentIdx > dyeingIdx) return 'running';
    return 'waiting';
  }

  function progressPercent(batch) {
    const completed = (batch.completed_process_steps || []).length;
    return Math.round((completed / 10) * 100);
  }

  /* =========================================
     Render Stats
     ========================================= */
  function renderStats() {
    const allBatches = BATCHES_RAW;
    const total = allBatches.length;
    const planned = allBatches.filter(b => b.status === 'planned').length;
    const running = allBatches.filter(b => b.status === 'running').length;
    const completed = allBatches.filter(b => b.status === 'completed').length;

    const stats = [
      { title: 'Total Batches', value: total, color: '#3b82f6', icon: 'layers' },
      { title: 'Planned', value: planned, color: '#eab308', icon: 'clock' },
      { title: 'Running', value: running, color: '#a855f7', icon: 'play' },
      { title: 'Completed', value: completed, color: '#22c55e', icon: 'check-circle' }
    ];

    document.getElementById('statsGrid').innerHTML = stats.map(s => `
      <div class="stat-card" onclick="switchView('schedule')">
        <div>
          <div class="stat-label">${s.title}</div>
          <div class="stat-value" style="color:${s.color};">${s.value}</div>
        </div>
        <div class="stat-icon" style="background:${s.color};">
          <i data-lucide="${s.icon}"></i>
        </div>
      </div>
    `).join('');

    // Header summary
    const totalQty = allBatches.reduce((s, b) => s + (b.allocated_qty || 0), 0);
    const machinesInUse = machineGroups.filter(g => g.batches.length > 0).length;
    document.getElementById('headerSummary').textContent =
      `${total} Batches · ${totalQty.toLocaleString()} kg Total · ${machinesInUse}/${machineGroups.length} machines in use`;

    if (window.lucide) lucide.createIcons();
  }

  /* =========================================
     Render Gantt
     ========================================= */
  function renderGantt() {
    const groups = getVisibleGroups();
    const today = startOfDay(new Date());

    // Auto date range
    const allStarts = groups.flatMap(g => g.batches
      .map(b => b.batch.start_time ? startOfDay(new Date(b.batch.start_time)) : null)
      .filter(Boolean));
    const allEnds = groups.flatMap(g => g.batches
      .map(b => {
        if (!b.batch.start_time) return null;
        const endMs = b.batch.end_time
          ? new Date(b.batch.end_time).getTime()
          : new Date(b.batch.start_time).getTime() + b.batch.batch_time_hours * 3600000;
        return startOfDay(new Date(endMs));
      })
      .filter(Boolean));

    const autoStart = allStarts.length ? allStarts.reduce((a,b) => a<b?a:b) : today;
    const autoEnd = allEnds.length ? allEnds.reduce((a,b) => a>b?a:b) : addDays(today, 13);

    const defaultStart = startOfDay(autoStart < addDays(today, -1) ? autoStart : addDays(today, -1));
    const defaultEnd = autoEnd > addDays(defaultStart, 13) ? autoEnd : addDays(defaultStart, 13);

    if (!filterFrom) filterFrom = dateKey(defaultStart);
    if (!filterTo) filterTo = dateKey(defaultEnd);

    document.getElementById('filterFromInput').value = filterFrom;
    document.getElementById('filterToInput').value = filterTo;

    const rangeStart = startOfDay(new Date(filterFrom + 'T00:00:00'));
    const rangeEnd = startOfDay(new Date(filterTo + 'T00:00:00'));
    const totalDays = Math.min(60, Math.max(1, Math.round((rangeEnd - rangeStart) / 86400000) + 1));
    const dates = Array.from({ length: totalDays }, (_, i) => addDays(rangeStart, i));

    document.getElementById('daysShownLabel').textContent = `${totalDays} day${totalDays !== 1 ? 's' : ''} shown`;

    const COL_W = 110, COL_FIRST = 150;

    // Header
    let headHtml = '<tr>';
    headHtml += `<th class="machine-col" style="width:${COL_FIRST}px;min-width:${COL_FIRST}px;">Machine</th>`;
    dates.forEach(d => {
      const isToday = sameDay(d, today);
      const { dow, day, mon } = dayLabel(d);
      headHtml += `<th class="${isToday ? 'today-col' : ''}" style="width:${COL_W}px;min-width:${COL_W}px;">
        <div style="font-size:10px;${isToday ? 'color:#2563eb;font-weight:600;' : ''}">${dow}</div>
        <div style="font-size:13px;font-weight:700;${isToday ? 'color:#1d4ed8;' : 'color:#0f172a;'}">${day}</div>
        <div style="font-size:9px;color:#64748b;">${mon}</div>
      </th>`;
    });
    headHtml += '</tr>';
    document.getElementById('ganttHead').innerHTML = headHtml;

    // Body
    let bodyHtml = '';
    groups.forEach(group => {
      bodyHtml += '<tr>';
      bodyHtml += `<td class="machine-cell">
        <div class="machine-name-cell">
          <i data-lucide="cpu"></i>
          <span class="name">${group.machineName}</span>
        </div>
        <div class="machine-meta">${group.batches.length} batch${group.batches.length !== 1 ? 'es' : ''}</div>
        <div class="machine-meta">${group.batches.reduce((s,b) => s + b.batch.allocated_qty, 0).toLocaleString()} kg</div>
      </td>`;

      dates.forEach(d => {
        const dk = dateKey(d);
        const isTodayCol = sameDay(d, today);
        const isDragOver = dragOverKey === `${group.machineId}|${dk}`;
        const dayStartMs = d.getTime();
        const dayEndMs = dayStartMs + 86400000;
        const activeBatches = group.batches.filter(fb => {
          if (!fb.batch.start_time) return false;
          const startMs = new Date(fb.batch.start_time).getTime();
          return startMs >= dayStartMs && startMs < dayEndMs;
        });

        bodyHtml += `<td class="${isTodayCol ? 'today-cell' : ''} ${isDragOver ? 'drag-over' : ''}"
          data-machine="${group.machineId}" data-date="${dk}"
          style="width:${COL_W}px;min-width:${COL_W}px;min-height:110px;"
          ondragover="handleDragOver(event, '${group.machineId}', '${dk}')"
          ondragleave="handleDragLeave(event)"
          ondrop="handleDrop(event, '${group.machineId}', '${dk}')">`;

        activeBatches.forEach(({ order, batch }) => {
          const pct = progressPercent(batch);
          const styleClass = batchCardStyle(batch);
          const completedCount = (batch.completed_process_steps || []).length;
          const currentStep = batch.current_process_step || 'Store';
          const fmt = (iso) => {
            if (!iso) return null;
            const dt = new Date(iso);
            return `${dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short' })} ${dt.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;
          };
          const startLabel = fmt(batch.start_time);
          const endLabel = fmt(batch.end_time);

          bodyHtml += `<div class="batch-pill ${styleClass}"
            draggable="true"
            ondragstart="handleDragStart(event, '${group.machineId}', '${batch.batch_id}')"
            ondragend="handleDragEnd(event)"
            onclick="event.stopPropagation(); onBatchClick('${batch.order_id}')">
            <div class="progress-bar-track"><div class="bar" style="width:${pct}%;"></div></div>
            <div class="batch-pill-body">
              <div class="batch-pill-id">
                <span>${batch.batch_id}</span>
                ${batch.is_rejection_reallocated ? '<i data-lucide="alert-triangle" class="warn-icon"></i>' : ''}
              </div>
              <div class="batch-pill-order">${order.id}</div>
              <div class="batch-pill-meta">
                <span class="qty">${batch.allocated_qty}kg</span>
                <span class="sep">·</span>
                <span>${batch.batch_time_hours}h</span>
              </div>
              <div class="batch-pill-step">${currentStep === 'Completed' ? '✓ Done' : currentStep}</div>
              <div class="batch-pill-dates">
                ${startLabel ? `<div>▶ ${startLabel}</div>` : ''}
                ${endLabel ? `<div>■ ${endLabel}</div>` : ''}
              </div>
              <div class="batch-pill-dots">
                ${Array.from({length:10}, (_, i) => `<span class="${i < completedCount ? 'filled' : ''}"></span>`).join('')}
              </div>
            </div>
          </div>`;
        });
        bodyHtml += '</td>';
      });
      bodyHtml += '</tr>';
    });
    document.getElementById('ganttBody').innerHTML = bodyHtml;

    // Unscheduled
    const unscheduled = groups.flatMap(g =>
      g.batches.filter(b => !b.batch.start_time).map(b => ({ ...b, machineName: g.machineName }))
    );
    const uBox = document.getElementById('unscheduledBox');
    if (unscheduled.length > 0) {
      uBox.classList.remove('hidden');
      document.getElementById('unscheduledList').innerHTML = unscheduled.map(({ batch, order, machineName }) => `
        <div class="unscheduled-chip" onclick="onBatchClick('${batch.order_id}')">
          <i data-lucide="cpu"></i>
          <span style="font-weight:600;">${batch.batch_id}</span>
          <span style="color:#64748b;">· ${machineName} · ${batch.allocated_qty}kg</span>
        </div>
      `).join('');
    } else {
      uBox.classList.add('hidden');
    }

    if (window.lucide) lucide.createIcons();
  }

  /* =========================================
     Drag & Drop
     ========================================= */
  window.handleDragStart = function (event, machineId, batchId) {
    dragging = { machineId, batchId };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', batchId);
    event.currentTarget.classList.add('dragging');
  };

  window.handleDragEnd = function (event) {
    dragging = null;
    dragOverKey = null;
    document.querySelectorAll('.batch-pill.dragging').forEach(el => el.classList.remove('dragging'));
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  };

  window.handleDragOver = function (event, machineId, dk) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    dragOverKey = `${machineId}|${dk}`;
    document.querySelectorAll('td.drag-over').forEach(el => el.classList.remove('drag-over'));
    event.currentTarget.classList.add('drag-over');
  };

  window.handleDragLeave = function (event) {
    event.currentTarget.classList.remove('drag-over');
  };

  window.handleDrop = function (event, machineId, dk) {
    event.preventDefault();
    if (!dragging || dragging.machineId !== machineId) {
      handleDragEnd(event);
      return;
    }

    const { batchId } = dragging;
    const targetDate = new Date(dk + 'T08:00:00');

    // Find and update locally
    for (const g of machineGroups) {
      if (g.machineId !== machineId) continue;
      for (const fb of g.batches) {
        if (fb.batch.batch_id !== batchId) continue;

        const newStart = new Date(targetDate);
        const newEnd = new Date(newStart.getTime() + fb.batch.batch_time_hours * 3600000);
        fb.batch.start_time = newStart.toISOString();
        fb.batch.end_time = newEnd.toISOString();

        // Save to server
        fetch("/api/batches/" + batchId + "/reschedule/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": window.CSRF_TOKEN || "",
          },
          body: JSON.stringify({
            startTime: newStart.toISOString(),
            endTime: newEnd.toISOString(),
          }),
        }).catch(err => console.error("Failed to reschedule:", err));
      }
      g.batches.sort((a, b) => new Date(a.batch.start_time) - new Date(b.batch.start_time));
    }

    handleDragEnd(event);
    renderAll();
  };

  /* =========================================
     Date Filter
     ========================================= */
  window.setThisWeek = function () {
    const today = new Date();
    filterFrom = dateKey(startOfDay(today));
    filterTo = dateKey(addDays(startOfDay(today), 6));
    renderAll();
  };

  window.setAllBatches = function () {
    const groups = getVisibleGroups();
    const allStarts = groups.flatMap(g => g.batches
      .map(b => b.batch.start_time ? startOfDay(new Date(b.batch.start_time)) : null)
      .filter(Boolean));
    const allEnds = groups.flatMap(g => g.batches
      .map(b => b.batch.start_time ? startOfDay(new Date(b.batch.end_time || b.batch.start_time)) : null)
      .filter(Boolean));

    const today = startOfDay(new Date());
    const min = allStarts.length ? allStarts.reduce((a,b)=>a<b?a:b) : today;
    const max = allEnds.length ? allEnds.reduce((a,b)=>a>b?a:b) : addDays(today,13);

    filterFrom = dateKey(min < addDays(today,-1) ? min : addDays(today,-1));
    filterTo = dateKey(max > addDays(new Date(filterFrom + 'T00:00:00'), 13) ? max : addDays(new Date(filterFrom + 'T00:00:00'), 13));
    renderAll();
  };

  /* =========================================
     Render Schedule
     ========================================= */
  function renderSchedule() {
    const groups = getVisibleGroups();
    if (!selectedMachineId || !groups.find(g => g.machineId === selectedMachineId)) {
      selectedMachineId = groups[0]?.machineId || null;
    }

    const inUse = groups.filter(g => g.batches.length > 0).length;
    document.getElementById('machinesInUseLabel').textContent = `${inUse} in use`;

    // Sidebar
    document.getElementById('machineList').innerHTML = groups.map(g => {
      const active = g.machineId === selectedMachineId;
      const running = g.batches.filter(b => b.batch.status === 'running').length;
      const completed = g.batches.filter(b => b.batch.status === 'completed').length;
      const isEmpty = g.batches.length === 0;

      return `
        <li>
          <button class="${active ? 'active' : ''}" onclick="selectMachine('${g.machineId.replace(/'/g, "\\'")}')">
            <div class="icon-box"><i data-lucide="cpu"></i></div>
            <div style="min-width:0; flex:1;">
              <div class="name">${g.machineName}</div>
              <div class="meta-tags">
                ${isEmpty
                  ? '<span class="mini-tag gray">Free</span>'
                  : `<span class="mini-tag blue">${g.batches.length} batch${g.batches.length !== 1 ? 'es' : ''}</span>`
                }
                ${running > 0 ? `<span class="mini-tag purple">${running} running</span>` : ''}
                ${completed > 0 ? `<span class="mini-tag green">${completed} done</span>` : ''}
              </div>
            </div>
          </button>
        </li>
      `;
    }).join('');

    // Main panel
    const group = groups.find(g => g.machineId === selectedMachineId);
    const main = document.getElementById('scheduleMain');
    if (!group) {
      main.innerHTML = '<div class="empty-state"><i data-lucide="cpu"></i><p>Select a machine from the left panel</p></div>';
      if (window.lucide) lucide.createIcons();
      return;
    }

    const totalQty = group.batches.reduce((s, b) => s + b.batch.allocated_qty, 0);
    const totalHours = group.batches.reduce((s, b) => s + b.batch.batch_time_hours, 0);

    let html = `
      <div class="schedule-main-header">
        <div class="icon-lg"><i data-lucide="cpu"></i></div>
        <div style="flex:1;">
          <div class="title">${group.machineName}</div>
          <div class="sub">${group.batches.length === 0
            ? 'No batches allocated — machine is free'
            : `${group.batches.length} batch${group.batches.length !== 1 ? 'es' : ''} · ${totalQty.toLocaleString()} kg · ${totalHours}h`
          }</div>
        </div>
        <div style="display:flex; gap:2px;">
          ${group.batches.map(b => `
            <div title="${b.batch.batch_id}" style="width:6px; height:18px; border-radius:2px; background:${
              b.batch.status === 'completed' ? '#4ade80' :
              b.batch.status === 'running' ? '#a855f7' : '#bfdbfe'
            };"></div>
          `).join('')}
        </div>
      </div>
    `;

    if (group.batches.length === 0) {
      html += `<div class="empty-state"><i data-lucide="cpu"></i><p style="font-weight:500;">No batches allocated to this machine</p><p class="text-sm" style="margin-top:0.3rem;">Go to Auto Planner → Allocate batches to this machine</p></div>`;
    } else {
      group.batches.forEach(({ order, batch }, idx) => {
        const isLast = idx === group.batches.length - 1;
        const isCompleted = batch.status === 'completed';
        const isRunning = batch.status === 'running';
        const isReallocated = !!batch.is_rejection_reallocated;
        const hasRejections = (batch.rejections?.length ?? 0) > 0;
        const currentStep = batch.current_process_step || 'Store';
        const stepStyle = STEP_COLORS[currentStep] || STEP_COLORS['Store'];
        const circleClass = isReallocated ? 'rejected' : isCompleted ? 'completed' : isRunning ? 'running' : 'planned';
        const cardClass = isReallocated ? 'rejected' : isCompleted ? 'completed' : isRunning ? 'running' : '';
        const badgeClass = isCompleted ? 'completed' : isRunning ? 'running' : 'planned';
        const badgeLabel = isCompleted ? 'Completed' : isRunning ? 'Running' : 'Planned';

        const fmtDate = (iso) => {
          if (!iso) return null;
          const d = new Date(iso);
          return { date: d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' }), time: d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) };
        };
        const start = fmtDate(batch.start_time);
        const end = fmtDate(batch.end_time);
        const completedCount = (batch.completed_process_steps || []).length;

        html += `
          <div class="timeline-batch">
            <div class="timeline-batch-row">
              <div class="timeline-number-col">
                <div class="timeline-circle ${circleClass}">
                  ${isCompleted ? '<i data-lucide="check-check"></i>' : idx + 1}
                </div>
                ${!isLast ? `
                  <div class="timeline-connector">
                    ${[1,2,3,4].map(_ => '<div class="dash"></div>').join('')}
                    <i data-lucide="arrow-down"></i>
                  </div>
                ` : ''}
              </div>
              <div class="timeline-content-col">
                <div class="timeline-card ${cardClass}" onclick="onBatchClick('${batch.order_id}')">
                  <div class="timeline-card-header">
                    <div class="left">
                      <span class="batch-id-text">${batch.batch_id}</span>
                      <span class="status-pill ${badgeClass}">${isRunning ? '● ' : ''}${badgeLabel}</span>
                      ${isReallocated ? '<span class="rejection-pill"><i data-lucide="alert-triangle"></i> Rejection Reallocated</span>' : ''}
                      ${hasRejections && !isReallocated ? `<span class="rejection-pill"><i data-lucide="alert-triangle"></i> ${batch.rejections.length} rejection${batch.rejections.length !== 1 ? 's' : ''}</span>` : ''}
                    </div>
                    <span class="step-badge" style="${stepStyle}">${currentStep}</span>
                  </div>
                  <div class="timeline-meta">
                    <span class="mono">${order.id}</span>
                    <span>${order.customerName}</span>
                    <span style="color:#15803d; font-weight:500;">${batch.allocated_qty.toLocaleString()} kg</span>
                    <span style="color:#b45309;">${batch.batch_time_hours}h</span>
                  </div>
                  ${(start || end) ? `
                    <div class="timeline-times">
                      ${start ? `<span><span class="label">Start:</span> <span class="value">${start.date} ${start.time}</span></span>` : ''}
                      ${start && end ? '<i data-lucide="chevron-right" class="arrow"></i>' : ''}
                      ${end ? `<span><span class="label">End:</span> <span class="value" style="${isCompleted ? 'color:#15803d;' : ''}">${end.date} ${end.time}</span></span>` : ''}
                    </div>
                  ` : ''}
                  ${hasRejections ? `
                    <div class="rejection-list">
                      ${batch.rejections.map(r => `
                        <div class="rejection-item">
                          <i data-lucide="alert-triangle"></i>
                          <span><strong>${r.step}:</strong> ${r.reason}</span>
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}
                  ${completedCount > 0 ? `
                    <div class="timeline-progress-dots">
                      ${['Store','Soft winding','Dyeing','Hydro','Dryer','Quality check','Finishing','Packing','Store (Final)','Delivery'].map(step => {
                        const done = (batch.completed_process_steps || []).includes(step);
                        const cur = currentStep === step;
                        return `<div class="dot ${done ? 'done' : cur ? 'current' : ''}" title="${step}"></div>`;
                      }).join('')}
                      <span class="count">${completedCount}/10 steps</span>
                    </div>
                  ` : ''}
                </div>
                ${!isLast ? `
                  <div class="complete-arrow">
                    <div class="line"></div>
                    <div class="label">Complete → next batch starts</div>
                    <div class="line"></div>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      });
    }

    if (group.batches.length > 0) {
      html += `
        <div class="schedule-summary">
          <div><div class="label">Total Batches</div><div class="value">${group.batches.length}</div></div>
          <div><div class="label">Total Qty</div><div class="value" style="color:#15803d;">${totalQty.toLocaleString()} kg</div></div>
          <div><div class="label">Total Hours</div><div class="value" style="color:#b45309;">${totalHours}h</div></div>
        </div>
      `;
    }

    main.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  }

  window.selectMachine = function (id) {
    selectedMachineId = id;
    renderSchedule();
  };

  /* =========================================
     View Switch
     ========================================= */
  window.switchView = function (mode) {
    viewMode = mode;
    document.getElementById('viewGanttBtn').classList.toggle('active', mode === 'gantt');
    document.getElementById('viewScheduleBtn').classList.toggle('active', mode === 'schedule');
    document.getElementById('ganttView').classList.toggle('hidden', mode !== 'gantt');
    document.getElementById('scheduleView').classList.toggle('hidden', mode !== 'schedule');
    if (mode === 'schedule') renderSchedule();
  };

  window.toggleAllocatedFilter = function () {
    showAllocatedOnly = !showAllocatedOnly;
    document.getElementById('allocatedFilterBtn').classList.toggle('active', showAllocatedOnly);
    document.getElementById('allocatedFilterText').textContent = showAllocatedOnly ? 'Allocated machines only' : 'All machines';
    renderAll();
  };

  /* =========================================
     Batch Click
     ========================================= */
  window.onBatchClick = function (orderId) {
    window.location.href = "/tracker/";
  };

  /* =========================================
     Render All
     ========================================= */
  function renderAll() {
    renderStats();
    if (viewMode === 'gantt') renderGantt();
    else renderSchedule();
  }

  /* =========================================
     Init
     ========================================= */
  document.getElementById('filterFromInput').addEventListener('change', function (e) {
    if (e.target.value) {
      filterFrom = e.target.value;
      renderGantt();
    }
  });

  document.getElementById('filterToInput').addEventListener('change', function (e) {
    if (e.target.value) {
      filterTo = e.target.value;
      renderGantt();
    }
  });

  renderAll();

  console.log("✅ batches.js initialized");
});