/* ============================================================
   Dyeing Machine Details Page — JavaScript
   Add + Edit + Delete with AJAX + Toast
   ✅ Dynamic Company dropdown (Parameter theke)
   ============================================================ */

document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  console.log("📦 machines.js loaded");

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

  /* =========================================
     Elements
     ========================================= */
  const addMachineModal    = document.getElementById("addMachineModal");
  const editMachineModal   = document.getElementById("editMachineModal");
  const deleteMachineModal = document.getElementById("deleteMachineModal");

  const openModalBtn       = document.getElementById("openAddMachineModal");
  const submitAddBtn       = document.getElementById("submitAddMachine");
  const submitEditBtn      = document.getElementById("submitEditMachine");
  const confirmDeleteBtn   = document.getElementById("confirmDeleteMachine");

  const editMachineIdLabel   = document.getElementById("editMachineIdLabel");
  const deleteMachineIdLabel = document.getElementById("deleteMachineIdLabel");
  const machinesTableBody    = document.getElementById("machinesTableBody");

  console.log("🔍 Elements:", {
    addMachineModal: !!addMachineModal,
    editMachineModal: !!editMachineModal,
    deleteMachineModal: !!deleteMachineModal,
    openModalBtn: !!openModalBtn,
    submitAddBtn: !!submitAddBtn,
    submitEditBtn: !!submitEditBtn,
    confirmDeleteBtn: !!confirmDeleteBtn,
    CSRF: window.CSRF_TOKEN ? "OK" : "MISSING",
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

  [addMachineModal, editMachineModal, deleteMachineModal].forEach(function (modal) {
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeModal(modal);
      });
    }
  });

  // ESC key → close all modals
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeModal(addMachineModal);
      closeModal(editMachineModal);
      closeModal(deleteMachineModal);
    }
  });

  /* =========================================
     Toast helper
     ========================================= */
  function reloadPage(message) {
    setTimeout(function () { window.location.reload(); }, message);
  }

  /* =========================================
     ✅ Dynamic Company select helper
     --------------------------------------------------------------
     Jodi option-এ company value na thake (Parameter theke remove hoye
     geche kintu machine-এ company roye geche), tahole dynamically
     option add kore select koro.
     ========================================= */
  function setSelectValue(select, value) {
    if (!select) return;
    const val = value || "";

    // Check if option already exists
    const exists = Array.from(select.options).some(function (opt) {
      return opt.value === val;
    });

    if (!exists && val) {
      // ✅ Dynamically add option
      const newOpt = new Option(val, val);
      select.add(newOpt);
    }

    select.value = val;
  }

  /* =========================================
     ADD MACHINE
     ========================================= */
  if (openModalBtn && addMachineModal) {
    openModalBtn.addEventListener("click", function () {
      // ✅ Reset form on open
      const form = document.getElementById("addMachineForm");
      if (form) {
        form.reset();
        // Default select first company option
        const companySelect = form.querySelector('[name="company"]');
        if (companySelect && companySelect.options.length > 0) {
          companySelect.selectedIndex = 0;
        }
      }
      openModal(addMachineModal);
    });
  }

  if (submitAddBtn) {
    submitAddBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      const form = document.getElementById("addMachineForm");
      if (!form) return;

      const formData = new FormData(form);
      const data = {};
      formData.forEach(function (v, k) { data[k] = v; });

      const missing = [];
      if (!data.company)         missing.push("Company");
      if (!data.machineCapacity) missing.push("Machine Capacity");
      if (!data.cone)            missing.push("Cone");

      if (missing.length > 0) {
        showToast("warning", "Missing Required Fields", "Please fill: " + missing.join(", "));
        return;
      }

      submitAddBtn.disabled = true;
      const orig = submitAddBtn.innerHTML;
      submitAddBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Saving...';
      if (window.lucide) lucide.createIcons();

      try {
        const res = await fetch("/api/machines/create/", {
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
          submitAddBtn.disabled = false;
          submitAddBtn.innerHTML = orig;
          if (window.lucide) lucide.createIcons();
          return;
        }
        if (json.success) {
          showToast("success", "Machine Added Successfully",
            (json.machine && json.machine.machineCapacity
              ? "Machine " + json.machine.machineCapacity + " has been added."
              : "Machine saved."));
          form.reset();
          closeModal(addMachineModal);
          reloadPage(900);
        } else {
          showToast("error", "Could Not Save Machine", json.error || "Unknown error");
          submitAddBtn.disabled = false;
          submitAddBtn.innerHTML = orig;
          if (window.lucide) lucide.createIcons();
        }
      } catch (err) {
        showToast("error", "Network Error", err.message || "Could not reach server.");
        submitAddBtn.disabled = false;
        submitAddBtn.innerHTML = orig;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  /* =========================================
     EDIT MACHINE
     ========================================= */
  function fillEditForm(row) {
    const d = row.dataset;
    const form = document.getElementById("editMachineForm");
    if (!form) return;

    function setVal(name, value) {
      const el = form.querySelector('[name="' + name + '"]');
      if (el) el.value = value || "";
    }

    setVal("machineId",       d.id);

    // ✅ Company — dynamic set (option na thakle add hobe)
    const companySelect = form.querySelector('[name="company"]');
    setSelectValue(companySelect, d.company);

    setVal("machineCapacity", d.capacity);
    setVal("cone",            d.cone);
    setVal("knitSweaterMin",  d.sweaterMin);
    setVal("knitSweaterMax",  d.sweaterMax);
    setVal("knitYarnMin",     d.yarnMin);
    setVal("knitYarnMax",     d.yarnMax);
    setVal("displayOrder",    d.displayOrder);

    if (editMachineIdLabel) {
      editMachineIdLabel.textContent = d.capacity || d.id;
    }
  }

  document.querySelectorAll('[data-action="edit"]').forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      const id = btn.dataset.id;
      const row = machinesTableBody.querySelector('tr[data-id="' + id + '"]');
      if (!row) {
        showToast("error", "Machine not found");
        return;
      }
      fillEditForm(row);
      openModal(editMachineModal);
    });
  });

  if (submitEditBtn) {
    submitEditBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      const form = document.getElementById("editMachineForm");
      if (!form) return;

      const formData = new FormData(form);
      const data = {};
      formData.forEach(function (v, k) { data[k] = v; });

      const machineId = data.machineId;
      if (!machineId) {
        showToast("error", "Missing Machine ID");
        return;
      }

      const missing = [];
      if (!data.company)         missing.push("Company");
      if (!data.machineCapacity) missing.push("Machine Capacity");
      if (!data.cone)            missing.push("Cone");

      if (missing.length > 0) {
        showToast("warning", "Missing Required Fields", "Please fill: " + missing.join(", "));
        return;
      }

      submitEditBtn.disabled = true;
      const orig = submitEditBtn.innerHTML;
      submitEditBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Updating...';
      if (window.lucide) lucide.createIcons();

      try {
        const res = await fetch("/api/machines/" + machineId + "/update/", {
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
          submitEditBtn.disabled = false;
          submitEditBtn.innerHTML = orig;
          if (window.lucide) lucide.createIcons();
          return;
        }
        if (json.success) {
          showToast("success", "Machine Updated Successfully",
            "Machine " + data.machineCapacity + " has been updated.");
          closeModal(editMachineModal);
          reloadPage(900);
        } else {
          showToast("error", "Could Not Update Machine", json.error || "Unknown error");
          submitEditBtn.disabled = false;
          submitEditBtn.innerHTML = orig;
          if (window.lucide) lucide.createIcons();
        }
      } catch (err) {
        showToast("error", "Network Error", err.message || "Could not reach server.");
        submitEditBtn.disabled = false;
        submitEditBtn.innerHTML = orig;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  /* =========================================
     DELETE MACHINE
     ========================================= */
  document.querySelectorAll('[data-action="delete"]').forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      const id = btn.dataset.id;
      const row = machinesTableBody.querySelector('tr[data-id="' + id + '"]');
      const capacity = row ? row.dataset.capacity : id;

      if (deleteMachineIdLabel) deleteMachineIdLabel.textContent = capacity;
      const idInput = document.getElementById("delete_machine_id");
      if (idInput) idInput.value = id;

      openModal(deleteMachineModal);
    });
  });

  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      const idInput = document.getElementById("delete_machine_id");
      const machineId = idInput ? idInput.value : "";

      if (!machineId) {
        showToast("error", "Missing Machine ID");
        return;
      }

      confirmDeleteBtn.disabled = true;
      const orig = confirmDeleteBtn.innerHTML;
      confirmDeleteBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Deleting...';
      if (window.lucide) lucide.createIcons();

      try {
        const res = await fetch("/api/machines/" + machineId + "/delete/", {
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
          showToast("success", "Machine Deleted", "Machine has been removed.");
          closeModal(deleteMachineModal);
          reloadPage(900);
        } else {
          showToast("error", "Could Not Delete Machine", json.error || "Unknown error");
          confirmDeleteBtn.disabled = false;
          confirmDeleteBtn.innerHTML = orig;
          if (window.lucide) lucide.createIcons();
        }
      } catch (err) {
        showToast("error", "Network Error", err.message || "Could not reach server.");
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.innerHTML = orig;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  console.log("✅ machines.js initialized");
});