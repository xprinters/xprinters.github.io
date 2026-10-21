// На телефоне и планшете рядом с кнопками скачивания из Облака Mail.ru (драйверы,
// BarTender, папки) появляется кнопка «Поделиться»: драйвер нужен на компьютере,
// и ссылку удобнее отправить себе в мессенджер или на почту, чем качать на телефон.
// Системное окно «Поделиться» (Web Share API), без него — копирование ссылки.
(function () {
  // «Поделиться» — значок share из Material Icons (Apache 2.0), привычный по Android
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>';

  // Телефон или планшет: Client Hints, строка браузера; iPad маскируется под Mac,
  // но у него сенсорный экран
  function handheld() {
    var ua = navigator.userAgent || "";
    if (navigator.userAgentData && navigator.userAgentData.mobile) return true;
    if (/Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua)) return true;
    return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  }

  // Видео и инструкции удобно открыть прямо на телефоне — им кнопка не нужна
  function wanted(a) {
    if (!/^https:\/\/cloud\.mail\.ru\/public\//.test(a.href)) return false;
    if (/\.(mp4|pdf)$/i.test(decodeURIComponent(a.pathname))) return false;
    return !/инструкц|видео/i.test(a.textContent);
  }

  function toast(text) {
    var t = document.createElement("div");
    t.className = "xp-toast";
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2500);
  }

  function share(a) {
    var h1 = document.querySelector(".md-content h1");
    var label = a.textContent.trim();
    // кнопка в таблице («Скачать») — берём описание из остальных ячеек строки
    var tr = a.closest("tr");
    if (tr) {
      var cells = [].slice.call(tr.cells).filter(function (c) { return !c.contains(a); })
        .map(function (c) { return c.textContent.trim(); }).filter(Boolean);
      if (cells.length) label = cells.join(" · ");
    }
    // кнопка во вкладке (Windows / macOS / Linux) — добавляем название вкладки
    var block = a.closest(".tabbed-block"), set = block && block.closest(".tabbed-set");
    if (set) {
      var idx = [].indexOf.call(block.parentNode.children, block);
      var tab = set.querySelectorAll(".tabbed-labels > label")[idx];
      var name = tab && tab.textContent.trim();
      if (name && label.toLowerCase().indexOf(name.toLowerCase().split(" ")[0]) < 0) label = name + ": " + label;
    }
    var title = a.getAttribute("data-share-title") || (h1 ? h1.textContent.trim() + " — " : "") + label;
    var data = { title: title, text: title, url: a.href };
    if (navigator.share) {
      navigator.share(data).catch(function () { /* закрыли окно — ничего не делаем */ });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(a.href).then(function () { toast("Ссылка скопирована — отправьте её себе на компьютер"); });
    } else {
      prompt("Скопируйте ссылку:", a.href);
    }
  }

  function attach(root) {
    if (!handheld()) return;
    var links = (root || document).querySelectorAll("a.md-button");
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (!wanted(a) || (a.nextElementSibling && a.nextElementSibling.classList.contains("xp-share"))) continue;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "md-button xp-share";
      b.title = "Отправить ссылку себе на компьютер";
      b.setAttribute("aria-label", "Поделиться ссылкой: " + a.textContent.trim());
      b.innerHTML = ICON;
      b.addEventListener("click", share.bind(null, a));
      a.insertAdjacentElement("afterend", b);
    }
  }

  window.XPShare = { attach: attach, handheld: handheld };
  document$.subscribe(function () { attach(document.querySelector(".md-content")); });
})();
