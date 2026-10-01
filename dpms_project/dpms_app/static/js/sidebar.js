(function () {
  "use strict";

  /* =========================================
     Sidebar — Active state handled by Django
     -----------------------------------------
     Keno JS click handler nei?
     Karon ekhon <a href="{% url %}"> use hocche.
     Browser nijei page navigate kore, aar
     Django template theke active_view diye
     active class add hoy.
     ========================================= */

  /* =========================================
     Rejection count — update badge from anywhere
     Usage (in any page script):
       window.setRejectionCount(5);
     ========================================= */
  window.setRejectionCount = function (count) {
    const badge = document.getElementById("alertsBadge");
    if (!badge) return;
    const num = parseInt(count, 10) || 0;
    badge.textContent = num;
    if (num > 0) {
      badge.classList.add("show");
    } else {
      badge.classList.remove("show");
    }
  };

  /* =========================================
     Optional: Keyboard shortcut
     Alt + 1..7 → quick navigation
     ========================================= */
  const shortcutMap = {
    "1": "dashboard",
    "2": "orders",
    "3": "machines",
    "4": "plan",
    "5": "schedule",
    "6": "batches",
    "7": "alerts",
  };

  document.addEventListener("keydown", function (e) {
    if (!e.altKey) return;
    const key = e.key;
    const view = shortcutMap[key];
    if (!view) return;

    const link = document.querySelector(
      '.sidebar-item[data-view="' + view + '"]'
    );
    if (link) {
      e.preventDefault();
      link.click();
    }
  });

  /* =========================================
     Optional: Mobile toggle (jodi dorkar hoy)
     ========================================= */
  const mobileToggle = document.getElementById("mobileToggle");
  const sidebar = document.querySelector(".sidebar");

  if (mobileToggle && sidebar) {
    mobileToggle.addEventListener("click", function () {
      sidebar.classList.toggle("open");
    });
  }
})();