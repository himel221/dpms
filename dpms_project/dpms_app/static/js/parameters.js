// ============================================================
// Parameter Management — Folder + Parameter CRUD (modal)
// ============================================================

const URLS = window.API_URLS;

// URL-এ id বসানোর helper: "{% url ... 0 %}" → "/parameters/folder/0/update/"
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

  // ⚠️ response HTML kina check koro
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    console.error("Non-JSON response:", text.slice(0, 300));
    throw new Error(
      `Server returned ${res.status} (not JSON). Check URL: ${url}`
    );
  }

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// ============================================================
// FOLDER MODAL
// ============================================================
const folderModal = document.getElementById("folderModal");
const folderForm = document.getElementById("folderForm");

function openFolderModal(folder = null) {
  document.getElementById("folderModalTitle").textContent = folder
    ? "Edit Folder"
    : "New Folder";
  document.getElementById("folderEditId").value = folder ? folder.id : "";
  document.getElementById("folderName").value = folder ? folder.name : "";
  document.getElementById("folderDescription").value = folder
    ? folder.description
    : "";
  document.getElementById("folderOrder").value = folder ? folder.displayOrder : 0;

  folderModal.classList.add("show");
  setTimeout(() => document.getElementById("folderName").focus(), 100);
}

function closeFolderModal() {
  folderModal.classList.remove("show");
  folderForm.reset();
}

document.getElementById("btnNewFolder").addEventListener("click", () => openFolderModal());
document.querySelectorAll("[data-close-folder]").forEach((b) =>
  b.addEventListener("click", closeFolderModal)
);

folderForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("folderEditId").value;
  const payload = {
    name: document.getElementById("folderName").value,
    description: document.getElementById("folderDescription").value,
    displayOrder: document.getElementById("folderOrder").value,
  };

  try {
    if (id) await api(withId(URLS.folderUpdate, id), "POST", payload);
    else await api(URLS.folderCreate, "POST", payload);
    closeFolderModal();
    location.reload();
  } catch (err) {
    alert("Error: " + err.message);
  }
});

// ============================================================
// PARAMETER MODAL
// ============================================================
const paramModal = document.getElementById("paramModal");
const paramForm = document.getElementById("paramForm");

function openParamModal(param = null, folderId = null) {
  document.getElementById("paramModalTitle").textContent = param
    ? "Edit Parameter"
    : "New Parameter";
  document.getElementById("paramEditId").value = param ? param.id : "";
  document.getElementById("paramFolderId").value = param ? param.folderId : folderId;
  document.getElementById("paramName").value = param ? param.name : "";
  document.getElementById("paramKey").value = param ? param.key : "";
  document.getElementById("paramValue").value = param ? param.value : "";
  document.getElementById("paramType").value = param ? param.paramType : "text";
  document.getElementById("paramOrder").value = param ? param.displayOrder : 0;
  document.getElementById("paramActive").checked = param ? param.isActive : true;

  paramModal.classList.add("show");
  setTimeout(() => document.getElementById("paramName").focus(), 100);
}

function closeParamModal() {
  paramModal.classList.remove("show");
  paramForm.reset();
}

document.getElementById("btnNewParam")?.addEventListener("click", (e) => {
  openParamModal(null, e.currentTarget.dataset.folderId);
});
document.querySelectorAll("[data-close-param]").forEach((b) =>
  b.addEventListener("click", closeParamModal)
);

paramForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("paramEditId").value;
  const payload = {
    folderId: document.getElementById("paramFolderId").value,
    name: document.getElementById("paramName").value,
    key: document.getElementById("paramKey").value,
    value: document.getElementById("paramValue").value,
    paramType: document.getElementById("paramType").value,
    displayOrder: document.getElementById("paramOrder").value,
    isActive: document.getElementById("paramActive").checked,
  };

  try {
    if (id) await api(withId(URLS.paramUpdate, id), "POST", payload);
    else await api(URLS.paramCreate, "POST", payload);
    closeParamModal();
    location.reload();
  } catch (err) {
    alert("Error: " + err.message);
  }
});

// ============================================================
// Folder click → switch active
// ============================================================
document.querySelectorAll(".folder-item").forEach((el) => {
  el.addEventListener("click", (e) => {
    if (e.target.closest(".folder-menu-btn")) return;
    window.location.href = `/parameters/?folder=${el.dataset.folderId}`;
  });
});

// ============================================================
// Folder menu → edit / delete
// ============================================================
document.querySelectorAll(".folder-menu-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const li = e.currentTarget.closest(".folder-item");
    const id = li.dataset.folderId;
    const name = li.dataset.folderName;
    const desc = li.dataset.folderDesc;

    const action = prompt(
      `"${name}"\n\nType: edit / delete`,
      "edit"
    );

    if (action === "edit") {
      openFolderModal({ id, name, description: desc, displayOrder: 0 });
    } else if (action === "delete") {
      if (confirm(`Delete "${name}" and all its parameters?`)) {
        api(withId(URLS.folderDelete, id), "POST")
          .then(() => location.reload())
          .catch((err) => alert("Error: " + err.message));
      }
    }
  });
});

// ============================================================
// Parameter row actions
// ============================================================
document.querySelectorAll(".js-edit-param").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.paramId;
    const row = document.querySelector(`tr[data-param-id="${id}"]`);
    const folderId = document.getElementById("btnNewParam")?.dataset.folderId;
    openParamModal({
      id,
      folderId,
      name: row.cells[0].textContent.trim(),
      key: row.cells[1].textContent.trim(),
      value:
        row.cells[2].textContent.trim() === "—"
          ? ""
          : row.cells[2].textContent.trim(),
      paramType: row.cells[3].textContent.trim().toLowerCase(),
      displayOrder: 0,
      isActive: row.cells[4].textContent.includes("Active"),
    });
  });
});

document.querySelectorAll(".js-delete-param").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!confirm("Delete this parameter?")) return;
    api(withId(URLS.paramDelete, btn.dataset.paramId), "POST")
      .then(() => location.reload())
      .catch((err) => alert("Error: " + err.message));
  });
});

// ============================================================
// Overlay click → close
// ============================================================
document.querySelectorAll(".modal-overlay").forEach((ov) => {
  ov.addEventListener("click", (e) => {
    if (e.target === ov) {
      closeFolderModal();
      closeParamModal();
    }
  });
});

// ESC key → close
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeFolderModal();
    closeParamModal();
  }
});