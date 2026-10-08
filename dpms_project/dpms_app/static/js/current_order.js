/* ============================================================
   Current Order — Qty auto-calc + KPI + Chart + Step Tracker + Status
   ============================================================ */

document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  if (window.lucide) lucide.createIcons();

  const coPage = document.getElementById("coPage");
  if (!coPage) return;

  const CFG = {
    csrf:                  coPage.dataset.csrf || "",
    orderId:               coPage.dataset.orderId || "",
    qtyUrl:                coPage.dataset.qtyUpdateUrl || "",
    statusUrl:             coPage.dataset.statusUpdateUrl || "",
    stepUpdateUrlTemplate: coPage.dataset.stepUpdateUrlTemplate || "",
    currentStep:           coPage.dataset.currentStep || "",
  };

  /* =========================================
     Batch navigation and batch list modal
     ========================================= */
  const batchCards = Array.from(document.querySelectorAll(".co-batch-card[data-batch-index]"));
  const batchListItems = Array.from(document.querySelectorAll(".co-batch-modal-item[data-batch-index]"));
  const currentBatchPage = document.getElementById("currentBatchPage");
  const previousBatchBtn = document.getElementById("previousBatchBtn");
  const nextBatchBtn = document.getElementById("nextBatchBtn");
  const batchModal = document.getElementById("allBatchesModal");
  const batchModalDetails = document.getElementById("batchModalDetails");
  const batchModalList = document.getElementById("allBatchesList");
  const batchListPage = document.getElementById("batchListPage");
  const previousBatchListPageBtn = document.getElementById("previousBatchListPageBtn");
  const nextBatchListPageBtn = document.getElementById("nextBatchListPageBtn");
  const batchModalFooter = document.querySelector(".co-batch-modal-footer");
  const batchModalTitle = document.getElementById("allBatchesTitle");
  const backToBatchListBtn = document.getElementById("backToBatchListBtn");
  const batchListPageSize = 10;
  let selectedBatchIndex = 0;
  let batchListPageIndex = 0;

  function renderBatchSelection() {
    if (!batchCards.length) return;
    let selectedCard = null;
    batchCards.forEach(function (card, index) {
      card.hidden = index !== selectedBatchIndex;
      if (index === selectedBatchIndex) selectedCard = card;
    });
    if (currentBatchPage) {
      currentBatchPage.textContent =
        "Batch " + (selectedBatchIndex + 1) + " of " + batchCards.length;
    }
    if (previousBatchBtn) previousBatchBtn.disabled = selectedBatchIndex === 0;
    if (nextBatchBtn) nextBatchBtn.disabled = selectedBatchIndex === batchCards.length - 1;
    batchListItems.forEach(function (item) {
      item.classList.toggle(
        "is-selected",
        Number(item.dataset.batchIndex) === selectedBatchIndex
      );
    });
    if (batchModalDetails && selectedCard) {
      const details = selectedCard.cloneNode(true);
      details.hidden = false;
      details.removeAttribute("data-batch-index");
      batchModalDetails.replaceChildren(details);
      if (batchModalTitle) {
        const heading = details.querySelector(".co-batch-card-header h3");
        batchModalTitle.textContent = heading
          ? "Batch " + heading.textContent.trim() + " details"
          : "Batch details";
      }
    }
  }

  function renderBatchModalMode(mode) {
    const showingList = mode === "list";
    if (batchModalList) batchModalList.hidden = !showingList;
    if (batchModalFooter) batchModalFooter.hidden = !showingList;
    if (batchModalDetails) batchModalDetails.hidden = showingList;
    if (backToBatchListBtn) backToBatchListBtn.hidden = showingList;
    if (batchModalTitle && showingList) batchModalTitle.textContent = "All batches";
  }

  function renderBatchListPage() {
    const pageCount = Math.ceil(batchListItems.length / batchListPageSize);
    const firstVisible = batchListPageIndex * batchListPageSize;
    batchListItems.forEach(function (item, index) {
      item.hidden = index < firstVisible || index >= firstVisible + batchListPageSize;
    });
    if (batchListPage) {
      batchListPage.textContent = pageCount
        ? "Page " + (batchListPageIndex + 1) + " of " + pageCount
        : "Page 0 of 0";
    }
    if (previousBatchListPageBtn) previousBatchListPageBtn.disabled = batchListPageIndex === 0;
    if (nextBatchListPageBtn) {
      nextBatchListPageBtn.disabled = batchListPageIndex >= pageCount - 1;
    }
  }

  if (batchCards.length) {
    renderBatchSelection();
    renderBatchListPage();

    if (previousBatchBtn) {
      previousBatchBtn.addEventListener("click", function () {
        if (selectedBatchIndex > 0) {
          selectedBatchIndex -= 1;
          renderBatchSelection();
        }
      });
    }
    if (nextBatchBtn) {
      nextBatchBtn.addEventListener("click", function () {
        if (selectedBatchIndex < batchCards.length - 1) {
          selectedBatchIndex += 1;
          renderBatchSelection();
        }
      });
    }

    batchCards.forEach(function (card, index) {
      function openSelectedBatchDetails() {
        selectedBatchIndex = index;
        renderBatchSelection();
        openBatchesModal("details");
      }
      card.addEventListener("click", openSelectedBatchDetails);
      card.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openSelectedBatchDetails();
        }
      });
    });

    batchListItems.forEach(function (item) {
      item.addEventListener("click", function () {
        selectedBatchIndex = Number(item.dataset.batchIndex);
        renderBatchSelection();
        renderBatchModalMode("details");
      });
    });

    if (previousBatchListPageBtn) {
      previousBatchListPageBtn.addEventListener("click", function () {
        if (batchListPageIndex > 0) {
          batchListPageIndex -= 1;
          renderBatchListPage();
        }
      });
    }
    if (nextBatchListPageBtn) {
      nextBatchListPageBtn.addEventListener("click", function () {
        const pageCount = Math.ceil(batchListItems.length / batchListPageSize);
        if (batchListPageIndex < pageCount - 1) {
          batchListPageIndex += 1;
          renderBatchListPage();
        }
      });
    }
  }

  const viewAllBatchesBtn = document.getElementById("viewAllBatchesBtn");
  const openBatchesCardBtn = document.getElementById("openBatchesCardBtn");
  const closeAllBatchesBtn = document.getElementById("closeAllBatchesBtn");
  function openBatchesModal(mode) {
    if (!batchModal) return;
    batchListPageIndex = Math.floor(selectedBatchIndex / batchListPageSize);
    renderBatchListPage();
    renderBatchSelection();
    renderBatchModalMode(mode || "details");
    batchModal.hidden = false;
    if (closeAllBatchesBtn) closeAllBatchesBtn.focus();
  }
  if (viewAllBatchesBtn && batchModal) {
    viewAllBatchesBtn.addEventListener("click", function () {
      openBatchesModal("list");
    });
  }
  if (openBatchesCardBtn && batchModal) {
    openBatchesCardBtn.addEventListener("click", function () {
      openBatchesModal("details");
    });
  }
  if (backToBatchListBtn) {
    backToBatchListBtn.addEventListener("click", function () {
      renderBatchModalMode("list");
    });
  }
  if (closeAllBatchesBtn && batchModal) {
    closeAllBatchesBtn.addEventListener("click", function () {
      batchModal.hidden = true;
      if (openBatchesCardBtn) openBatchesCardBtn.focus();
      else if (viewAllBatchesBtn) viewAllBatchesBtn.focus();
    });
  }
  if (batchModal) {
    batchModal.addEventListener("click", function (event) {
      if (event.target === batchModal) batchModal.hidden = true;
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !batchModal.hidden) {
        batchModal.hidden = true;
        if (openBatchesCardBtn) openBatchesCardBtn.focus();
        else if (viewAllBatchesBtn) viewAllBatchesBtn.focus();
      }
    });
  }

  /* =========================================
     Helpers
     ========================================= */
  function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function fmt(n) { return (Math.round(n * 100) / 100).toFixed(2); }

  // ✅ Replace '/0/' placeholder in step-update url
  function stepUpdateUrl(stepId) {
    if (!CFG.stepUpdateUrlTemplate) return "";
    return CFG.stepUpdateUrlTemplate.replace("/0/", "/" + stepId + "/");
  }

  // Convert JS Date → "YYYY-MM-DDTHH:MM" for backend
  function formatLocalISO(date) {
    const pad = function (n) { return n < 10 ? "0" + n : "" + n; };
    return (
      date.getFullYear() + "-" +
      pad(date.getMonth() + 1) + "-" +
      pad(date.getDate()) + "T" +
      pad(date.getHours()) + ":" +
      pad(date.getMinutes())
    );
  }

  /* =========================================
     Chart init
     ========================================= */
  let qtyChart = null;

  function initChart(labels, values) {
    const ctx = document.getElementById("qtyFlowChart");
    if (!ctx || !window.Chart) return;

    qtyChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: "Qty (kg)",
          data: values,
          backgroundColor: [
            "#3b82f6", // Order
            "#6366f1", // Dyeing
            "#a855f7", // Dyed Bal
            "#10b981", // Finish
            "#f59e0b", // Del
            "#94a3b8", // Held Up
            "#ef4444", // Reject
            "#0ea5e9", // Delivery
          ],
          borderRadius: 8,
          borderSkipped: false,
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
                return ctx.parsed.y.toLocaleString() + " kg";
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "#f1f5f9" },
            ticks: {
              callback: function (v) { return v.toLocaleString(); },
              color: "#64748b",
              font: { size: 11 },
            },
          },
          x: {
            grid: { display: false },
            ticks: {
              color: "#475569",
              font: { size: 11, weight: "600" },
            },
          },
        },
      },
    });
  }

  function updateChart(labels, values) {
    if (!qtyChart) {
      initChart(labels, values);
      return;
    }
    qtyChart.data.labels = labels;
    qtyChart.data.datasets[0].data = values;
    qtyChart.update();
  }

  const CHART_LABELS = [
    "Order",
    "Dyeing",
    "Dyed Bal",
    "Finish",
    "Del",
    "Held Up",
    "Reject",
    "Delivery",
  ];

  /* =========================================
     Elements — Qty
     ========================================= */
  const orderQtyInput  = document.getElementById("qtyOrderQty");
  const dyeingQtyInput = document.getElementById("qtyDyeingQty");
  const rejectQtyInput = document.getElementById("qtyRejectQty");
  const delQtyInput    = document.getElementById("qtyDelQty");
  const delRetInput    = document.getElementById("qtyDeliveryReturn");

  // Auto-calc display
  const dyedBalEl  = document.getElementById("qtyDyedBalQty");
  const finishEl   = document.getElementById("qtyFinishQty");
  const heldUpEl   = document.getElementById("qtyHeldUpQty");
  const deliveryEl = document.getElementById("qtyDeliveryQty");

  // KPI values
  const kpiOrderQty    = document.getElementById("kpiOrderQty");
  const kpiDyeingQty   = document.getElementById("kpiDyeingQty");
  const kpiFinishQty   = document.getElementById("kpiFinishQty");
  const kpiDeliveryQty = document.getElementById("kpiDeliveryQty");
  const kpiHeldUp      = document.getElementById("kpiHeldUp");
  const kpiRejectQty   = document.getElementById("kpiRejectQty");

  // Summary list
  const sumOrderQty    = document.getElementById("sumOrderQty");
  const sumDyeingQty   = document.getElementById("sumDyeingQty");
  const sumDyedBal     = document.getElementById("sumDyedBal");
  const sumFinishQty   = document.getElementById("sumFinishQty");
  const sumDelQty      = document.getElementById("sumDelQty");
  const sumHeldUp      = document.getElementById("sumHeldUp");
  const sumRejectQty   = document.getElementById("sumRejectQty");
  const sumDeliveryQty = document.getElementById("sumDeliveryQty");

  const saveBtn  = document.getElementById("saveQtyBtn");
  const resetBtn = document.getElementById("resetQtyBtn");

  const initialValues = {
    orderQty:       orderQtyInput ? orderQtyInput.value : "0",
    dyeingQty:      dyeingQtyInput ? dyeingQtyInput.value : "0",
    rejectQty:      rejectQtyInput ? rejectQtyInput.value : "0",
    delQty:         delQtyInput ? delQtyInput.value : "0",
    deliveryReturn: delRetInput ? delRetInput.value : "0",
  };

  /* =========================================
     Compute values
     ========================================= */
  function computeAllValues() {
    const orderQty   = num(orderQtyInput ? orderQtyInput.value : 0);
    const dyeingQty  = num(dyeingQtyInput ? dyeingQtyInput.value : 0);
    const rejectQty  = num(rejectQtyInput ? rejectQtyInput.value : 0);
    const delQty     = num(delQtyInput ? delQtyInput.value : 0);
    const delRet     = num(delRetInput ? delRetInput.value : 0);

    const dyedBal     = (orderQty - dyeingQty) + rejectQty;
    const finishQty   = dyeingQty - rejectQty;
    const heldUp      = finishQty - delQty;
    const deliveryQty = delQty - delRet;

    return {
      orderQty: orderQty,
      dyeingQty: dyeingQty,
      dyedBal: dyedBal,
      finishQty: finishQty,
      delQty: delQty,
      heldUp: heldUp,
      rejectQty: rejectQty,
      deliveryQty: deliveryQty,
    };
  }

  /* =========================================
     Recalc — updates everything
     ========================================= */
  function recalc() {
    const v = computeAllValues();

    // Auto fields
    if (dyedBalEl)  dyedBalEl.textContent  = fmt(v.dyedBal);
    if (finishEl)   finishEl.textContent   = fmt(v.finishQty);
    if (heldUpEl)   heldUpEl.textContent   = fmt(v.heldUp);
    if (deliveryEl) deliveryEl.textContent = fmt(v.deliveryQty);

    // KPI cards
    if (kpiOrderQty)    kpiOrderQty.textContent    = fmt(v.orderQty);
    if (kpiDyeingQty)   kpiDyeingQty.textContent   = fmt(v.dyeingQty);
    if (kpiFinishQty)   kpiFinishQty.textContent   = fmt(v.finishQty);
    if (kpiDeliveryQty) kpiDeliveryQty.textContent = fmt(v.deliveryQty);
    if (kpiHeldUp)      kpiHeldUp.textContent      = fmt(v.heldUp);
    if (kpiRejectQty)   kpiRejectQty.textContent   = fmt(v.rejectQty);

    // Summary list
    if (sumOrderQty)    sumOrderQty.textContent    = fmt(v.orderQty)    + " kg";
    if (sumDyeingQty)   sumDyeingQty.textContent   = fmt(v.dyeingQty)   + " kg";
    if (sumDyedBal)     sumDyedBal.textContent     = fmt(v.dyedBal)     + " kg";
    if (sumFinishQty)   sumFinishQty.textContent   = fmt(v.finishQty)   + " kg";
    if (sumDelQty)      sumDelQty.textContent      = fmt(v.delQty)      + " kg";
    if (sumHeldUp)      sumHeldUp.textContent      = fmt(v.heldUp)      + " kg";
    if (sumRejectQty)   sumRejectQty.textContent   = fmt(v.rejectQty)   + " kg";
    if (sumDeliveryQty) sumDeliveryQty.textContent = fmt(v.deliveryQty) + " kg";

    // Chart
    updateChart(CHART_LABELS, [
      v.orderQty, v.dyeingQty, v.dyedBal, v.finishQty,
      v.delQty, v.heldUp, v.rejectQty, v.deliveryQty,
    ]);
  }

  // Input listeners
  [orderQtyInput, dyeingQtyInput, rejectQtyInput, delQtyInput, delRetInput].forEach(function (el) {
    if (el) el.addEventListener("input", recalc);
  });

  // Init
  recalc();

  /* =========================================
     Reset
     ========================================= */
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      if (orderQtyInput)  orderQtyInput.value  = initialValues.orderQty;
      if (dyeingQtyInput) dyeingQtyInput.value = initialValues.dyeingQty;
      if (rejectQtyInput) rejectQtyInput.value = initialValues.rejectQty;
      if (delQtyInput)    delQtyInput.value    = initialValues.delQty;
      if (delRetInput)    delRetInput.value    = initialValues.deliveryReturn;
      recalc();
    });
  }

  /* =========================================
     Save Qty
     ========================================= */
  if (saveBtn) {
    saveBtn.addEventListener("click", async function () {
      if (!CFG.qtyUrl) return;

      const payload = {
        orderQty:       orderQtyInput ? orderQtyInput.value : "0",
        dyeingQty:      dyeingQtyInput ? dyeingQtyInput.value : "0",
        rejectQty:      rejectQtyInput ? rejectQtyInput.value : "0",
        delQty:         delQtyInput ? delQtyInput.value : "0",
        deliveryReturn: delRetInput ? delRetInput.value : "0",
      };

      saveBtn.disabled = true;
      const orig = saveBtn.innerHTML;
      saveBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Saving...';
      if (window.lucide) lucide.createIcons();

      try {
        const res = await fetch(CFG.qtyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": CFG.csrf,
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          recalc();
          saveBtn.innerHTML = '<i data-lucide="check-circle-2"></i> Saved!';
          if (window.lucide) lucide.createIcons();
          setTimeout(function () {
            saveBtn.disabled = false;
            saveBtn.innerHTML = orig;
            if (window.lucide) lucide.createIcons();
          }, 1500);
        } else {
          alert("Error: " + (data.error || "Unknown error"));
          saveBtn.disabled = false;
          saveBtn.innerHTML = orig;
          if (window.lucide) lucide.createIcons();
        }
      } catch (err) {
        alert("Network error: " + err.message);
        saveBtn.disabled = false;
        saveBtn.innerHTML = orig;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  /* =========================================
     Status update
     ========================================= */
  const statusSelect = document.getElementById("statusSelect");
  if (statusSelect && CFG.statusUrl) {
    statusSelect.addEventListener("change", async function () {
      try {
        const res = await fetch(CFG.statusUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": CFG.csrf,
          },
          body: JSON.stringify({ status: statusSelect.value }),
        });
        const data = await res.json();
        if (!data.success) {
          alert("Error: " + (data.error || "Unknown"));
          if (data.status) statusSelect.value = data.status;
        }
      } catch (err) {
        alert("Network error: " + err.message);
      }
    });
  }

  /* =========================================
     ✅ Step Tracker — click chip → mark done (auto timestamp)
     ========================================= */
  document.querySelectorAll(".step-chip").forEach(function (chip) {
    chip.addEventListener("click", async function () {
      const stepId = chip.dataset.stepId;
      const stepName = chip.dataset.stepName;
      const isDone = chip.dataset.done === "true";

      if (isDone) {
        // Already done → just mark as active step
        return setActiveStep(stepName, chip);
      }

      // Not done → save current timestamp as end_time + set as active
      const now = new Date();
      const localISO = formatLocalISO(now);
      const url = stepUpdateUrl(stepId);
      if (!url) return;

      chip.disabled = true;
      chip.style.opacity = "0.6";

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": CFG.csrf,
          },
          body: JSON.stringify({
            endTime: localISO,
            isActive: true,
          }),
        });
        const data = await res.json();
        if (data.success) {
          window.location.reload();
        } else {
          alert("Error: " + (data.error || "Unknown"));
          chip.disabled = false;
          chip.style.opacity = "";
        }
      } catch (err) {
        alert("Network error: " + err.message);
        chip.disabled = false;
        chip.style.opacity = "";
      }
    });
  });

  /* =========================================
     ✅ Step Tracker — undo (mark undone)
     ========================================= */
  document.querySelectorAll(".step-undo-btn").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      const stepId = btn.dataset.stepId;
      const url = stepUpdateUrl(stepId);
      if (!url) return;

      if (!confirm("Mark this step as undone?")) return;

      btn.disabled = true;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": CFG.csrf,
          },
          body: JSON.stringify({ endTime: null }),
        });
        const data = await res.json();
        if (data.success) {
          window.location.reload();
        } else {
          alert("Error: " + (data.error || "Unknown"));
          btn.disabled = false;
        }
      } catch (err) {
        alert("Network error: " + err.message);
        btn.disabled = false;
      }
    });
  });

  /* =========================================
     ✅ Step Tracker — save comment
     ========================================= */
  document.querySelectorAll(".step-comment-save").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      const stepId = btn.dataset.stepId;
      const row = btn.closest(".step-tracker-row");
      if (!row) return;

      const commentInput = row.querySelector(".step-comment-input");
      const comment = commentInput ? commentInput.value : "";

      const url = stepUpdateUrl(stepId);
      if (!url) return;

      btn.disabled = true;
      const orig = btn.innerHTML;
      btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';
      if (window.lucide) lucide.createIcons();

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": CFG.csrf,
          },
          body: JSON.stringify({ comment: comment }),
        });
        const data = await res.json();
        if (data.success) {
          btn.innerHTML = '<i data-lucide="check-circle-2"></i>';
          if (window.lucide) lucide.createIcons();
          setTimeout(function () {
            btn.disabled = false;
            btn.innerHTML = orig;
            if (window.lucide) lucide.createIcons();
          }, 1400);
        } else {
          alert("Error: " + (data.error || "Unknown"));
          btn.disabled = false;
          btn.innerHTML = orig;
          if (window.lucide) lucide.createIcons();
        }
      } catch (err) {
        alert("Network error: " + err.message);
        btn.disabled = false;
        btn.innerHTML = orig;
        if (window.lucide) lucide.createIcons();
      }
    });
  });

  /* =========================================
     Helper — set active step only
     ========================================= */
  async function setActiveStep(stepName, chipEl) {
    if (!CFG.statusUrl) return;
    try {
      const res = await fetch(CFG.statusUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": CFG.csrf,
        },
        body: JSON.stringify({ currentStep: stepName }),
      });
      const data = await res.json();
      if (data.success) {
        document.querySelectorAll(".step-tracker-row").forEach(function (el) {
          el.classList.remove("is-active");
        });
        const row = chipEl.closest(".step-tracker-row");
        if (row) row.classList.add("is-active");

        const kpiStep = document.getElementById("kpiCurrentStep");
        if (kpiStep) kpiStep.textContent = stepName;

        CFG.currentStep = stepName;
      }
    } catch (err) {
      console.error("setActiveStep error:", err);
    }
  }

});