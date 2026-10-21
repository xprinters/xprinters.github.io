// Значок закладки рядом с названием в шапке. Браузеры не дают сайтам добавлять закладки
// скриптом (это убрали из соображений безопасности), поэтому по нажатию — подсказка,
// как добавить страницу именно на этом устройстве.
(function () {
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2m0 15-5-2.18L7 18V5h10z"/></svg>';

  function hint() {
    var ua = navigator.userAgent || "";
    var ipad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    if (/iPhone|iPad|iPod/.test(ua) || ipad) return "Нажмите «Поделиться» внизу экрана и выберите «Добавить в Избранное».";
    if (/Android/.test(ua)) return "Откройте меню браузера ⋮ и нажмите звёздочку ☆.";
    if (/Mac/.test(navigator.platform || ua)) return "Нажмите ⌘+D, чтобы добавить страницу в закладки.";
    return "Нажмите Ctrl+D, чтобы добавить страницу в закладки.";
  }

  var tip = null, tipTimer = null;
  function hideTip() {
    if (tip) { tip.remove(); tip = null; }
    clearTimeout(tipTimer);
    document.removeEventListener("pointerdown", outside, true);
  }
  function outside(ev) { if (tip && !tip.contains(ev.target)) hideTip(); }

  function showTip(btn) {
    hideTip();
    tip = document.createElement("div");
    tip.className = "xp-bm-tip";
    tip.setAttribute("role", "status");
    tip.textContent = hint();
    document.body.appendChild(tip);
    var r = btn.getBoundingClientRect(), w = tip.offsetWidth;
    tip.style.top = (r.bottom + 8) + "px";
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
    tipTimer = setTimeout(hideTip, 5000);
    setTimeout(function () { document.addEventListener("pointerdown", outside, true); }, 0);
  }

  function button() {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "xp-bm";
    b.title = "Добавить страницу в закладки";
    b.setAttribute("aria-label", b.title);
    b.innerHTML = ICON;
    b.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (tip) hideTip(); else showTip(b);
    });
    return b;
  }

  // Значок — в обоих заголовках шапки: название сайта и название страницы (при прокрутке).
  // Блок с названием страницы Material заменяет при переходах, поэтому проверяем каждый раз.
  document$.subscribe(function () {
    hideTip();
    document.querySelectorAll(".md-header__topic").forEach(function (t) {
      if (!t.querySelector(".xp-bm")) t.appendChild(button());
    });
  });
})();
