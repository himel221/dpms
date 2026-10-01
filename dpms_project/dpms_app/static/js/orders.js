/* ============================================================
   Orders Page — Full JavaScript
   Handles: Filters, Search, Modal, AJAX, Charts, Edit, Delete, Toasts
   + Stat card click → filter + scroll to table
   + Initial filter from URL → auto apply + scroll
   ============================================================ */

document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  console.log("📦 orders.js loaded");

  if (window.lucide) lucide.createIcons();

  /* =========================================
     Toast System
     ========================================= */
  let toastContainer = document.getElementById("toastContainer");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "toastContainer";
    toastContainer.className = "toast-container";
    document.body.appendChild(toastContainer);
  }

  function showToast(type, title, message, duration) {
    duration = duration || 4000;
    const icons = {
      success: "check-circle-2",
      error:   "x-circle",
      warning: "alert-triangle",
      info:    "info",
    };
    const toast = document.createElement("div");
    toast.className = "toast toast-" + type;
    toast.innerHTML =
      '<div class="toast-icon"><i data-lucide="' + (icons[type] || icons.info) + '"></i></div>' +
      '<div class="toast-content">' +
        '<p class="toast-title">' + title + '</p>' +
        (message ? '<p class="toast-message">' + message + '</p>' : '') +
      '</div>' +
      '<button class="toast-close" aria-label="Close"><i data-lucide="x"></i></button>' +
      '<div class="toast-progress"></div>';
    toastContainer.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    const progress = toast.querySelector(".toast-progress");
    progress.style.animation = "toastProgress " + duration + "ms linear forwards";

    const timer = setTimeout(function () { closeToast(toast); }, duration);
    toast.querySelector(".toast-close").addEventListener("click", function () {
      clearTimeout(timer);
      closeToast(toast);
    });
    return toast;
  }

  function closeToast(toast) {
    toast.classList.add("toast-closing");
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 250);
  }

  window.showToast = showToast;

  /* =========================================
     Elements
     ========================================= */
  const tableBody          = document.getElementById("ordersTableBody");
  const searchInput        = document.getElementById("searchInput");
  const filteredCount      = document.getElementById("filteredCount");
  const ordersTablePanel   = document.getElementById("ordersTablePanel");
  const ordersTableTitle   = document.getElementById("ordersTableTitle");
  const toggleFiltersBtn   = document.getElementById("toggleFiltersBtn");
  const toggleFiltersLabel = document.getElementById("toggleFiltersLabel");
  const advancedFilters    = document.getElementById("advancedFilters");

  const newOrderModal      = document.getElementById("newOrderModal");
  const editOrderModal     = document.getElementById("editOrderModal");
  const deleteOrderModal   = document.getElementById("deleteOrderModal");

  const openModalBtn       = document.getElementById("openNewOrderModal");
  const submitNewOrderBtn  = document.getElementById("submitNewOrder");
  const submitEditOrderBtn = document.getElementById("submitEditOrder");
  const confirmDeleteBtn   = document.getElementById("confirmDeleteOrder");

  const editOrderIdLabel   = document.getElementById("editOrderIdLabel");
  const deleteOrderIdLabel = document.getElementById("deleteOrderIdLabel");

  const initialFilter = window.INITIAL_FILTER || "";

  console.log("🔍 Elements:", {
    tableBody: !!tableBody,
    ordersTablePanel: !!ordersTablePanel,
    newOrderModal: !!newOrderModal,
    editOrderModal: !!editOrderModal,
    deleteOrderModal: !!deleteOrderModal,
    openModalBtn: !!openModalBtn,
    submitNewOrderBtn: !!submitNewOrderBtn,
    submitEditOrderBtn: !!submitEditOrderBtn,
    confirmDeleteBtn: !!confirmDeleteBtn,
    CSRF: window.CSRF_TOKEN ? "OK" : "MISSING",
    initialFilter: initialFilter || "(none)",
  });

  /* =========================================
     State
     ========================================= */
  let activeStatus = initialFilter || null;
  let showFilters = false;

  const filters = {
    startDate: "", endDate: "", customer: "", yarnCount: "",
    yarnCode: "", color: "", minQty: "", maxQty: "",
  };

  /* =========================================
     Helpers
     ========================================= */
  function getAllRows() {
    if (!tableBody) return [];
    return Array.from(tableBody.querySelectorAll("tr.order-row"));
  }

  function rowMatches(row) {
    const status    = row.dataset.status;
    const customer  = (row.dataset.customer  || "").toLowerCase();
    const yarnCount = (row.dataset.yarnCount || "").toLowerCase();
    const yarnCode  = (row.dataset.yarnCode  || "").toLowerCase();
    const color     = (row.dataset.color     || "").toLowerCase();
    const qty       = parseFloat(row.dataset.qty) || 0;
    const date      = row.dataset.date;
    const planned   = row.dataset.planned === "true";
    const search    = ((searchInput && searchInput.value) || "").trim().toLowerCase();

    if (activeStatus && activeStatus !== "all") {
      if (activeStatus === "Planned" && !planned) return false;
      if (activeStatus === "Emergency" && status !== "Emergency") return false;
      if (activeStatus !== "Planned" && activeStatus !== "Emergency" && status !== activeStatus)
        return false;
    }

    if (filters.startDate && date < filters.startDate) return false;
    if (filters.endDate && date > filters.endDate) return false;
    if (filters.customer && customer !== filters.customer.toLowerCase()) return false;
    if (filters.yarnCount && yarnCount !== filters.yarnCount.toLowerCase()) return false;
    if (filters.yarnCode && yarnCode !== filters.yarnCode.toLowerCase()) return false;
    if (filters.color && color !== filters.color.toLowerCase()) return false;
    if (filters.minQty && qty < parseFloat(filters.minQty)) return false;
    if (filters.maxQty && qty > parseFloat(filters.maxQty)) return false;

    if (search) {
      const haystack = [row.dataset.id, customer, yarnCount, yarnCode, color].join(" ");
      if (!haystack.includes(search)) return false;
    }
    return true;
  }

  function applyFilters() {
    const rows = getAllRows();
    let visible = 0;

    rows.forEach(function (row) {
      const match = rowMatches(row);
      row.style.display = match ? "" : "none";
      if (match) visible++;
    });

    if (filteredCount) filteredCount.textContent = visible;

    // Summary card active state
    document.querySelectorAll(".summary-card").forEach(function (card) {
      card.classList.toggle("active", card.dataset.filter === activeStatus);
    });

    // ✅ Update table title dynamically
    if (ordersTableTitle) {
      ordersTableTitle.textContent =
        activeStatus && activeStatus !== "all"
          ? activeStatus + " Orders"
          : "All Orders";
    }
  }

  /* =========================================
     Scroll to orders table
     ========================================= */
  function scrollToTable() {
    if (!ordersTablePanel) return;
    setTimeout(function () {
      ordersTablePanel.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }

  /* =========================================
     Summary cards → filter + scroll
     ========================================= */
  document.querySelectorAll(".summary-card").forEach(function (card) {
    card.addEventListener("click", function () {
      const f = card.dataset.filter;
      activeStatus = activeStatus === f ? null : f;
      applyFilters();
      scrollToTable();       // ✅ Auto scroll to table
    });
  });

  /* =========================================
     Search
     ========================================= */
  if (searchInput) {
    searchInput.addEventListener("input", applyFilters);
  }

  /* =========================================
     Toggle filters
     ========================================= */
  if (toggleFiltersBtn && advancedFilters && toggleFiltersLabel) {
    toggleFiltersBtn.addEventListener("click", function () {
      showFilters = !showFilters;
      advancedFilters.hidden = !showFilters;
      toggleFiltersLabel.textContent = showFilters ? "Hide Filters" : "Show Filters";
    });
  }

  /* =========================================
     Advanced filter inputs
     ========================================= */
  const filterMap = {
    filterStartDate: "startDate", filterEndDate: "endDate",
    filterCustomer: "customer", filterYarnCount: "yarnCount",
    filterYarnCode: "yarnCode", filterColor: "color",
    filterMinQty: "minQty", filterMaxQty: "maxQty",
  };

  Object.keys(filterMap).forEach(function (id) {
    const el = document.getElementById(id);
    const key = filterMap[id];
    if (!el) return;

    function update() {
      filters[key] = el.value;
      applyFilters();
    }
    el.addEventListener("input", update);
    el.addEventListener("change", update);
  });

  /* =========================================
     Modal helpers
     ========================================= */
  function openModal(modal) {
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  document.querySelectorAll("[data-close-modal]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const modal = document.getElementById(btn.dataset.closeModal);
      closeModal(modal);
    });
  });

  [newOrderModal, editOrderModal, deleteOrderModal].forEach(function (modal) {
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeModal(modal);
      });
    }
  });

  /* =========================================
     NEW ORDER
     ========================================= */
  if (openModalBtn) {
    openModalBtn.addEventListener("click", function () {
      openModal(newOrderModal);
      const dateInput = newOrderModal.querySelector('[name="orderDate"]');
      if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split("T")[0];
      }
    });
  }

  if (submitNewOrderBtn) {
    submitNewOrderBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      const form = document.getElementById("newOrderForm");
      if (!form) return;

      const formData = new FormData(form);
      const data = {};
      formData.forEach(function (v, k) { data[k] = v; });

      const missing = [];
      if (!data.customerName) missing.push("Customer Name");
      if (!data.yarnCount)    missing.push("Yarn Count");
      if (!data.yarnCode)     missing.push("Yarn Code");
      if (!data.color)        missing.push("Color");
      if (!data.orderQty)     missing.push("Order Qty");

      if (missing.length > 0) {
        showToast("warning", "Missing Required Fields", "Please fill: " + missing.join(", "));
        return;
      }

      submitNewOrderBtn.disabled = true;
      const orig = submitNewOrderBtn.innerHTML;
      submitNewOrderBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Saving...';
      if (window.lucide) lucide.createIcons();

      try {
        const res = await fetch("/api/orders/create/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": window.CSRF_TOKEN || "",
          },
          body: JSON.stringify(data),
        });
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch (err) {
          showToast("error", "Server Error", "Unexpected server response.");
          submitNewOrderBtn.disabled = false;
          submitNewOrderBtn.innerHTML = orig;
          if (window.lucide) lucide.createIcons();
          return;
        }
        if (json.success) {
          showToast("success", "Order Created Successfully",
            (json.order && json.order.id ? "Order " + json.order.id + " has been saved." : "Order saved."));
          form.reset();
          closeModal(newOrderModal);
          setTimeout(function () { window.location.reload(); }, 900);
        } else {
          showToast("error", "Could Not Save Order", json.error || "Unknown error");
          submitNewOrderBtn.disabled = false;
          submitNewOrderBtn.innerHTML = orig;
          if (window.lucide) lucide.createIcons();
        }
      } catch (err) {
        showToast("error", "Network Error", err.message || "Could not reach the server.");
        submitNewOrderBtn.disabled = false;
        submitNewOrderBtn.innerHTML = orig;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  /* =========================================
     EDIT ORDER
     ========================================= */
  function fillEditForm(row) {
    const d = row.dataset;
    const form = document.getElementById("editOrderForm");
    if (!form) return;

    function setVal(name, value) {
      const el = form.querySelector('[name="' + name + '"]');
      if (el) el.value = value || "";
    }

    setVal("orderId",         d.id);
    setVal("customerName",    d.customer);
    setVal("orderDate",       d.date);
    setVal("refNoBuyers",     d.refNo);
    setVal("workOrderRemark", d.workOrder);
    setVal("comments",        d.comments);
    setVal("yarnCount",       d.yarnCount);
    setVal("yarnCode",        d.yarnCode);
    setVal("color",           d.color);
    setVal("orderQty",        d.qty);
    setVal("partyYarn",       d.partyYarn);
    setVal("storeYarn",       d.storeYarn);
    setVal("addPercentYN",    d.addPercent);
    setVal("dyeingQty",       d.dyeingQty);
    setVal("rejectQty",       d.rejectQty);
    setVal("dyedBalQty",      d.dyedBal);
    setVal("finishQty",       d.finishQty);
    setVal("delQty",          d.delQty);
    setVal("heldUpQty",       d.heldUp);
    setVal("deliveryReturn",  d.deliveryReturn);
    setVal("deliveryQty",     d.deliveryQty);
    setVal("status",          d.status || "Pending");

    if (editOrderIdLabel) editOrderIdLabel.textContent = d.id || "";
  }

  if (submitEditOrderBtn) {
    submitEditOrderBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      const form = document.getElementById("editOrderForm");
      if (!form) return;

      const formData = new FormData(form);
      const data = {};
      formData.forEach(function (v, k) { data[k] = v; });
      const orderId = data.orderId;

      if (!orderId) {
        showToast("error", "Missing Order ID");
        return;
      }

      const missing = [];
      if (!data.customerName) missing.push("Customer Name");
      if (!data.yarnCount)    missing.push("Yarn Count");
      if (!data.yarnCode)     missing.push("Yarn Code");
      if (!data.color)        missing.push("Color");
      if (!data.orderQty)     missing.push("Order Qty");

      if (missing.length > 0) {
        showToast("warning", "Missing Required Fields", "Please fill: " + missing.join(", "));
        return;
      }

      submitEditOrderBtn.disabled = true;
      const orig = submitEditOrderBtn.innerHTML;
      submitEditOrderBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Updating...';
      if (window.lucide) lucide.createIcons();

      try {
        const res = await fetch("/api/orders/" + orderId + "/update/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": window.CSRF_TOKEN || "",
          },
          body: JSON.stringify(data),
        });
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch (err) {
          showToast("error", "Server Error", "Unexpected server response.");
          submitEditOrderBtn.disabled = false;
          submitEditOrderBtn.innerHTML = orig;
          if (window.lucide) lucide.createIcons();
          return;
        }
        if (json.success) {
          showToast("success", "Order Updated Successfully",
            "Order " + orderId + " has been updated.");
          closeModal(editOrderModal);
          setTimeout(function () { window.location.reload(); }, 900);
        } else {
          showToast("error", "Could Not Update Order", json.error || "Unknown error");
          submitEditOrderBtn.disabled = false;
          submitEditOrderBtn.innerHTML = orig;
          if (window.lucide) lucide.createIcons();
        }
      } catch (err) {
        showToast("error", "Network Error", err.message || "Could not reach the server.");
        submitEditOrderBtn.disabled = false;
        submitEditOrderBtn.innerHTML = orig;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  /* =========================================
     DELETE ORDER
     ========================================= */
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      const orderIdInput = document.getElementById("delete_order_id");
      const orderId = orderIdInput ? orderIdInput.value : "";

      if (!orderId) {
        showToast("error", "Missing Order ID");
        return;
      }

      confirmDeleteBtn.disabled = true;
      const orig = confirmDeleteBtn.innerHTML;
      confirmDeleteBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Deleting...';
      if (window.lucide) lucide.createIcons();

      try {
        const res = await fetch("/api/orders/" + orderId + "/delete/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": window.CSRF_TOKEN || "",
          },
        });
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch (err) {
          showToast("error", "Server Error", "Unexpected server response.");
          confirmDeleteBtn.disabled = false;
          confirmDeleteBtn.innerHTML = orig;
          if (window.lucide) lucide.createIcons();
          return;
        }
        if (json.success) {
          showToast("success", "Order Deleted",
            "Order " + orderId + " has been removed.");
          closeModal(deleteOrderModal);
          setTimeout(function () { window.location.reload(); }, 900);
        } else {
          showToast("error", "Could Not Delete Order", json.error || "Unknown error");
          confirmDeleteBtn.disabled = false;
          confirmDeleteBtn.innerHTML = orig;
          if (window.lucide) lucide.createIcons();
        }
      } catch (err) {
        showToast("error", "Network Error", err.message || "Could not reach the server.");
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.innerHTML = orig;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  /* =========================================
     Row actions (Edit / Delete)
     ========================================= */
  getAllRows().forEach(function (row) {
    row.addEventListener("click", function (e) {
      if (e.target.closest(".row-actions")) return;
      console.log("🖱️ Row clicked:", row.dataset.id);
    });
  });

  document.querySelectorAll('[data-action="edit"]').forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      const id = btn.dataset.id;
      const row = tableBody.querySelector('tr[data-id="' + id + '"]');
      if (!row) {
        showToast("error", "Order not found");
        return;
      }
      fillEditForm(row);
      openModal(editOrderModal);
    });
  });

  document.querySelectorAll('[data-action="delete"]').forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (deleteOrderIdLabel) deleteOrderIdLabel.textContent = id;
      const orderIdInput = document.getElementById("delete_order_id");
      if (orderIdInput) orderIdInput.value = id;
      openModal(deleteOrderModal);
    });
  });

  /* =========================================
     Charts
     ========================================= */
  function getStatusData() {
    const statuses = ["Inactive", "Pending", "In Progress", "Completed", "Delayed", "Emergency"];
    const colors = {
      Inactive: "#64748b", Pending: "#eab308", "In Progress": "#a855f7",
      Completed: "#10b981", Delayed: "#ef4444", Emergency: "#f97316",
    };
    const rows = getAllRows();
    return statuses.map(function (s) {
      const matching = rows.filter(function (r) { return r.dataset.status === s; });
      return {
        name: s,
        value: matching.reduce(function (sum, r) {
          return sum + (parseFloat(r.dataset.qty) || 0);
        }, 0),
        count: matching.length,
        color: colors[s],
      };
    }).filter(function (d) { return d.value > 0; });
  }

  function drawCharts() {
    if (!window.Chart) return;
    const data = getStatusData();

    const pieCtx = document.getElementById("orderPieChart");
    if (pieCtx) {
      new Chart(pieCtx, {
        type: "pie",
        data: {
          labels: data.map(function (d) { return d.name; }),
          datasets: [{
            data: data.map(function (d) { return d.value; }),
            backgroundColor: data.map(function (d) { return d.color; }),
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
                  return ctx.label + ": " + ctx.parsed.toLocaleString() + " kg";
                },
              },
            },
          },
        },
      });
    }

    const legend = document.getElementById("orderPieLegend");
    if (legend) {
      legend.innerHTML = data.map(function (d) {
        return '<div class="chart-legend-item" data-legend="' + d.name + '">' +
          '<span class="chart-legend-dot" style="background:' + d.color + '"></span>' +
          "<span>" + d.name + " (" + d.value.toLocaleString() + " kg)</span></div>";
      }).join("");

      legend.querySelectorAll(".chart-legend-item").forEach(function (el) {
        el.addEventListener("click", function () {
          activeStatus = el.dataset.legend;
          applyFilters();
          scrollToTable();
        });
      });
    }

    const barCtx = document.getElementById("orderBarChart");
    if (barCtx) {
      const allStatuses = ["Inactive", "Pending", "In Progress", "Completed", "Delayed", "Emergency"];
      const rows = getAllRows();
      const counts = allStatuses.map(function (s) {
        return rows.filter(function (r) { return r.dataset.status === s; }).length;
      });
      const qtys = allStatuses.map(function (s) {
        return rows.filter(function (r) { return r.dataset.status === s; })
          .reduce(function (sum, r) { return sum + (parseFloat(r.dataset.qty) || 0); }, 0);
      });

      new Chart(barCtx, {
        type: "bar",
        data: {
          labels: allStatuses,
          datasets: [
            { label: "Order Count", data: counts, backgroundColor: "#3b82f6", borderRadius: 6, yAxisID: "y" },
            { label: "Total Qty (kg)", data: qtys, backgroundColor: "#10b981", borderRadius: 6, yAxisID: "y1" },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { position: "left", beginAtZero: true, grid: { color: "#f1f5f9" } },
            y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false } },
            x: { grid: { display: false } },
          },
          plugins: {
            legend: {
              position: "bottom",
              labels: { usePointStyle: true, padding: 16, font: { size: 12 } },
            },
          },
        },
      });
    }
  }

  /* =========================================
     Init
     ========================================= */
  applyFilters();
  drawCharts();

  // ✅ Auto-scroll to table if filter is applied from dashboard
  if (initialFilter && initialFilter !== "all") {
    console.log("📌 Initial filter applied:", initialFilter);
    scrollToTable();
  }

  console.log("✅ orders.js initialized");
});