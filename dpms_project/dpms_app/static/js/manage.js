// ============================================================
// Manage page — Steps CRUD (with break time)
// ============================================================

const URLS = window.MANAGE_URLS;

function withId(template, id) {
  return template.replace(/\/0\//, `/${id}/`);
}

async function api(url, method = "POST", body = null) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": window.CSRF_TOKEN,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const ct = res.headers.get("content-type") || "";

  if (!ct.includes("application/json")) {
    const text = await res.text();
    console.error("Non-JSON response:", text.slice(0, 300));
    throw new Error(`Server returned ${res.status} for ${url}`);
  }

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// ============================================================
// STEP MODAL
// ============================================================
const stepModal = document.getElementById("stepModal");
const stepForm = document.getElementById("stepForm");

function openStepModal(step = null) {
  document.getElementById("stepModalTitle").textContent = step
    ? "Edit Step"
    : "New Step";
  document.getElementById("stepEditId").value = step ? step.id : "";
  document.getElementById("stepName").value = step ? step.name : "";
  document.getElementById("stepInitialTime").value = step ? step.initialTime : 4;
  document.getElementById("stepBreakTime").value = step ? step.breakTime : 0;
  document.getElementById("stepOrder").value = step ? step.displayOrder : 0;
  document.getElementById("stepActive").checked = step ? step.isActive : true;

  stepModal.classList.add("show");
  setTimeout(() => document.getElementById("stepName").focus(), 100);
}

function closeStepModal() {
  stepModal.classList.remove("show");
  stepForm.reset();
}

document.getElementById("btnNewStep").addEventListener("click", () => openStepModal());
document.querySelectorAll("[data-close-step]").forEach((b) =>
  b.addEventListener("click", closeStepModal)
);

stepForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("stepEditId").value;
  const payload = {
    name: document.getElementById("stepName").value.trim(),
    initialTime: document.getElementById("stepInitialTime").value || 0,
    breakTime: document.getElementById("stepBreakTime").value || 0,
    displayOrder: document.getElementById("stepOrder").value || 0,
    isActive: document.getElementById("stepActive").checked,
  };

  if (!payload.name) {
    alert("Step name is required");
    return;
  }

  try {
    if (id) await api(withId(URLS.stepUpdate, id), "POST", payload);
    else await api(URLS.stepCreate, "POST", payload);
    closeStepModal();
    location.reload();
  } catch (err) {
    alert("Error: " + err.message);
  }
});

// Row actions
document.querySelectorAll(".js-edit-step").forEach((btn) => {
  btn.addEventListener("click", () => {
    openStepModal({
      id: btn.dataset.stepId,
      name: btn.dataset.name,
      initialTime: btn.dataset.initialTime,
      breakTime: btn.dataset.breakTime,
      displayOrder: btn.dataset.displayOrder,
      isActive: btn.dataset.isActive === "true",
    });
  });
});

document.querySelectorAll(".js-delete-step").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!confirm("Delete this step?")) return;
    api(withId(URLS.stepDelete, btn.dataset.stepId), "POST")
      .then(() => location.reload())
      .catch((err) => alert("Error: " + err.message));
  });
});

// Overlay click + ESC → close
document.querySelectorAll(".modal-overlay").forEach((ov) => {
  ov.addEventListener("click", (e) => {
    if (e.target === ov) closeStepModal();
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeStepModal();
});