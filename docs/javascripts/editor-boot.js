// Загружает редактор этикеток только на странице, где он есть (#xp-editor):
// библиотеки весят ~500 КБ, остальным страницам они не нужны.
(function () {
  var loading = null;

  function load(tag, attrs) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement(tag);
      for (var k in attrs) el[k] = attrs[k];
      el.onload = resolve;
      el.onerror = function () { reject(new Error(attrs.src || attrs.href)); };
      document.head.appendChild(el);
    });
  }

  document$.subscribe(function () {
    var root = document.getElementById("xp-editor");
    if (!root) return;
    var base = new URL(root.getAttribute("data-base") || "./", location.href).href;
    if (!loading) {
      loading = load("link", { rel: "stylesheet", href: base + "editor.css" })
        .then(function () { return load("script", { src: base + "vendor/jspdf.umd.min.js" }); })
        .then(function () { return load("script", { src: base + "vendor/JsBarcode.all.min.js" }); })
        .then(function () { return load("script", { src: base + "vendor/qrcode.js" }); })
        .then(function () { return load("script", { src: base + "editor.js" }); });
    }
    loading.then(function () { return window.XPEditor.mount(root, base); })
      .catch(function (e) {
        root.textContent = "Не удалось загрузить редактор (" + e.message + "). Обновите страницу.";
      });
  });
})();
