// Поле поиска на главной открывает встроенный поиск сайта
// и переносит в него уже набранный текст.
document$.subscribe(function () {
  var form = document.querySelector(".xp-search");
  if (!form) return;
  var input = form.querySelector("input");

  function openSearch(event) {
    if (event) event.preventDefault();
    var toggle = document.getElementById("__search");
    var query = document.querySelector("[data-md-component=search-query]");
    if (!toggle || !query) return;
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    query.value = input.value;
    input.value = "";
    input.blur();
    query.focus();
    query.dispatchEvent(new Event("input", { bubbles: true }));
  }

  form.addEventListener("submit", openSearch);
  input.addEventListener("focus", openSearch);
});
