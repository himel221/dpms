/* ============================================================
   Dashboard — Real order data from Django + inline filters
   ============================================================ */

document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  console.log("📦 dashboard.js loaded");

  if (window.lucide) lucide.createIcons();

  /* =========================================
     Read Django data from JSON script tags
     ========================================= */
  function readJSON(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      console.error("JSON parse error:", id, e);
      return null;
    }
  }

  const orders     = readJSON("orders-data") || [];
  const statusData = readJSON("status-data") || [];

  console.log("📦 Orders loaded:", orders.length);
  console.log("📦 Status data loaded:", statusData.length);
  if (orders.length > 0) {
    console.log("📦 Sample order:", orders[0]);
  }

  /* =========================================
     Elements
     ========================================= */
  const statCards          = document.querySelectorAll(".stat-card");
  const inlineResults      = document.getElementById("inlineResults");
  const inlineResultsBody  = document.getElementById("inlineResultsBody");
  const inlineResultsTitle = document.getElementById("inlineResultsTitle");
  const closeBtn           = document.getElementById("closeInlineResults");

  /* =========================================
     Stat card click → inline filter (orders)
     ========================================= */
  statCards.forEach(function (card) {
    card.addEventListener("click", function () {
      const filter = card.getAttribute("data-filter");
      const view   = card.getAttribute("data-view");

      if (view === "orders") {
        // Toggle active state
        const wasActive = card.classList.contains("active");
        statCards.forEach(function (c) { c.classList.remove("active"); });

        if (wasActive) {
          // Same card — toggle off
          if (inlineResults) inlineResults.hidden = true;
          return;
        }

        card.classList.add("active");
        showInlineResults(filter);
      } else {
        // machines / batches / alerts — navigate
        window.location.href = "/" + view + "/?filter=" + encodeURIComponent(filter);
      }
    });
  });

  /* =========================================
     Show filtered orders in inline table
     ========================================= */
  function showInlineResults(filter) {
    if (!inlineResults || !inlineResultsBody) return;

    inlineResults.hidden = false;

    // Filter orders
    const filtered = orders.filter(function (o) {
      if (filter === "all") return true;
      if (filter === "Planned") return !!o.isPlanned;
      if (filter === "Emergency") {
        return o.status === "Emergency" || o.priority === "Emergency";
      }
      return o.status === filter;
    });

    // Update title
    if (inlineResultsTitle) {
      const titleText = filter === "all" ? "All Orders" : filter + " Orders";
      inlineResultsTitle.innerHTML =
        titleText +
        ' <span class="panel-count">(' + filtered.length + ' results)</span>';
    }

    // Clear previous
    inlineResultsBody.innerHTML = "";

    // Empty state
    if (filtered.length === 0) {
      inlineResultsBody.innerHTML =
        '<tr>' +
          '<td colspan="9" style="text-align:center;padding:2rem;color:#94a3b8;">' +
            '<i data-lucide="inbox" style="width:2rem;height:2rem;display:block;margin:0 auto 0.5rem;opacity:0.4;"></i>' +
            'No orders found for this filter' +
          '</td>' +
        '</tr>';
      if (window.lucide) lucide.createIcons();
      return;
    }

    // Render rows
    filtered.forEach(function (o) {
      const tr = document.createElement("tr");
      tr.className = "order-row";
      if (o.status === "Emergency") tr.classList.add("row-emergency");

      const statusClass = "status-" + (o.status || "").toLowerCase().replace(/ /g, "-");

      tr.innerHTML =
        '<td><span class="order-id">' + (o.id || "—") + '</span></td>' +
        '<td>' + (o.customerName || "—") + '</td>' +
        '<td class="text-muted">' + (o.orderDate || "—") + '</td>' +
        '<td>' + (o.yarnCount || "—") + '</td>' +
        '<td><span class="color-chip">' + (o.color || "—") + '</span></td>' +
        '<td class="text-right"><strong>' + (o.orderQty || 0) + '</strong></td>' +
        '<td><span class="status-chip ' + statusClass + '">' + (o.status || "—") + '</span></td>' +
        '<td>' + (o.currentStep || "—") + '</td>' +
        '<td>' + ((o.batchAllocations || []).length || "—") + '</td>';

      inlineResultsBody.appendChild(tr);
    });

    // Scroll to results
    setTimeout(function () {
      if (inlineResults) {
        inlineResults.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  }

  /* =========================================
     Close inline results
     ========================================= */
  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      if (inlineResults) inlineResults.hidden = true;
      statCards.forEach(function (c) { c.classList.remove("active"); });
    });
  }

  /* =========================================
     Order Status Pie Chart — REAL data
     ========================================= */
  function drawOrderStatusChart() {
    const canvas = document.getElementById("orderStatusChart");
    if (!canvas || !window.Chart) {
      console.warn("Chart.js not loaded or canvas missing");
      return;
    }

    const filtered = statusData.filter(function (d) {
      return d.qty > 0;
    });

    // Empty state
    if (filtered.length === 0) {
      const parent = canvas.parentNode;
      parent.innerHTML =
        '<div class="empty-state">' +
          '<i data-lucide="pie-chart" class="empty-icon"></i>' +
          '<p>No order data yet</p>' +
          '<p class="empty-sub">Create your first order to see distribution</p>' +
        '</div>';
      if (window.lucide) lucide.createIcons();

      const legend = document.getElementById("orderStatusLegend");
      if (legend) legend.innerHTML = "";
      return;
    }

    // Draw pie chart
    new Chart(canvas, {
      type: "pie",
      data: {
        labels: filtered.map(function (d) { return d.name; }),
        datasets: [{
          data: filtered.map(function (d) { return d.qty; }),
          backgroundColor: filtered.map(function (d) { return d.color; }),
          borderWidth: 2,
          borderColor: "#ffffff",
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.label + ": " + Number(ctx.parsed).toLocaleString() + " kg";
              },
            },
          },
        },
      },
    });

    // Custom legend
    const legend = document.getElementById("orderStatusLegend");
    if (legend) {
      legend.innerHTML = filtered.map(function (d) {
        return '<div class="chart-legend-item">' +
          '<span class="chart-legend-dot" style="background:' + d.color + '"></span>' +
          '<span>' + d.name + ' (' + Number(d.qty).toLocaleString() + ' kg)</span>' +
          '</div>';
      }).join("");
    }
  }

  /* =========================================
     Batch Status Pie Chart — Empty placeholder
     ========================================= */
  function drawBatchStatusChart() {
    const canvas = document.getElementById("batchStatusChart");
    if (!canvas) return;

    const parent = canvas.parentNode;
    parent.innerHTML =
      '<div class="empty-state">' +
        '<i data-lucide="layers" class="empty-icon"></i>' +
        '<p>No batch data yet</p>' +
        '<p class="empty-sub">Batches will appear here once allocated</p>' +
      '</div>';
    if (window.lucide) lucide.createIcons();

    const legend = document.getElementById("batchStatusLegend");
    if (legend) legend.innerHTML = "";
  }

  /* =========================================
     Machine Capacity Bar Chart — Empty placeholder
     ========================================= */
  function drawMachineChart() {
    const canvas = document.getElementById("machineCapacityChart");
    if (!canvas) return;

    const parent = canvas.parentNode;
    parent.innerHTML =
      '<div class="empty-state">' +
        '<i data-lucide="cpu" class="empty-icon"></i>' +
        '<p>No machine data yet</p>' +
        '<p class="empty-sub">Machines will appear here once added</p>' +
      '</div>';
    if (window.lucide) lucide.createIcons();
  }

  /* =========================================
     Weekly Trend Line Chart — Empty placeholder
     ========================================= */
  function drawWeeklyTrend() {
    const canvas = document.getElementById("weeklyTrendChart");
    if (!canvas) return;

    const parent = canvas.parentNode;
    parent.innerHTML =
      '<div class="empty-state">' +
        '<i data-lucide="trending-up" class="empty-icon"></i>' +
        '<p>No production data yet</p>' +
        '<p class="empty-sub">Weekly trend will appear here</p>' +
      '</div>';
    if (window.lucide) lucide.createIcons();
  }

  /* =========================================
     Batch grids — show empty state
     ========================================= */
  function initBatchSections() {
    const todayGrid = document.getElementById("todayBatchesGrid");
    const todayEmpty = document.getElementById("todayBatchesEmpty");
    if (todayGrid && todayEmpty) {
      todayGrid.hidden = true;
      todayEmpty.hidden = false;
    }

    const completedGrid = document.getElementById("completedBatchesGrid");
    const completedEmpty = document.getElementById("completedBatchesEmpty");
    if (completedGrid && completedEmpty) {
      completedGrid.hidden = true;
      completedEmpty.hidden = false;
    }

    const rejectedGrid = document.getElementById("rejectedBatchesGrid");
    const rejectedEmpty = document.getElementById("rejectedBatchesEmpty");
    if (rejectedGrid && rejectedEmpty) {
      rejectedGrid.hidden = true;
      rejectedEmpty.hidden = false;
    }
  }

  /* =========================================
     Buttons — [data-action]
     ========================================= */
  document.querySelectorAll("[data-action]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const action = btn.getAttribute("data-action");
      console.log("Action:", action);

      if (action === "view-all-batches") {
        window.location.href = "/batches/";
      } else if (action === "view-alerts") {
        window.location.href = "/alerts/";
      }
    });
  });

  /* =========================================
     Init
     ========================================= */
  drawOrderStatusChart();
  drawBatchStatusChart();
  drawMachineChart();
  drawWeeklyTrend();
  initBatchSections();

  console.log("✅ dashboard.js initialized");
});