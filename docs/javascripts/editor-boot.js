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

  // Мгновенная навигация Material при переходе убирает из <head> чужие стили,
  // поэтому editor.css проверяем при каждом показе редактора, а не один раз.
  function ensureCss(href) {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) if (links[i].href === href) return Promise.resolve();
    return load("link", { rel: "stylesheet", href: href });
  }

  document$.subscribe(function () {
    var root = document.getElementById("xp-editor");
    if (!root) return;
    var base = new URL(root.getAttribute("data-base") || "./", location.href).href;
    var css = ensureCss(base + "editor.css");
    if (!loading) {
      loading = css
        .then(function () { return load("script", { src: base + "vendor/jspdf.umd.min.js" }); })
        .then(function () { return load("script", { src: base + "vendor/JsBarcode.all.min.js" }); })
        .then(function () { return load("script", { src: base + "vendor/qrcode.js" }); })
        .then(function () { return load("script", { src: base + "signs-list.js" }); })
        .then(function () { return load("script", { src: base + "editor.js" }); });
    }
    Promise.all([loading, css]).then(function () { return window.XPEditor.mount(root, base); })
      .catch(function (e) {
        root.textContent = "Не удалось загрузить редактор (" + e.message + "). Обновите страницу.";
      });
  });
})();
