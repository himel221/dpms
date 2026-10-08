/* ============================================================
   Order Detail — Qty auto-calc + Save
   ============================================================ */

document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  if (window.lucide) lucide.createIcons();

  const orderIdInput   = document.getElementById("orderId");
  const orderQtyInput  = document.getElementById("qtyOrderQty");
  const dyeingQtyInput = document.getElementById("qtyDyeingQty");
  const rejectQtyInput = document.getElementById("qtyRejectQty");
  const delQtyInput    = document.getElementById("qtyDelQty");
  const delRetInput    = document.getElementById("qtyDeliveryReturn");

  const dyedBalEl   = document.getElementById("qtyDyedBalQty");
  const finishEl    = document.getElementById("qtyFinishQty");
  const heldUpEl    = document.getElementById("qtyHeldUpQty");
  const deliveryEl  = document.getElementById("qtyDeliveryQty");

  const saveBtn  = document.getElementById("saveQtyBtn");
  const resetBtn = document.getElementById("resetQtyBtn");

  const initialValues = {
    orderQty: orderQtyInput ? orderQtyInput.value : "0",
    dyeingQty: dyeingQtyInput ? dyeingQtyInput.value : "0",
    rejectQty: rejectQtyInput ? rejectQtyInput.value : "0",
    delQty: delQtyInput ? delQtyInput.value : "0",
    deliveryReturn: delRetInput ? delRetInput.value : "0",
  };

  function num(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function fmt(n) {
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  function recalc() {
    const orderQty   = num(orderQtyInput.value);
    const dyeingQty  = num(dyeingQtyInput.value);
    const rejectQty  = num(rejectQtyInput.value);
    const delQty     = num(delQtyInput.value);
    const delRet     = num(delRetInput.value);

    // ✅ Auto formulas
    const dyedBal    = (orderQty - dyeingQty) + rejectQty;
    const finishQty  = dyeingQty - rejectQty;
    const heldUp     = finishQty - delQty;
    const deliveryQty = delQty - delRet;

    if (dyedBalEl)  dyedBalEl.textContent  = fmt(dyedBal);
    if (finishEl)   finishEl.textContent   = fmt(finishQty);
    if (heldUpEl)   heldUpEl.textContent   = fmt(heldUp);
    if (deliveryEl) deliveryEl.textContent = fmt(deliveryQty);
  }

  // Input listeners
  [orderQtyInput, dyeingQtyInput, rejectQtyInput, delQtyInput, delRetInput]
    .forEach(function (el) {
      if (el) el.addEventListener("input", recalc);
    });

  recalc();  // initial

  // Reset
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

  // Save
  if (saveBtn) {
    saveBtn.addEventListener("click", async function () {
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
        const res = await fetch(window.QTY_UPDATE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": window.CSRF_TOKEN || "",
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          const c = data.calculated || {};
          if (dyedBalEl)  dyedBalEl.textContent  = fmt(c.dyedBalQty || 0);
          if (finishEl)   finishEl.textContent   = fmt(c.finishQty || 0);
          if (heldUpEl)   heldUpEl.textContent   = fmt(c.heldUpQty || 0);
          if (deliveryEl) deliveryEl.textContent = fmt(c.deliveryQty || 0);

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
});