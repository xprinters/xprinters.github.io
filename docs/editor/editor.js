/* Редактор этикеток: SVG-холст в миллиметрах, экспорт в PDF (jsPDF).
   Зависимости: jspdf.umd.min.js, JsBarcode.all.min.js, qrcode.js (vendor/). */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var PT = 25.4 / 72;            // 1 pt в мм
  var DOT = 25.4 / 203;          // точка термоголовки 203 dpi ≈ 0,125 мм
  var ASC = 0.905, DESC = 0.212; // метрики Arimo (как у Arial)
  var LH = 1.15;                 // межстрочный интервал
  var SNAP_PX = 6;               // порог прилипания в пикселях экрана
  var STORE = 'xp-editor:v1';
  var PRESETS = [[58, 40], [43, 25], [40, 30], [30, 20], [75, 120], [100, 150]];

  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

  /* Встроенные шрифты лежат в fonts/, шрифты компьютера — через Local Font Access API (Chrome, Edge) */
  var BUILTIN = [
    { family: 'Arimo', file: 'Arimo', label: 'Arimo — как Arial' },
    { family: 'Roboto Condensed', file: 'RobotoCondensed', label: 'Roboto Condensed — узкий' },
    { family: 'Tinos', file: 'Tinos', label: 'Tinos — как Times' },
    { family: 'Cousine', file: 'Cousine', label: 'Cousine — моноширинный' }
  ];
  function builtin(family) {
    for (var i = 0; i < BUILTIN.length; i++) if (BUILTIN[i].family === family) return BUILTIN[i];
    return null;
  }
  function cssFamily(family) { return '"' + family + '", Arimo, Arial, sans-serif'; }
  var fontPromises = {};
  function ensureFont(family) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    if (!fontPromises[family]) {
      fontPromises[family] = Promise.all([
        document.fonts.load('400 10px "' + family + '"'), document.fonts.load('700 10px "' + family + '"')
      ]).catch(function () {});
    }
    return fontPromises[family];
  }

  var localFonts = null;        // family -> { regular: FontData, bold: FontData }
  var localOk = {};             // family -> true / false: можно ли встроить в PDF
  var canLocal = typeof window.queryLocalFonts === 'function';
  function queryLocal() {
    if (localFonts) return Promise.resolve(localFonts);
    if (!canLocal) return Promise.reject(new Error('unsupported'));
    return window.queryLocalFonts().then(function (list) {
      var map = {};
      list.forEach(function (f) {
        var st = (f.style || '').toLowerCase(), e = map[f.family] || (map[f.family] = {});
        if (/italic|oblique/.test(st)) return;
        if (/^(regular|normal|book|roman)$/.test(st)) e.regular = f;
        else if (!e.regular && !/bold|black|heavy|light|thin|medium|semi|demi|narrow|condensed/.test(st)) e.regular = f;
        if (st === 'bold') e.bold = f;
      });
      Object.keys(map).forEach(function (k) { if (!map[k].regular) delete map[k]; });
      localFonts = map;
      return map;
    });
  }
  /* jsPDF встраивает только TrueType (.ttf); OpenType-CFF (.otf) и коллекции (.ttc) — нет */
  function ttfBytes(fontData) {
    return fontData.blob().then(function (b) { return b.arrayBuffer(); }).then(function (buf) {
      var tag = new DataView(buf).getUint32(0);
      if (tag !== 0x00010000 && tag !== 0x74727565) throw new Error('format');
      return buf;
    });
  }

  /* ---------- утилиты ---------- */
  function svgEl(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function h(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function r2(v) { return Math.round(v * 100) / 100; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- измерение и перенос текста ---------- */
  var mctx = document.createElement('canvas').getContext('2d');
  function measure(text, sizeMm, bold, family) {
    mctx.font = (bold ? '700 ' : '400 ') + '100px ' + cssFamily(family || 'Arimo');
    return mctx.measureText(text).width / 100 * sizeMm;
  }
  function wrap(text, width, sizeMm, bold, family) {
    var out = [];
    String(text).split('\n').forEach(function (para) {
      var words = para.split(' '), line = '';
      words.forEach(function (w) {
        var test = line ? line + ' ' + w : w;
        if (line && measure(test, sizeMm, bold, family) > width) { out.push(line); line = w; }
        else line = test;
      });
      out.push(line);
    });
    return out;
  }
  function textLayout(it) {
    var size = it.size * PT, lh = size * LH;
    var lines = wrap(it.text, it.w, size, it.bold, it.font);
    return { lines: lines, size: size, lh: lh, h: Math.max(1, lines.length) * lh };
  }
  function baseline(it, lay, i) {
    return it.y + i * lay.lh + (lay.lh - (ASC + DESC) * lay.size) / 2 + ASC * lay.size;
  }
  function anchorX(it) {
    return it.align === 'center' ? it.x + it.w / 2 : it.align === 'right' ? it.x + it.w : it.x;
  }

  /* ---------- штрихкоды ---------- */
  var encCache = {};
  function eanFull(d) {
    if (!/^\d{12,13}$/.test(d)) return null;
    var s = 0;
    for (var i = 0; i < 12; i++) s += (+d[i]) * (i % 2 ? 3 : 1);
    var c = (10 - s % 10) % 10;
    if (d.length === 13 && +d[12] !== c) return null;
    return d.slice(0, 12) + c;
  }
  function encodeBarcode(format, data) {
    var key = format + '|' + data;
    if (key in encCache) return encCache[key];
    var res = null;
    try {
      var text = data;
      if (format === 'EAN13') { text = eanFull(data); if (!text) throw 0; }
      if (!data) throw 0;
      var svg = document.createElementNS(NS, 'svg'), valid = true;
      JsBarcode(svg, text, {
        format: format, width: 1, height: 1, margin: 0, flat: true,
        displayValue: false, background: 'transparent',
        valid: function (v) { valid = v; }
      });
      if (!valid) throw 0;
      var bars = [];
      svg.querySelectorAll('g rect').forEach(function (r) {   // полосы лежат в группах, фон — нет
        var off = 0, p = r.parentNode;
        while (p && p !== svg) {
          var m = /translate\(([-\d.]+)/.exec(p.getAttribute('transform') || '');
          if (m) off += parseFloat(m[1]);
          p = p.parentNode;
        }
        bars.push([off + parseFloat(r.getAttribute('x')), parseFloat(r.getAttribute('width'))]);
      });
      res = { modules: parseFloat(svg.getAttribute('width')), bars: bars, text: text };
    } catch (e) { res = null; }
    encCache[key] = res;
    return res;
  }
  function barcodeGeom(it, enc) {
    var tsize = it.textSize * PT;
    var textH = it.showText ? tsize * 1.2 : 0, gap = it.showText ? 0.6 : 0;
    var raw = it.w / enc.modules;
    var mw = Math.max(1, Math.floor(raw / DOT)) * DOT;  // ширина модуля кратна точке принтера
    var bw = mw * enc.modules;
    return {
      mw: mw, x0: it.x + (it.w - bw) / 2, barsH: Math.max(1, it.h - textH - gap),
      tsize: tsize, textY: it.y + it.h - textH + ASC * tsize + (textH - (ASC + DESC) * tsize) / 2,
      tooNarrow: raw < DOT, overflow: bw > it.w + 0.01
    };
  }

  var qrCache = {};
  function encodeQR(data) {
    if (!data) return null;
    if (data in qrCache) return qrCache[data];
    var res = null;
    try {
      var q = qrcode(0, 'M');
      q.addData(data);
      q.make();
      var n = q.getModuleCount(), runs = [];
      for (var r = 0; r < n; r++) {
        for (var c = 0; c < n; c++) {
          if (!q.isDark(r, c)) continue;
          var s = c;
          while (c + 1 < n && q.isDark(r, c + 1)) c++;
          runs.push([s, r, c - s + 1]);
        }
      }
      res = { n: n, runs: runs };
    } catch (e) { res = null; }
    qrCache[data] = res;
    return res;
  }
  function qrGeom(it, enc) {
    var side = Math.min(it.w, it.h);
    var ms = Math.max(1, Math.floor(side / enc.n / DOT)) * DOT;
    var size = ms * enc.n;
    return { ms: ms, x0: it.x + (it.w - size) / 2, y0: it.y + (it.h - size) / 2, size: size };
  }

  /* ---------- знаки: список из signs-list.js, сами знаки — файлы signs/<id>.svg ---------- */
  var SIGN_BASE = '';
  var SIGNS = (function () {
    var cats = window.XPSignList || [], by = {};
    cats.forEach(function (c) { c.items.forEach(function (sg) { by[sg.id] = sg; }); });
    return {
      categories: cats,
      get: function (id) { return by[id] || null; },
      ratio: function (sg) { return sg ? sg.ratio : 1; },
      url: function (sg) { return SIGN_BASE + 'signs/' + sg.id + '.svg'; },
      img: function (sg) { return '<img src="' + SIGN_BASE + 'signs/' + sg.id + '.svg" alt="" loading="lazy">'; }
    };
  })();

  /* ---------- иконки панели (контурные, 24×24) ---------- */
  function icon(d) {
    return '<svg class="xpe-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
  }
  var ICON = {
    new: icon('M14 3H6v18h12V7zM14 3v4h4M12 11v6M9 14h6'),
    open: icon('M3 6h6l2 2h10v11H3z'),
    save: icon('M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7'),
    undo: icon('M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11'),
    redo: icon('M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13'),
    minus: icon('M5 12h14'),
    plus: icon('M12 5v14M5 12h14'),
    print: icon('M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z'),
    download: icon('M12 3v12M7 10l5 5 5-5M5 21h14'),
    portrait: icon('M7 3h10v18H7z'),
    landscape: icon('M3 7h18v10H3z')
  };

  /* ---------- значения по умолчанию ---------- */
  var lastFont = 'Arimo';   // новый текст получает последний выбранный шрифт
  function defaultDoc() {
    return {
      label: { w: 58, h: 40 },
      items: [
        { type: 'text', x: 2, y: 2, w: 54, text: 'Название товара', size: 10, bold: true, align: 'center', font: 'Arimo' },
        { type: 'text', x: 2, y: 7, w: 54, text: 'Арт. 12345 · Цвет: чёрный', size: 7, bold: false, align: 'center', font: 'Arimo' },
        { type: 'barcode', x: 4, y: 13, w: 50, h: 24, format: 'EAN13', data: '460712345678', showText: true, textSize: 8 }
      ]
    };
  }
  function newItem(type, L) {
    var W = L.w, H = L.h;
    switch (type) {
      case 'text': return { type: type, x: W * 0.1, y: H * 0.4, w: W * 0.8, text: 'Текст', size: 10, bold: false, align: 'center', font: lastFont };
      case 'barcode': return { type: type, x: W * 0.1, y: H * 0.3, w: W * 0.8, h: H * 0.45, format: 'CODE128', data: 'ABC123456', showText: true, textSize: 8 };
      case 'qr': var s = Math.min(W, H) * 0.5; return { type: type, x: (W - s) / 2, y: (H - s) / 2, w: s, h: s, data: 'https://xprinter.shop' };
      case 'line': return { type: type, x: W * 0.1, y: H / 2 - 1, w: W * 0.8, h: 2, thickness: 0.4, orient: 'h' };
      case 'rect': return { type: type, x: 1.5, y: 1.5, w: W - 3, h: H - 3, thickness: 0.4, fill: false, radius: 1 };
    }
  }

  /* =================================================================== */
  function Editor(root, base) {
    this.root = root;
    this.base = base;
    this.sel = null;      // один выбранный элемент
    this.multi = [];      // несколько выбранных элементов (id), если их больше одного
    this.marquee = null;  // рамка выделения мышью
    this.guides = [];
    this.undoStack = [];
    this.redoStack = [];
    this.nextId = 1;
    this.doc = this.load() || defaultDoc();
    this.doc.items.forEach(function (it) { it.id = this.nextId++; }, this);
    this.build();
    this.saved = JSON.stringify(this.doc);
    this.fit();
    this.render();
    this.renderProps();
    this.loadDocFonts();
  }

  Editor.prototype.loadDocFonts = function () {
    var self = this, fams = {};
    this.doc.items.forEach(function (it) { if (it.type === 'text' || it.type === 'barcode') fams[it.font || 'Arimo'] = 1; });
    Promise.all(Object.keys(fams).map(ensureFont)).then(function () { self.render(); });
  };

  Editor.prototype.load = function () {
    try { var d = JSON.parse(localStorage.getItem(STORE)); return d && d.label && d.items ? d : null; }
    catch (e) { return null; }
  };
  Editor.prototype.persist = function () {
    try { localStorage.setItem(STORE, JSON.stringify(this.doc)); } catch (e) { /* приватный режим */ }
  };

  /* ---------- история ---------- */
  Editor.prototype.commit = function () {
    var now = JSON.stringify(this.doc);
    if (now === this.saved) return;
    this.undoStack.push(this.saved);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.saved = now;
    this.persist();
    this.updateHistoryButtons();
  };
  Editor.prototype.restore = function (json) {
    this.doc = JSON.parse(json);
    this.saved = json;
    if (this.sel && !this.item(this.sel)) this.sel = null;
    var self = this;
    this.multi = this.multi.filter(function (id) { return self.item(id); });
    if (this.multi.length < 2) this.multi = [];
    this.persist();
    this.syncLabelInputs();
    this.fit();
    this.render();
    this.renderProps();
    this.updateHistoryButtons();
    this.loadDocFonts();
  };
  Editor.prototype.undo = function () {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.saved);
    this.restore(this.undoStack.pop());
  };
  Editor.prototype.redo = function () {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.saved);
    this.restore(this.redoStack.pop());
  };
  Editor.prototype.updateHistoryButtons = function () {
    this.$undo.disabled = !this.undoStack.length;
    this.$redo.disabled = !this.redoStack.length;
  };

  /* Размер холста: физическая этикетка (как в драйвере) или повёрнутая на 90°, если выбрана другая ориентация */
  Editor.prototype.cv = function () {
    var L = this.doc.label;
    return L.rot ? { w: L.h, h: L.w } : { w: L.w, h: L.h };
  };

  Editor.prototype.item = function (id) {
    for (var i = 0; i < this.doc.items.length; i++) if (this.doc.items[i].id === id) return this.doc.items[i];
    return null;
  };

  /* ---------- разметка интерфейса ---------- */
  Editor.prototype.build = function () {
    var self = this;
    var opts = PRESETS.map(function (p) {
      return '<option value="' + p[0] + 'x' + p[1] + '">' + p[0] + ' × ' + p[1] + ' мм</option>';
    }).join('') + '<option value="custom">Свой размер</option>';

    this.root.innerHTML = '';
    var ui = h(
      '<div class="xpe">' +
        '<div class="xpe-top">' +
          // файл
          '<div class="xpe-grp xpe-seg xpe-g-file">' +
            '<button type="button" class="xpe-btn xpe-new" title="Новый пустой макет">' + ICON.new + '<span>Новый</span></button>' +
            '<button type="button" class="xpe-btn xpe-openf" title="Открыть макет: файл .xplabel или PDF из этого редактора (Ctrl+O)">' + ICON.open + '<span>Открыть</span></button>' +
            '<button type="button" class="xpe-btn xpe-savef" title="Сохранить макет в файл (Ctrl+S)">' + ICON.save + '<span>Сохранить</span></button>' +
          '</div>' +
          // история
          '<div class="xpe-grp xpe-seg xpe-g-hist">' +
            '<button type="button" class="xpe-btn xpe-ico-btn xpe-undo" title="Отменить (Ctrl+Z)" aria-label="Отменить">' + ICON.undo + '</button>' +
            '<button type="button" class="xpe-btn xpe-ico-btn xpe-redo" title="Повторить (Ctrl+Y)" aria-label="Повторить">' + ICON.redo + '</button>' +
          '</div>' +
          // этикетка
          '<div class="xpe-grp xpe-g-label">' +
            '<label class="xpe-lbl" for="xpe-preset">Этикетка</label>' +
            '<select class="xpe-preset" id="xpe-preset">' + opts + '</select>' +
            '<span class="xpe-size"><input type="number" class="xpe-lw" min="10" max="200" step="1" aria-label="Ширина, мм">' +
            '<span>×</span><input type="number" class="xpe-lh" min="10" max="300" step="1" aria-label="Высота, мм"><span>мм</span></span>' +
            '<span class="xpe-seg xpe-orient">' +
              '<button type="button" class="xpe-btn xpe-ico-btn xpe-or-v" data-or="v" title="Вертикальная ориентация макета" aria-label="Вертикальная">' + ICON.portrait + '</button>' +
              '<button type="button" class="xpe-btn xpe-ico-btn xpe-or-h" data-or="h" title="Горизонтальная ориентация макета" aria-label="Горизонтальная">' + ICON.landscape + '</button>' +
            '</span>' +
          '</div>' +
          // масштаб
          '<div class="xpe-grp xpe-seg xpe-g-zoom">' +
            '<button type="button" class="xpe-btn xpe-ico-btn xpe-zout" title="Уменьшить (Ctrl + колёсико)" aria-label="Уменьшить">' + ICON.minus + '</button>' +
            '<button type="button" class="xpe-btn xpe-zval" title="Вписать в окно (Ctrl+0)">100%</button>' +
            '<button type="button" class="xpe-btn xpe-ico-btn xpe-zin" title="Увеличить (Ctrl + колёсико)" aria-label="Увеличить">' + ICON.plus + '</button>' +
          '</div>' +
          // результат
          '<div class="xpe-grp xpe-g-out">' +
            '<button type="button" class="xpe-btn xpe-print" title="Печать (Ctrl+P)">' + ICON.print + '<span>Печать</span></button>' +
            '<button type="button" class="xpe-btn xpe-primary xpe-pdf" title="Скачать PDF">' + ICON.download + '<span><span class="xpe-long">Скачать </span>PDF</span></button>' +
          '</div>' +
        '</div>' +
        '<div class="xpe-body">' +
          '<div class="xpe-tools">' +
            '<button type="button" data-add="text"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v3h5.5v12h3V7H19V4z"/></svg> Текст</button>' +
            '<button type="button" data-add="barcode"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 5h2v14H2zm3 0h1v14H5zm2 0h3v14H7zm4 0h1v14h-1zm3 0h2v14h-2zm3 0h1v14h-1zm2 0h3v14h-3z"/></svg> Штрихкод</button>' +
            '<button type="button" data-add="qr"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h8v8H3zm2 2v4h4V5zm8-2h8v8h-8zm2 2v4h4V5zM3 13h8v8H3zm2 2v4h4v-4zm8-2h2v2h-2zm2 2h2v2h-2zm2-2h2v2h-2zm2 2h2v2h-2zm-6 2h2v2h-2zm4 0h2v4h-2zm-2 2h2v2h-2z"/></svg> QR-код</button>' +
            '<button type="button" data-add="line"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11h18v2H3z"/></svg> Линия</button>' +
            '<button type="button" data-add="rect"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h18v18H3zm2 2v14h14V5z"/></svg> Рамка</button>' +
            '<button type="button" data-add="image"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2M8.5 13.5l2.5 3 3.5-4.5 4.5 6H5z"/></svg> Картинка</button>' +
            '<button type="button" data-add="sign"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 5h2.4v14H2zM2 5h5v2.2H2zM2 10.9h4.4v2.2H2zM2 16.8h5V19H2zM9 5h2.4v14H9zM13.6 5H16v14h-2.4zM9 5h7v2.2H9zM9 10.9h7v2.2H9zM18 5h2.4v14H18zM18 5h4v2.2h-4zM18 16.8h4V19h-4z"/></svg> Знаки</button>' +
            '<input type="file" accept="image/png,image/jpeg,image/svg+xml" class="xpe-file" hidden>' +
          '</div>' +
          '<div class="xpe-stagewrap"><div class="xpe-stage"><svg class="xpe-svg" xmlns="' + NS + '"></svg></div>' +
          '<span class="xpe-fname" title="Файл макета"></span></div>' +
          '<div class="xpe-props"></div>' +
        '</div>' +
        '<div class="xpe-hint">«Печать»: выберите термопринтер, размер бумаги как у этикетки и масштаб «По размеру бумаги». ' +
        'С телефона скачайте PDF и откройте его через «Поделиться» → 4Barcode. ' +
        'Скачанный PDF хранит и сам макет: откройте его кнопкой «Открыть», чтобы продолжить работу на любом компьютере. ' +
        'Текущий макет также запоминается в этом браузере.</div>' +
      '</div>');
    this.root.appendChild(ui);

    var q = function (s) { return ui.querySelector(s); };
    this.$svg = q('.xpe-svg');
    this.$stage = q('.xpe-stage');
    this.$props = q('.xpe-props');
    this.$preset = q('.xpe-preset');
    this.$lw = q('.xpe-lw');
    this.$lh = q('.xpe-lh');
    this.$undo = q('.xpe-undo');
    this.$redo = q('.xpe-redo');
    this.$file = q('.xpe-file');
    this.$zval = q('.xpe-zval');
    this.$fname = q('.xpe-fname');
    this.zoom = 1;
    this.syncLabelInputs();
    this.updateHistoryButtons();

    this.$preset.addEventListener('change', function () {
      if (this.value === 'custom') { self.$lw.focus(); return; }
      var p = this.value.split('x');
      self.setLabel(+p[0], +p[1]);
    });
    [this.$lw, this.$lh].forEach(function (inp) {
      inp.addEventListener('change', function () {
        var w = Math.min(200, Math.max(10, +self.$lw.value || 10));
        var hh = Math.min(300, Math.max(10, +self.$lh.value || 10));
        self.setLabel(w, hh);
      });
    });
    this.$undo.addEventListener('click', function () { self.undo(); });
    this.$redo.addEventListener('click', function () { self.redo(); });
    q('.xpe-pdf').addEventListener('click', function () { self.exportPDF('save'); });
    q('.xpe-print').addEventListener('click', function () { self.exportPDF('print'); });
    ui.querySelectorAll('[data-or]').forEach(function (b) {
      b.addEventListener('click', function () { self.setOrientation(b.getAttribute('data-or')); });
    });
    q('.xpe-zin').addEventListener('click', function () { self.setZoom(self.zoom * 1.25); });
    q('.xpe-zout').addEventListener('click', function () { self.setZoom(self.zoom / 1.25); });
    this.$zval.addEventListener('click', function () { self.setZoom(1); });
    q('.xpe-new').addEventListener('click', function () { self.newDoc(); });
    q('.xpe-openf').addEventListener('click', function () { self.openFile(); });
    q('.xpe-savef').addEventListener('click', function () { self.saveFile(); });

    // Ctrl + колёсико — масштаб относительно точки под курсором
    this.$stage.addEventListener('wheel', function (ev) {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      self.setZoom(self.zoom * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), ev);
    }, { passive: false });

    // перетащить файл макета на холст — открыть
    this.$stage.addEventListener('dragover', function (ev) { ev.preventDefault(); });
    this.$stage.addEventListener('drop', function (ev) {
      var f = ev.dataTransfer && ev.dataTransfer.files[0];
      if (!f) return;
      ev.preventDefault();
      if (/^image\//.test(f.type)) self.readImage(f, null);
      else self.readDocFile(f, null);
    });

    ui.querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = b.getAttribute('data-add');
        if (t === 'image') { self.$file.click(); return; }
        if (t === 'sign') { self.openSigns(null); return; }
        self.addItem(newItem(t, self.cv()));
      });
    });
    this.$file.addEventListener('change', function () {
      var f = this.files[0];
      this.value = '';
      if (f) self.readImage(f, null);
    });

    this.bindPointer();
    this.onKey = this.onKey.bind(this);
    document.addEventListener('keydown', this.onKey);
    this.onResize = function () { self.fit(); self.render(); };
    window.addEventListener('resize', this.onResize);
  };

  Editor.prototype.syncLabelInputs = function () {
    var L = this.doc.label, v = L.w + 'x' + L.h;
    this.$lw.value = L.w;
    this.$lh.value = L.h;
    var known = PRESETS.some(function (p) { return p[0] + 'x' + p[1] === v; });
    this.$preset.value = known ? v : 'custom';
    var c = this.cv(), horiz = c.w > c.h, square = c.w === c.h;
    this.root.querySelectorAll('[data-or]').forEach(function (b) {
      var on = !square && (b.getAttribute('data-or') === 'h') === horiz;
      b.classList.toggle('xpe-on', on);
      b.setAttribute('aria-pressed', on);
      b.disabled = square;
    });
    var orient = this.root.querySelector('.xpe-orient');
    if (orient) orient.title = L.rot ? 'Макет повёрнут на 90°: в PDF этикетка будет развёрнута под рулон ' + L.w + '×' + L.h + ' мм' : '';
  };
  /* Ориентация макета. Физический размер этикетки не меняется — поворачивается холст,
     а в PDF содержимое поворачивается обратно под рулон. Элементы центрируются на новом холсте. */
  Editor.prototype.setOrientation = function (o) {
    var L = this.doc.label, before = this.cv();
    var rot = o === 'h' ? L.w < L.h : L.w > L.h;
    if (!!L.rot === rot) return;
    L.rot = rot;
    var after = this.cv(), items = this.doc.items;
    if (items.length) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      items.forEach(function (it) {
        x0 = Math.min(x0, it.x); y0 = Math.min(y0, it.y); x1 = Math.max(x1, it.x + it.w); y1 = Math.max(y1, it.y + it.h);
      });
      var dx = (after.w - (x1 - x0)) / 2 - x0, dy = (after.h - (y1 - y0)) / 2 - y0;
      items.forEach(function (it) { it.x = r2(it.x + dx); it.y = r2(it.y + dy); });
    }
    this.syncLabelInputs();
    this.fit();
    this.render();
    this.renderProps();
    this.commit();
  };

  Editor.prototype.setLabel = function (w, hh) {
    this.doc.label = { w: w, h: hh, rot: false };
    this.syncLabelInputs();
    this.fit();
    this.render();
    this.commit();
  };

  Editor.prototype.addItem = function (it) {
    it.id = this.nextId++;
    this.doc.items.push(it);
    this.sel = it.id;
    this.multi = [];
    this.render();
    this.renderProps();
    this.commit();
  };

  Editor.prototype.readImage = function (file, target) {
    var self = this, rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () {
        var L = self.cv(), ratio = img.naturalHeight / img.naturalWidth;
        if (target) {
          target.src = rd.result; target.nw = img.naturalWidth; target.nh = img.naturalHeight;
          target.h = target.w * ratio;
          self.render(); self.renderProps(); self.commit();
          return;
        }
        var w = L.w * 0.4, hh = w * ratio;
        if (hh > L.h * 0.8) { hh = L.h * 0.8; w = hh / ratio; }
        self.addItem({ type: 'image', x: (L.w - w) / 2, y: (L.h - hh) / 2, w: w, h: hh,
          src: rd.result, nw: img.naturalWidth, nh: img.naturalHeight });
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  };

  /* ---------- выбор знака (EAC, РСТ, уход, переработка…) ---------- */
  var signTab = 'conf';
  Editor.prototype.openSigns = function (target) {
    var self = this, S = SIGNS;
    if (this.$signs) this.$signs.remove();
    var dlg = h('<div class="xpe-modal" role="dialog" aria-modal="true" aria-label="Выбор знака">' +
      '<div class="xpe-mbox"><div class="xpe-mhead"><b>' + (target ? 'Заменить знак' : 'Добавить знак') + '</b>' +
      '<input type="search" class="xpe-msearch" placeholder="Поиск: стирка, EAC, хрупкое…" aria-label="Поиск знака">' +
      '<button type="button" class="xpe-btn xpe-ico-btn xpe-mclose" aria-label="Закрыть">✕</button></div>' +
      '<div class="xpe-mtabs" role="tablist">' + S.categories.map(function (c) {
        return '<button type="button" role="tab" data-cat="' + c.id + '">' + esc(c.name) + '</button>';
      }).join('') + '</div><div class="xpe-mgrid"></div></div></div>');
    document.body.appendChild(dlg);
    this.$signs = dlg;
    var grid = dlg.querySelector('.xpe-mgrid'), search = dlg.querySelector('.xpe-msearch');

    var show = function () {
      var q = search.value.trim().toLowerCase(), list = [];
      S.categories.forEach(function (c) {
        c.items.forEach(function (sg) {
          if (q ? sg.name.toLowerCase().indexOf(q) >= 0 : c.id === signTab) list.push(sg);
        });
      });
      dlg.querySelectorAll('[data-cat]').forEach(function (b) {
        var on = !q && b.getAttribute('data-cat') === signTab;
        b.classList.toggle('xpe-on', on);
        b.setAttribute('aria-selected', on);
      });
      grid.innerHTML = list.length ? list.map(function (sg) {
        return '<button type="button" class="xpe-sign" data-sign="' + sg.id + '" title="' + esc(sg.name) + '">' +
          S.img(sg) + '<span>' + esc(sg.name) + '</span></button>';
      }).join('') : '<p class="xpe-note">Ничего не найдено.</p>';
    };
    var close = function () {
      dlg.remove();
      self.$signs = null;
      document.removeEventListener('keydown', onEsc, true);
    };
    var onEsc = function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } };
    document.addEventListener('keydown', onEsc, true);

    dlg.addEventListener('click', function (ev) {
      if (ev.target === dlg || ev.target.closest('.xpe-mclose')) return close();
      var tab = ev.target.closest('[data-cat]');
      if (tab) { signTab = tab.getAttribute('data-cat'); search.value = ''; show(); return; }
      var b = ev.target.closest('[data-sign]');
      if (!b) return;
      var sg = S.get(b.getAttribute('data-sign')), ratio = S.ratio(sg);
      close();
      if (target) {
        target.key = sg.id;
        target.h = r2(target.w * ratio);
        self.render(); self.renderProps(); self.commit();
        return;
      }
      var L = self.cv(), hh = Math.min(12, L.h * 0.4), w = hh / ratio;
      self.addItem({ type: 'sign', key: sg.id, x: r2((L.w - w) / 2), y: r2((L.h - hh) / 2), w: r2(w), h: r2(hh) });
    });
    search.addEventListener('input', show);
    show();
    search.focus();
  };

  /* ---------- макет внутри PDF ----------
     Каждый PDF из редактора несёт макет вложением maket.xplabel (стандартное вложение PDF,
     видно в Acrobat в панели «Вложения»). «Открыть» находит его и восстанавливает макет.
     Вложение теряется, если PDF пересохранить другой программой. */
  var PDF_ATTACHMENT = 'maket.xplabel';

  // строка PDF в UTF-16BE: для кириллицы в описании вложения
  function pdfText(s) {
    var hex = 'FEFF';
    for (var i = 0; i < s.length; i++) hex += ('000' + s.charCodeAt(i).toString(16)).slice(-4);
    return '<' + hex.toUpperCase() + '>';
  }

  function embedLayout(pdf, json) {
    var I = pdf.internal, fileId = 0;
    var data = unescape(encodeURIComponent(json)); // UTF-8 байтами, как ждёт jsPDF
    I.events.subscribe('postPutResources', function () {
      var streamId = I.newObject();
      I.putStream({
        data: data,
        filters: ['FlateEncode'],
        additionalKeyValues: [
          { key: 'Type', value: '/EmbeddedFile' },
          { key: 'Subtype', value: '/application#2Fjson' },
          { key: 'XPLabel', value: '1' } // метка, по которой «Открыть» находит макет
        ]
      });
      I.out('endobj');
      fileId = I.newObject();
      I.out('<< /Type /Filespec /F (' + PDF_ATTACHMENT + ') /UF ' + pdfText(PDF_ATTACHMENT) +
        ' /Desc ' + pdfText('Макет этикетки: откройте этот PDF в редакторе на xprinters.github.io, чтобы продолжить работу') +
        ' /AFRelationship /Source /EF << /F ' + streamId + ' 0 R >> >>');
      I.out('endobj');
    });
    I.events.subscribe('putCatalog', function () {
      I.out('/Names << /EmbeddedFiles << /Names [(' + PDF_ATTACHMENT + ') ' + fileId + ' 0 R] >> >>');
    });
  }

  // Достаём макет из PDF: ищем поток с меткой /XPLabel, при сжатии распаковываем (zlib)
  function layoutFromPDF(buf) {
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    var mark = s.lastIndexOf('/XPLabel 1');
    if (mark < 0) return Promise.reject(new Error('nolayout'));
    var dictStart = s.lastIndexOf('<<', mark), streamKw = s.indexOf('stream', mark);
    var dict = s.slice(dictStart, streamKw), len = /\/Length (\d+)/.exec(dict);
    if (!len) return Promise.reject(new Error('nolayout'));
    var start = streamKw + 6;
    if (s.charAt(start) === '\r') start++;
    if (s.charAt(start) === '\n') start++;
    var raw = bytes.subarray(start, start + (+len[1]));
    var plain = /\/FlateDecode/.test(dict)
      ? new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()
      : Promise.resolve(raw);
    return plain.then(function (b) { return new TextDecoder('utf-8').decode(b); });
  }

  /* ---------- файл макета (.xplabel) ---------- */
  var FILE_TYPES = [{ description: 'Макет этикетки', accept: { 'application/json': ['.xplabel'] } }];
  var OPEN_TYPES = [{ description: 'Макет этикетки или PDF из редактора', accept: { 'application/json': ['.xplabel', '.json'], 'application/pdf': ['.pdf'] } }];

  Editor.prototype.setFileName = function (name) {
    this.fileName = name || null;
    this.$fname.textContent = name || '';
  };

  Editor.prototype.suggestName = function () {
    var L = this.doc.label, first = null;
    this.doc.items.some(function (it) { if (it.type === 'text' && it.text.trim()) { first = it.text; return true; } });
    var base = first ? first.split('\n')[0].replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) : 'Макет';
    return base + ' ' + L.w + 'x' + L.h + '.xplabel';
  };

  Editor.prototype.serialize = function () {
    var items = this.doc.items.map(function (it) { var c = clone(it); delete c.id; return c; });
    return JSON.stringify({ app: 'xprinter-label', version: 1, label: this.doc.label, items: items }, null, 1);
  };

  /* Сохранить: в Chrome/Edge — в выбранный файл (повторное сохранение перезаписывает его), иначе — скачать */
  Editor.prototype.saveFile = function () {
    var self = this, data = this.serialize();
    if (window.showSaveFilePicker) {
      var getHandle = this.fileHandle ? Promise.resolve(this.fileHandle)
        : window.showSaveFilePicker({ suggestedName: this.suggestName(), types: FILE_TYPES });
      getHandle.then(function (hd) {
        self.fileHandle = hd;
        return hd.createWritable().then(function (w) {
          return w.write(data).then(function () { return w.close(); });
        }).then(function () { self.setFileName(hd.name); self.flash('Сохранено'); });
      }).catch(function (e) {
        if (e && e.name !== 'AbortError') alert('Не удалось сохранить файл: ' + e.message);
      });
      return;
    }
    var name = this.fileName && !/\.pdf$/i.test(this.fileName) ? this.fileName : this.suggestName();
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    this.setFileName(name);
  };

  Editor.prototype.openFile = function () {
    var self = this;
    if (window.showOpenFilePicker) {
      window.showOpenFilePicker({ types: OPEN_TYPES })
        .then(function (hs) { return hs[0].getFile().then(function (f) { self.readDocFile(f, hs[0]); }); })
        .catch(function (e) { if (e && e.name !== 'AbortError') alert('Не удалось открыть файл: ' + e.message); });
      return;
    }
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.xplabel,.json,.pdf,application/json,application/pdf';
    inp.onchange = function () { if (inp.files[0]) self.readDocFile(inp.files[0], null); };
    inp.click();
  };

  Editor.prototype.readDocFile = function (file, handle) {
    var self = this, isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    // из PDF — макет из вложения; такой файл не перезаписываем при «Сохранить»
    var text = isPdf ? file.arrayBuffer().then(layoutFromPDF) : file.text();
    if (isPdf) handle = null;
    text.then(function (txt) {
      var d = JSON.parse(txt);
      if (!d || !d.label || !(d.label.w > 0) || !(d.label.h > 0) || !Array.isArray(d.items)) throw new Error('bad');
      var doc = { label: { w: +d.label.w, h: +d.label.h, rot: !!d.label.rot }, items: d.items.filter(function (it) { return it && NAMES[it.type]; }) };
      doc.items.forEach(function (it) { it.id = self.nextId++; });
      self.undoStack.push(self.saved);
      self.redoStack = [];
      self.sel = null;
      self.restore(JSON.stringify(doc));
      self.fileHandle = handle || null;
      self.setFileName(file.name);
    }).catch(function (e) {
      alert(isPdf
        ? (e && e.message === 'nolayout'
          ? 'В этом PDF нет макета. Открыть для правки можно только PDF, скачанный из этого редактора и не пересохранённый другой программой.'
          : 'Не удалось прочитать макет из PDF: ' + (e && e.message))
        : 'Это не файл макета этикетки (.xplabel) или он повреждён.');
    });
  };

  Editor.prototype.newDoc = function () {
    if (this.doc.items.length && !confirm('Начать новый пустой макет? Текущий можно вернуть кнопкой «Отменить».')) return;
    this.undoStack.push(this.saved);
    this.redoStack = [];
    this.sel = null;
    this.restore(JSON.stringify({ label: this.doc.label, items: [] }));
    this.fileHandle = null;
    this.setFileName(null);
  };

  Editor.prototype.flash = function (msg) {
    var el = this.$fname, prev = this.fileName || '';
    el.textContent = msg + (prev ? ': ' + prev : '');
    el.classList.add('xpe-flash');
    clearTimeout(this.flashT);
    this.flashT = setTimeout(function () { el.textContent = prev; el.classList.remove('xpe-flash'); }, 1500);
  };

  /* ---------- масштаб холста ---------- */
  Editor.prototype.fit = function () {
    var L = this.cv(), st = this.$stage;
    var aw = Math.max(200, st.clientWidth - 48), ah = Math.max(150, st.clientHeight - 48);
    this.fitScale = Math.max(2, Math.min(aw / L.w, ah / L.h, 14));
    this.scale = this.fitScale * this.zoom;
    this.$svg.setAttribute('viewBox', '0 0 ' + L.w + ' ' + L.h);
    this.$svg.setAttribute('width', L.w * this.scale);
    this.$svg.setAttribute('height', L.h * this.scale);
    // 100% — реальный размер этикетки на экране (96 точек на дюйм)
    this.$zval.textContent = Math.round(this.scale / (96 / 25.4) * 100) + '%';
  };

  /* Масштаб: zoom — множитель к размеру «вписать в окно». ev — точка, которая должна остаться под курсором */
  Editor.prototype.setZoom = function (z, ev) {
    z = Math.min(8, Math.max(0.25, z));
    var st = this.$stage, r = st.getBoundingClientRect();
    var px = ev ? ev.clientX - r.left : st.clientWidth / 2, py = ev ? ev.clientY - r.top : st.clientHeight / 2;
    var old = this.toMm({ clientX: r.left + px, clientY: r.top + py });
    this.zoom = z;
    this.fit();
    this.render();
    var sr = this.$svg.getBoundingClientRect();
    st.scrollLeft += (sr.left + old[0] * this.scale) - (r.left + px);
    st.scrollTop += (sr.top + old[1] * this.scale) - (r.top + py);
  };

  /* ---------- отрисовка ---------- */
  Editor.prototype.render = function () {
    var svg = this.$svg, L = this.cv(), self = this;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svgEl('rect', { x: 0, y: 0, width: L.w, height: L.h, rx: 1, fill: '#fff', class: 'xpe-paper' }, svg);
    this.doc.items.forEach(function (it) { self.drawItem(svg, it); });
    this.drawOverlay(svg);
  };

  Editor.prototype.drawItem = function (svg, it) {
    // xpe-picked: выделенный элемент можно тащить пальцем (touch-action: none в CSS),
    // остальные на телефоне пропускают жест — страница прокручивается
    var picked = this.sel === it.id || this.multi.indexOf(it.id) >= 0;
    var g = svgEl('g', { 'data-id': it.id, class: picked ? 'xpe-item xpe-picked' : 'xpe-item' }, svg);
    var hit = function () { svgEl('rect', { x: it.x, y: it.y, width: it.w, height: it.h, fill: 'transparent' }, g); };
    if (it.type === 'text') {
      var lay = textLayout(it);
      it.h = lay.h;
      hit();
      var t = svgEl('text', {
        'font-family': cssFamily(it.font || 'Arimo'), 'font-size': lay.size, 'font-weight': it.bold ? 700 : 400,
        'text-anchor': it.align === 'center' ? 'middle' : it.align === 'right' ? 'end' : 'start', fill: '#000'
      }, g);
      lay.lines.forEach(function (ln, i) {
        var s = svgEl('tspan', { x: anchorX(it), y: baseline(it, lay, i) }, t);
        s.textContent = ln;
      });
    } else if (it.type === 'barcode') {
      hit();
      var enc = encodeBarcode(it.format, it.data);
      if (!enc) return this.drawError(g, it, 'Неверные данные');
      var gm = barcodeGeom(it, enc), d = '';
      enc.bars.forEach(function (b) {
        d += 'M' + r2(gm.x0 + b[0] * gm.mw) + ' ' + r2(it.y) + 'h' + r2(b[1] * gm.mw) + 'v' + r2(gm.barsH) + 'h' + r2(-b[1] * gm.mw) + 'z';
      });
      svgEl('path', { d: d, fill: '#000' }, g);
      if (it.showText) {
        var tt = svgEl('text', { x: it.x + it.w / 2, y: gm.textY, 'font-family': cssFamily(it.font || 'Arimo'),
          'font-size': gm.tsize, 'text-anchor': 'middle', fill: '#000' }, g);
        tt.textContent = enc.text;
      }
    } else if (it.type === 'qr') {
      hit();
      var qe = encodeQR(it.data);
      if (!qe) return this.drawError(g, it, 'Нет данных');
      var qg = qrGeom(it, qe), qd = '';
      qe.runs.forEach(function (r) {
        qd += 'M' + r2(qg.x0 + r[0] * qg.ms) + ' ' + r2(qg.y0 + r[1] * qg.ms) + 'h' + r2(r[2] * qg.ms) + 'v' + r2(qg.ms) + 'h' + r2(-r[2] * qg.ms) + 'z';
      });
      svgEl('path', { d: qd, fill: '#000' }, g);
    } else if (it.type === 'line') {
      hit();
      var lr = lineRect(it);
      svgEl('rect', { x: lr[0], y: lr[1], width: lr[2], height: lr[3], fill: '#000' }, g);
    } else if (it.type === 'rect') {
      var tk = it.thickness;
      svgEl('rect', { x: it.x + tk / 2, y: it.y + tk / 2, width: Math.max(0, it.w - tk), height: Math.max(0, it.h - tk),
        rx: it.radius || 0, fill: it.fill ? '#000' : 'transparent', stroke: '#000', 'stroke-width': tk }, g);
    } else if (it.type === 'image') {
      hit();
      svgEl('image', { x: it.x, y: it.y, width: it.w, height: it.h, href: it.src, preserveAspectRatio: 'xMidYMid meet' }, g);
    } else if (it.type === 'sign') {
      hit();
      var sg = SIGNS.get(it.key);
      if (!sg) return this.drawError(g, it, 'Нет знака');
      svgEl('image', { x: it.x, y: it.y, width: it.w, height: it.h, href: SIGNS.url(sg), preserveAspectRatio: 'xMidYMid meet' }, g);
    }
  };
  function lineRect(it) {
    var t = it.thickness;
    return it.orient === 'v' ? [it.x + it.w / 2 - t / 2, it.y, t, it.h] : [it.x, it.y + it.h / 2 - t / 2, it.w, t];
  }
  Editor.prototype.drawError = function (g, it, msg) {
    svgEl('rect', { x: it.x, y: it.y, width: it.w, height: it.h, fill: '#fde8e8', stroke: '#d33', 'stroke-width': 0.3, 'stroke-dasharray': '1 1' }, g);
    var t = svgEl('text', { x: it.x + it.w / 2, y: it.y + it.h / 2 + 1, 'font-size': 3, 'text-anchor': 'middle', fill: '#c00',
      'font-family': 'Arimo, Arial, sans-serif' }, g);
    t.textContent = msg;
  };

  function handlesFor(it) {
    if (it.type === 'text') return ['w', 'e'];
    if (it.type === 'line') return it.orient === 'v' ? ['n', 's'] : ['w', 'e'];
    if (it.type === 'qr') return ['nw', 'ne', 'se', 'sw'];
    return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  }
  function handlePos(it, k) {
    var x = k.indexOf('w') >= 0 ? it.x : k.indexOf('e') >= 0 ? it.x + it.w : it.x + it.w / 2;
    var y = k.indexOf('n') >= 0 ? it.y : k.indexOf('s') >= 0 ? it.y + it.h : it.y + it.h / 2;
    return [x, y];
  }

  Editor.prototype.drawOverlay = function (svg) {
    var s = this.scale, L = this.cv(), g = svgEl('g', { class: 'xpe-overlay' }, svg);
    this.drawGuides(g);
    var hov = this.hover && this.hover !== this.sel && this.multi.indexOf(this.hover) < 0 && this.item(this.hover);
    if (hov) svgEl('rect', { x: hov.x, y: hov.y, width: hov.w, height: hov.h, class: 'xpe-hoverbox' }, g);
    if (this.marquee) {
      var m = this.marquee;
      svgEl('rect', { x: m.x, y: m.y, width: m.w, height: m.h, class: 'xpe-marquee' }, g);
    }
    if (this.multi.length) return this.drawGroupOverlay(g);
    var it = this.sel && this.item(this.sel);
    if (!it) return;
    // рамка выделения: белая подложка + синяя линия — видна и на белом, и на чёрном
    var pad = 2 / s;
    var box = { x: it.x - pad, y: it.y - pad, width: it.w + 2 * pad, height: it.h + 2 * pad };
    svgEl('rect', Object.assign({ class: 'xpe-selfill' }, box), g);
    svgEl('rect', Object.assign({ class: 'xpe-selhalo' }, box), g);
    svgEl('rect', Object.assign({ class: 'xpe-selbox' }, box), g);
    var hs = 11 / s;
    handlesFor(it).forEach(function (k) {
      var p = handlePos(it, k);
      svgEl('rect', { x: p[0] - hs / 2, y: p[1] - hs / 2, width: hs, height: hs, rx: 2 / s, class: 'xpe-handle xpe-h-' + k,
        'data-handle': k }, g);
    });
  };

  /* Несколько выбранных: тонкая рамка у каждого и общая рамка с угловыми маркерами */
  Editor.prototype.drawGroupOverlay = function (g) {
    var s = this.scale, items = this.selItems(), pad = 2 / s;
    items.forEach(function (it) {
      svgEl('rect', { x: it.x, y: it.y, width: it.w, height: it.h, class: 'xpe-groupitem' }, g);
    });
    var b = boxOf(items), box = { x: b.x - pad, y: b.y - pad, width: b.w + 2 * pad, height: b.h + 2 * pad };
    svgEl('rect', Object.assign({ class: 'xpe-selfill' }, box), g);
    svgEl('rect', Object.assign({ class: 'xpe-selhalo' }, box), g);
    svgEl('rect', Object.assign({ class: 'xpe-selbox xpe-groupbox' }, box), g);
    var hs = 11 / s, gb = { x: box.x, y: box.y, w: box.width, h: box.height };
    ['nw', 'ne', 'se', 'sw'].forEach(function (k) {
      var p = handlePos(gb, k);
      svgEl('rect', { x: p[0] - hs / 2, y: p[1] - hs / 2, width: hs, height: hs, rx: 2 / s, class: 'xpe-handle xpe-h-' + k, 'data-handle': k }, g);
    });
  };

  /* Направляющие.
     К этикетке — розовая сплошная линия через всю этикетку и подпись «Центр/Край этикетки».
     К другому элементу — оранжевая пунктирная линия только между двумя элементами,
     элемент-цель обведён, подпись «Центр · Штрихкод». */
  Editor.prototype.drawGuides = function (g) {
    var self = this, s = this.scale, L = this.cv(), it = this.activeBox();
    var ext = 14 / s, gap = 6 / s;
    this.guides.forEach(function (gd) {
      var vert = gd.axis === 'x', a, cls = gd.kind === 'label' ? 'xpe-guide-label' : 'xpe-guide-item', text;
      if (gd.kind === 'label') {
        a = vert ? { x1: gd.at, y1: -ext, x2: gd.at, y2: L.h + ext } : { x1: -ext, y1: gd.at, x2: L.w + ext, y2: gd.at };
        text = (gd.what === 'center' ? 'Центр' : 'Край') + ' этикетки';
      } else {
        var o = gd.item;
        svgEl('rect', { x: o.x, y: o.y, width: o.w, height: o.h, class: 'xpe-guide-target' }, g);
        var lo = vert ? Math.min(o.y, it ? it.y : o.y) : Math.min(o.x, it ? it.x : o.x);
        var hi = vert ? Math.max(o.y + o.h, it ? it.y + it.h : 0) : Math.max(o.x + o.w, it ? it.x + it.w : 0);
        a = vert ? { x1: gd.at, y1: lo - gap, x2: gd.at, y2: hi + gap } : { x1: lo - gap, y1: gd.at, x2: hi + gap, y2: gd.at };
        text = (gd.what === 'center' ? 'Центр' : 'Край') + ' · ' + itemCaption(o);
      }
      svgEl('line', Object.assign({ class: 'xpe-guide-halo' }, a), g);
      svgEl('line', Object.assign({ class: 'xpe-guide ' + cls }, a), g);
      self.guideTag(g, gd, a, text, vert);
    });
  };

  /* Подпись направляющей — всегда внутри этикетки, чтобы не обрезалась краем окна.
     У этикетки: вертикальная — вверху, горизонтальная — слева над линией.
     У элемента: у дальнего конца отрезка (снизу или справа). */
  Editor.prototype.guideTag = function (g, gd, a, text, vert) {
    var s = this.scale, fs = 11 / s, padX = 5 / s, hgt = 17 / s, m = 3 / s, L = this.cv(), kind = gd.kind;
    var w = measure(text, fs, true, 'Arimo') + 2 * padX, tx, ty;
    if (kind === 'label') {
      tx = vert ? gd.at + m : m;
      ty = vert ? m : gd.at - hgt - m;
    } else {
      tx = vert ? gd.at - w / 2 : a.x2 + m;
      ty = vert ? a.y2 + m : gd.at - hgt / 2;
    }
    tx = Math.max(m, Math.min(tx, L.w - w - m));
    ty = Math.max(m, Math.min(ty, L.h - hgt - m));
    var t = svgEl('g', { class: 'xpe-tag xpe-tag-' + kind }, g);
    svgEl('rect', { x: tx, y: ty, width: w, height: hgt, rx: 3 / s }, t);
    var tt = svgEl('text', { x: tx + w / 2, y: ty + hgt / 2 + fs * 0.36, 'font-size': fs, 'text-anchor': 'middle',
      'font-family': 'Arimo, Arial, sans-serif', 'font-weight': 700 }, t);
    tt.textContent = text;
  };

  /* ---------- мышь и касания ---------- */
  Editor.prototype.toMm = function (ev) {
    var r = this.$svg.getBoundingClientRect();
    return [(ev.clientX - r.left) / this.scale, (ev.clientY - r.top) / this.scale];
  };

  function snapshotOf(items) {
    return items.map(function (it) {
      return { it: it, x: it.x, y: it.y, w: it.w, h: it.h, size: it.size, textSize: it.textSize };
    });
  }

  Editor.prototype.bindPointer = function () {
    var self = this, svg = this.$svg, stage = this.$stage, drag = null, tap = null;

    // события слушаем на всей области холста: рамку выделения можно начать и за краем этикетки
    stage.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      if (ev.target === stage && (ev.offsetX > stage.clientWidth || ev.offsetY > stage.clientHeight)) return; // полоса прокрутки
      var p = self.toMm(ev), handle = ev.target.getAttribute && ev.target.getAttribute('data-handle');
      var add = ev.shiftKey || ev.ctrlKey || ev.metaKey;
      var group = self.multi.length ? self.selItems() : null;
      var it = self.sel && self.item(self.sel);
      var g = ev.target.closest && ev.target.closest('.xpe-item');
      var hit = g && self.item(+g.getAttribute('data-id'));

      // Палец: тащим только выделенное и ручки. Касание по другому элементу или пустому
      // месту — это либо прокрутка страницы (браузер пришлёт pointercancel), либо тап,
      // который выделяет элемент или снимает выделение.
      var picked = hit && (self.sel === hit.id || self.multi.indexOf(hit.id) >= 0);
      if (ev.pointerType === 'touch' && !handle && !picked) {
        tap = { id: hit ? hit.id : null, x: ev.clientX, y: ev.clientY };
        return;
      }

      if (handle && group) {
        drag = { mode: 'gscale', handle: handle, start: p, box: boxOf(group), snapshot: snapshotOf(group) };
      } else if (handle && it) {
        drag = { mode: 'resize', handle: handle, it: it, start: p, box: { x: it.x, y: it.y, w: it.w, h: it.h } };
      } else if (hit && add) {
        // Shift/Ctrl+клик — добавить или убрать элемент из выделения
        var ids = self.selIds(), i = ids.indexOf(hit.id);
        if (i >= 0) ids.splice(i, 1); else ids.push(hit.id);
        self.setSelection(ids);
        return;
      } else if (hit && self.multi.indexOf(hit.id) >= 0) {
        drag = { mode: 'gmove', start: p, box: boxOf(group), snapshot: snapshotOf(group) };
      } else if (hit) {
        if (self.sel !== hit.id || self.multi.length) self.select(hit.id);
        drag = { mode: 'move', it: hit, start: p, box: { x: hit.x, y: hit.y, w: hit.w, h: hit.h } };
      } else {
        // пустое место — рамка выделения (с Shift/Ctrl — добавить к текущему)
        drag = { mode: 'marquee', start: p, base: add ? self.selIds() : [] };
        self.marquee = { x: p[0], y: p[1], w: 0, h: 0 };
        if (!add) { self.sel = null; self.multi = []; self.renderProps(); }
      }
      stage.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });

    stage.addEventListener('pointermove', function (ev) {
      if (!drag) {
        // подсветка элемента под курсором
        var g = ev.pointerType === 'mouse' && ev.target.closest && ev.target.closest('.xpe-item');
        var id = g ? +g.getAttribute('data-id') : null;
        if (id !== self.hover) { self.hover = id; self.render(); }
        return;
      }
      var p = self.toMm(ev), dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
      if (drag.mode === 'marquee') {
        self.marquee = { x: Math.min(p[0], drag.start[0]), y: Math.min(p[1], drag.start[1]), w: Math.abs(dx), h: Math.abs(dy) };
        self.render();
        return;
      }
      if (drag.mode === 'move') self.moveTo(drag.it, drag.box.x + dx, drag.box.y + dy, !ev.altKey);
      else if (drag.mode === 'gmove') self.moveGroup(drag.snapshot, drag.box, dx, dy, !ev.altKey);
      else if (drag.mode === 'gscale') self.scaleGroup(drag, dx, dy);
      else self.resize(drag, dx, dy, ev.shiftKey);
      self.render();
      self.updateGeomInputs();
    });

    var end = function (ev) {
      if (tap) {
        var t = tap;
        tap = null;
        // тап без сдвига пальца (прокрутку браузер завершает pointercancel)
        if (ev.type === 'pointerup' && Math.abs(ev.clientX - t.x) + Math.abs(ev.clientY - t.y) < 12) {
          if (t.id) self.select(t.id);
          else if (self.sel || self.multi.length) { self.sel = null; self.multi = []; self.render(); self.renderProps(); }
        }
        return;
      }
      if (!drag) return;
      var d = drag;
      drag = null;
      self.guides = [];
      if (d.mode === 'marquee') {
        var m = self.marquee;
        self.marquee = null;
        // выделяются элементы, которые рамка задевает
        var hits = m.w + m.h < 0.6 ? [] : self.doc.items.filter(function (o) {
          return o.x < m.x + m.w && o.x + o.w > m.x && o.y < m.y + m.h && o.y + o.h > m.y;
        }).map(function (o) { return o.id; });
        self.setSelection(d.base.concat(hits));
        return;
      }
      self.render();
      self.renderProps();
      self.commit();
    };
    // Выделенный элемент и ручки двигаются пальцем: отменяем прокрутку страницы для этого
    // касания (touch-action внутри SVG браузеры учитывают по-разному, а это работает везде)
    stage.addEventListener('touchstart', function (ev) {
      var t = ev.target;
      if (t.closest && (t.closest('.xpe-picked') || (t.getAttribute && t.getAttribute('data-handle')))) ev.preventDefault();
    }, { passive: false });
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    svg.addEventListener('pointerleave', function () {
      if (!drag && self.hover) { self.hover = null; self.render(); }
    });
    svg.addEventListener('dblclick', function () {
      var f = self.$props.querySelector('[data-k="text"], [data-k="data"]');
      if (f) { f.focus(); f.select(); }
    });
  };

  Editor.prototype.select = function (id) {
    this.sel = id;
    this.multi = [];
    this.render();
    this.renderProps();
  };

  /* Выделение: один элемент — this.sel, несколько — this.multi */
  Editor.prototype.selIds = function () {
    return this.multi.length ? this.multi.slice() : this.sel ? [this.sel] : [];
  };
  Editor.prototype.selItems = function () {
    var self = this;
    return this.selIds().map(function (id) { return self.item(id); }).filter(Boolean);
  };
  Editor.prototype.setSelection = function (ids) {
    var self = this, seen = {};
    // порядок — как в макете, без повторов
    ids = this.doc.items.filter(function (o) { return ids.indexOf(o.id) >= 0 && !seen[o.id] && (seen[o.id] = 1); })
      .map(function (o) { return o.id; });
    this.sel = ids.length === 1 ? ids[0] : null;
    this.multi = ids.length > 1 ? ids : [];
    this.render();
    this.renderProps();
  };
  function boxOf(items) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    items.forEach(function (o) {
      x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y); x1 = Math.max(x1, o.x + o.w); y1 = Math.max(y1, o.y + o.h);
    });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  /* Рамка, которую сейчас двигают: один элемент или вся группа */
  Editor.prototype.activeBox = function () {
    var items = this.selItems();
    return items.length ? boxOf(items) : null;
  };

  /* Перемещение с прилипанием к краям/центру этикетки и других элементов */
  /* Цели прилипания по оси: края и центр этикетки (kind: 'label') и других элементов (kind: 'item') */
  function snapTargets(L, items, it, axis) {
    var size = axis === 'x' ? L.w : L.h, out = [
      { v: 0, kind: 'label', what: 'edge' }, { v: size / 2, kind: 'label', what: 'center' }, { v: size, kind: 'label', what: 'edge' }
    ];
    items.forEach(function (o) {
      if (o === it) return;
      var a = axis === 'x' ? o.x : o.y, s = axis === 'x' ? o.w : o.h;  // it === null — цели уже отфильтрованы
      out.push({ v: a, kind: 'item', what: 'edge', item: o },
        { v: a + s / 2, kind: 'item', what: 'center', item: o },
        { v: a + s, kind: 'item', what: 'edge', item: o });
    });
    return out;
  }
  /* Прилипание рамки (x, y, w, h) к этикетке и элементам, кроме exclude. Возвращает сдвиг [dx, dy] */
  Editor.prototype.snapBox = function (x, y, w, h, exclude) {
    var L = this.cv(), th = SNAP_PX / this.scale, others = this.doc.items.filter(function (o) { return exclude.indexOf(o) < 0; });
    var dx = 0, dy = 0;
    var sx = snapAxis([x, x + w / 2, x + w], snapTargets(L, others, null, 'x'), th);
    if (sx) { dx = sx.d; this.guides.push({ axis: 'x', at: sx.t.v, kind: sx.t.kind, what: sx.t.what, item: sx.t.item }); }
    var sy = snapAxis([y, y + h / 2, y + h], snapTargets(L, others, null, 'y'), th);
    if (sy) { dy = sy.d; this.guides.push({ axis: 'y', at: sy.t.v, kind: sy.t.kind, what: sy.t.what, item: sy.t.item }); }
    return [dx, dy];
  };
  Editor.prototype.moveTo = function (it, x, y, snap) {
    this.guides = [];
    if (snap) { var d = this.snapBox(x, y, it.w, it.h, [it]); x += d[0]; y += d[1]; }
    it.x = r2(x);
    it.y = r2(y);
  };
  /* Перемещение группы: snap — исходные координаты элементов, сдвиг (dx, dy) */
  Editor.prototype.moveGroup = function (snapshot, box0, dx, dy, snap) {
    this.guides = [];
    var items = snapshot.map(function (s) { return s.it; });
    if (snap) { var d = this.snapBox(box0.x + dx, box0.y + dy, box0.w, box0.h, items); dx += d[0]; dy += d[1]; }
    snapshot.forEach(function (s) { s.it.x = r2(s.x + dx); s.it.y = r2(s.y + dy); });
  };
  /* Пропорциональное масштабирование группы за угол рамки; шрифты масштабируются вместе с элементами */
  Editor.prototype.scaleGroup = function (drag, dx, dy) {
    var b = drag.box, k = drag.handle;
    var ax = k.indexOf('w') >= 0 ? b.x + b.w : b.x, ay = k.indexOf('n') >= 0 ? b.y + b.h : b.y;
    var sw = (k.indexOf('w') >= 0 ? b.w - dx : b.w + dx) / b.w, sh = (k.indexOf('n') >= 0 ? b.h - dy : b.h + dy) / b.h;
    var f = Math.max(sw, sh, 2 / Math.max(b.w, b.h));
    drag.snapshot.forEach(function (s) {
      var it = s.it;
      it.x = r2(ax + (s.x - ax) * f);
      it.y = r2(ay + (s.y - ay) * f);
      it.w = r2(Math.max(1, s.w * f));
      if (it.type !== 'text') it.h = r2(Math.max(1, s.h * f));
      if (it.type === 'text') it.size = Math.max(4, Math.round(s.size * f * 2) / 2);
      if (it.type === 'barcode') it.textSize = Math.max(4, Math.round(s.textSize * f * 2) / 2);
    });
  };
  /* Ближайшая цель; при равном расстоянии этикетка важнее другого элемента */
  function snapAxis(mine, targets, th) {
    var best = null;
    mine.forEach(function (m) {
      targets.forEach(function (t) {
        var d = t.v - m, ad = Math.abs(d);
        if (ad > th) return;
        if (!best || ad < Math.abs(best.d) - 0.01 ||
          (Math.abs(ad - Math.abs(best.d)) <= 0.01 && t.kind === 'label' && best.t.kind !== 'label')) best = { d: d, t: t };
      });
    });
    return best;
  }
  function itemCaption(o) {
    if (o.type === 'text') {
      var t = String(o.text).split('\n')[0].trim();
      return 'Текст «' + (t.length > 14 ? t.slice(0, 14) + '…' : t) + '»';
    }
    if (o.type === 'sign') { var sg = SIGNS.get(o.key); if (sg) return sg.name.split(' — ')[0]; }
    return NAMES[o.type];
  }

  Editor.prototype.resize = function (drag, dx, dy, keep) {
    var it = drag.it, b = drag.box, k = drag.handle, MIN = 1;
    var x = b.x, y = b.y, w = b.w, hh = b.h;
    if (k.indexOf('e') >= 0) w = b.w + dx;
    if (k.indexOf('w') >= 0) { w = b.w - dx; x = b.x + dx; }
    if (k.indexOf('s') >= 0) hh = b.h + dy;
    if (k.indexOf('n') >= 0) { hh = b.h - dy; y = b.y + dy; }
    if (it.type === 'qr' || (keep || it.type === 'image' || it.type === 'sign') && k.length === 2) {
      var ratio = it.type === 'qr' ? 1 : b.h / b.w, size = Math.max(w, hh / ratio);
      w = size; hh = size * ratio;
      if (k.indexOf('w') >= 0) x = b.x + b.w - w;
      if (k.indexOf('n') >= 0) y = b.y + b.h - hh;
    }
    if (w < MIN) { if (k.indexOf('w') >= 0) x -= MIN - w; w = MIN; }
    if (hh < MIN) { if (k.indexOf('n') >= 0) y -= MIN - hh; hh = MIN; }
    it.x = r2(x); it.y = r2(y); it.w = r2(w);
    if (it.type !== 'text') it.h = r2(hh);
  };

  /* ---------- клавиатура ---------- */
  Editor.prototype.onKey = function (ev) {
    if (!document.body.contains(this.root)) {
      document.removeEventListener('keydown', this.onKey);
      window.removeEventListener('resize', this.onResize);
      return;
    }
    var mod = ev.ctrlKey || ev.metaKey, k = ev.key;
    if (mod && (k === 'p' || k === 'з')) { ev.preventDefault(); this.exportPDF('print'); return; }
    if (mod && (k === 's' || k === 'ы')) { ev.preventDefault(); this.saveFile(); return; }
    if (mod && (k === 'o' || k === 'щ')) { ev.preventDefault(); this.openFile(); return; }
    if (mod && (k === '=' || k === '+')) { ev.preventDefault(); this.setZoom(this.zoom * 1.25); return; }
    if (mod && k === '-') { ev.preventDefault(); this.setZoom(this.zoom / 1.25); return; }
    if (mod && k === '0') { ev.preventDefault(); this.setZoom(1); return; }
    var tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (mod && (k === 'z' || k === 'я')) { ev.preventDefault(); ev.shiftKey ? this.redo() : this.undo(); return; }
    if (mod && (k === 'y' || k === 'н')) { ev.preventDefault(); this.redo(); return; }
    if (mod && (k === 'a' || k === 'ф')) {
      ev.preventDefault();
      this.setSelection(this.doc.items.map(function (o) { return o.id; }));
      return;
    }
    if (k === 'Escape' && (this.sel || this.multi.length)) { this.setSelection([]); return; }
    if (this.multi.length) return this.onGroupKey(ev, mod, k);
    var it = this.sel && this.item(this.sel);
    if (!it) return;
    if (mod && (k === 'd' || k === 'в')) { ev.preventDefault(); this.duplicate(it); return; }
    if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); this.remove(it); return; }
    var step = ev.shiftKey ? 2 : 0.5, moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[k]) {
      ev.preventDefault();
      it.x = r2(it.x + moves[k][0]);
      it.y = r2(it.y + moves[k][1]);
      this.render();
      this.updateGeomInputs();
      this.commit();
    }
  };

  Editor.prototype.onGroupKey = function (ev, mod, k) {
    var items = this.selItems();
    if (mod && (k === 'd' || k === 'в')) { ev.preventDefault(); this.duplicateGroup(); return; }
    if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); this.removeGroup(); return; }
    var step = ev.shiftKey ? 2 : 0.5, moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[k]) {
      ev.preventDefault();
      items.forEach(function (it) { it.x = r2(it.x + moves[k][0]); it.y = r2(it.y + moves[k][1]); });
      this.render();
      this.commit();
    }
  };
  Editor.prototype.duplicateGroup = function () {
    var self = this, ids = [];
    this.selItems().forEach(function (it) {
      var c = clone(it);
      c.x = r2(c.x + 2); c.y = r2(c.y + 2); c.id = self.nextId++;
      self.doc.items.push(c);
      ids.push(c.id);
    });
    this.setSelection(ids);
    this.commit();
  };
  Editor.prototype.removeGroup = function () {
    var ids = this.selIds();
    this.doc.items = this.doc.items.filter(function (o) { return ids.indexOf(o.id) < 0; });
    this.setSelection([]);
    this.commit();
  };
  /* Выравнивание группы: друг относительно друга или по этикетке */
  Editor.prototype.alignGroup = function (a) {
    var items = this.selItems(), b = boxOf(items), L = this.cv();
    items.forEach(function (it) {
      if (a === 'left') it.x = b.x;
      if (a === 'right') it.x = b.x + b.w - it.w;
      if (a === 'hcenter') it.x = b.x + (b.w - it.w) / 2;
      if (a === 'top') it.y = b.y;
      if (a === 'bottom') it.y = b.y + b.h - it.h;
      if (a === 'vcenter') it.y = b.y + (b.h - it.h) / 2;
      if (a === 'cx') it.x += (L.w - b.w) / 2 - b.x;
      if (a === 'cy') it.y += (L.h - b.h) / 2 - b.y;
      it.x = r2(it.x); it.y = r2(it.y);
    });
    this.render();
    this.commit();
  };

  Editor.prototype.duplicate = function (it) {
    var c = clone(it);
    c.x = r2(c.x + 2); c.y = r2(c.y + 2);
    this.addItem(c);
  };
  Editor.prototype.remove = function (it) {
    this.doc.items = this.doc.items.filter(function (o) { return o !== it; });
    this.sel = null;
    this.multi = [];
    this.render();
    this.renderProps();
    this.commit();
  };

  /* ---------- панель свойств ---------- */
  var NAMES = { text: 'Текст', barcode: 'Штрихкод', qr: 'QR-код', line: 'Линия', rect: 'Рамка', image: 'Картинка', sign: 'Знак' };

  function num(k, label, v, step, attrs) {
    return '<label class="xpe-f"><span>' + label + '</span><input type="number" data-k="' + k + '" value="' + r2(v) +
      '" step="' + (step || 0.5) + '"' + (attrs || '') + '></label>';
  }
  function check(k, label, v) {
    return '<label class="xpe-f xpe-check"><input type="checkbox" data-k="' + k + '"' + (v ? ' checked' : '') + '> ' + label + '</label>';
  }
  function select(k, label, v, opts) {
    return '<label class="xpe-f"><span>' + label + '</span><select data-k="' + k + '">' + opts.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('') + '</select></label>';
  }

  Editor.prototype.renderProps = function () {
    var self = this, it = this.sel && this.item(this.sel), P = this.$props;
    if (this.multi.length) return this.renderGroupProps();
    if (!it) {
      P.innerHTML = '<div class="xpe-empty"><b>Ничего не выбрано</b><p>Добавьте элемент кнопками «Текст», «Штрихкод», «QR-код»… или нажмите на элемент на этикетке.</p>' +
        '<p class="xpe-keys">Перетаскивайте мышью, тяните за квадратики по краям.<br>Стрелки — сдвиг на 0,5 мм (с Shift — 2 мм).<br>' +
        'Alt при перетаскивании — без прилипания.<br>Delete — удалить, Ctrl+D — копия, Ctrl+Z — отменить.<br>' +
        'Несколько элементов: рамкой по пустому месту, Shift+клик или Ctrl+A.</p></div>';
      return;
    }
    var f = '<div class="xpe-ptitle">' + NAMES[it.type] + '</div>';
    if (it.type === 'text') {
      f += '<label class="xpe-f xpe-wide"><span>Текст</span><textarea data-k="text" rows="3">' + esc(it.text) + '</textarea></label>';
      f += this.fontSelect(it.font || 'Arimo');
      f += num('size', 'Размер, pt', it.size, 0.5, ' min="4" max="72"');
      f += select('align', 'Выравнивание', it.align, [['left', 'По левому краю'], ['center', 'По центру'], ['right', 'По правому краю']]);
      f += check('bold', 'Жирный', it.bold);
    } else if (it.type === 'barcode') {
      f += select('format', 'Тип', it.format, [['CODE128', 'Code 128 (буквы и цифры)'], ['EAN13', 'EAN-13 (13 цифр)']]);
      f += '<label class="xpe-f xpe-wide"><span>Данные</span><input type="text" data-k="data" value="' + esc(it.data) + '"></label>';
      var enc = encodeBarcode(it.format, it.data);
      if (!enc) f += '<div class="xpe-warn">' + (it.format === 'EAN13' ? 'EAN-13: нужно 12 или 13 цифр с верной контрольной цифрой.' : 'Code 128: латиница, цифры и знаки.') + '</div>';
      else {
        var gm = barcodeGeom(it, enc);
        if (gm.tooNarrow || gm.overflow) f += '<div class="xpe-warn">Штрихкод слишком узкий для такой длины данных — расширьте его, иначе сканер не прочитает.</div>';
        if (it.format === 'EAN13' && it.data.length === 12) f += '<div class="xpe-note">Контрольная цифра: ' + enc.text[12] + '</div>';
      }
      f += check('showText', 'Цифры под штрихкодом', it.showText);
      if (it.showText) {
        f += this.fontSelect(it.font || 'Arimo');
        f += num('textSize', 'Размер цифр, pt', it.textSize, 0.5, ' min="4" max="24"');
      }
    } else if (it.type === 'qr') {
      f += '<label class="xpe-f xpe-wide"><span>Данные (текст или ссылка)</span><textarea data-k="data" rows="3">' + esc(it.data) + '</textarea></label>';
    } else if (it.type === 'line') {
      f += select('orient', 'Направление', it.orient, [['h', 'Горизонтальная'], ['v', 'Вертикальная']]);
      f += num('thickness', 'Толщина, мм', it.thickness, 0.1, ' min="0.1" max="5"');
    } else if (it.type === 'rect') {
      f += num('thickness', 'Толщина, мм', it.thickness, 0.1, ' min="0.1" max="5"');
      f += num('radius', 'Скругление, мм', it.radius, 0.5, ' min="0" max="20"');
      f += check('fill', 'Залить чёрным', it.fill);
    } else if (it.type === 'sign') {
      var sgn = SIGNS.get(it.key);
      f += '<div class="xpe-signcur">' + (sgn ? SIGNS.img(sgn) + '<span>' + esc(sgn.name) + '</span>' : '') + '</div>';
      f += '<button type="button" class="xpe-btn xpe-resign">Выбрать другой знак</button>';
    } else if (it.type === 'image') {
      f += '<button type="button" class="xpe-btn xpe-replace">Заменить картинку</button>';
      f += '<div class="xpe-note">Лучше всего печатаются чёрные PNG на прозрачном фоне.</div>';
    }
    f += '<div class="xpe-grid">' + num('x', 'X, мм', it.x) + num('y', 'Y, мм', it.y) + num('w', 'Ширина', it.w, 0.5, ' min="1"') +
      num('h', 'Высота', it.h, 0.5, ' min="1"' + (it.type === 'text' ? ' disabled' : '')) + '</div>';
    f += '<div class="xpe-actions">' +
      '<button type="button" class="xpe-btn" data-act="cx" title="По центру по горизонтали">↔ Центр</button>' +
      '<button type="button" class="xpe-btn" data-act="cy" title="По центру по вертикали">↕ Центр</button>' +
      '<button type="button" class="xpe-btn" data-act="up" title="Выше других">Вперёд</button>' +
      '<button type="button" class="xpe-btn" data-act="down" title="Ниже других">Назад</button>' +
      '<button type="button" class="xpe-btn" data-act="dup">Копия</button>' +
      '<button type="button" class="xpe-btn xpe-danger" data-act="del">Удалить</button></div>';
    P.innerHTML = f;

    var localBtn = P.querySelector('.xpe-local');
    if (localBtn) localBtn.addEventListener('click', function () {
      queryLocal().then(function () {
        self.renderProps();
        var sel = self.$props.querySelector('.xpe-font');
        if (sel) sel.focus();
      }).catch(function () {
        alert('Браузер не дал доступ к шрифтам компьютера. Разрешите доступ в настройках сайта (значок замка в адресной строке) и попробуйте снова.');
      });
    });

    P.querySelectorAll('[data-k]').forEach(function (inp) {
      var k = inp.getAttribute('data-k');
      if (k === 'font') {
        inp.addEventListener('change', function () { self.setFont(it, inp.value); });
        return;
      }
      var apply = function () {
        var v = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? parseFloat(inp.value) : inp.value;
        if (inp.type === 'number' && isNaN(v)) return;
        if (k === 'h' && it.type === 'qr') it.w = v;
        if (k === 'w' && it.type === 'qr') it.h = v;
        if ((it.type === 'image' && it.nw || it.type === 'sign') && (k === 'w' || k === 'h')) {
          var ratio = it.type === 'sign' ? SIGNS.ratio(SIGNS.get(it.key)) : it.nh / it.nw;
          if (k === 'w') it.h = r2(v * ratio); else it.w = r2(v / ratio);
        }
        if (k === 'orient' && v !== it.orient) { var t = it.w; it.w = it.h; it.h = t; }
        it[k] = v;
        self.render();
        if (inp.tagName !== 'TEXTAREA' && inp.type === 'text') self.refreshWarnings();
      };
      inp.addEventListener('input', apply);
      inp.addEventListener('change', function () {
        apply();
        if (inp.type === 'checkbox' || inp.tagName === 'SELECT' || k === 'data') self.renderProps();
        else self.updateGeomInputs();
        self.commit();
      });
    });
    P.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () { self.action(it, b.getAttribute('data-act')); });
    });
    var resign = P.querySelector('.xpe-resign');
    if (resign) resign.addEventListener('click', function () { self.openSigns(it); });
    var rep = P.querySelector('.xpe-replace');
    if (rep) rep.addEventListener('click', function () {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/svg+xml';
      inp.onchange = function () { if (inp.files[0]) self.readImage(inp.files[0], it); };
      inp.click();
    });
  };

  Editor.prototype.renderGroupProps = function () {
    var self = this, P = this.$props, n = this.multi.length;
    var al = function (a, title, d) {
      return '<button type="button" class="xpe-btn xpe-ico-btn" data-align="' + a + '" title="' + title + '" aria-label="' + title + '">' +
        '<svg class="xpe-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="' + d + '"/></svg></button>';
    };
    P.innerHTML = '<div class="xpe-ptitle">Выбрано элементов: ' + n + '</div>' +
      '<div class="xpe-f"><span>Выровнять между собой</span><div class="xpe-aligns">' +
        al('left', 'По левому краю', 'M4 3v18M8 7h12M8 17h7') +
        al('hcenter', 'По центру', 'M12 3v18M6 7h12M8 17h8') +
        al('right', 'По правому краю', 'M20 3v18M4 7h12M9 17h7') +
        al('top', 'По верху', 'M3 4h18M7 8v12M17 8v7') +
        al('vcenter', 'По середине', 'M3 12h18M7 6v12M17 8v8') +
        al('bottom', 'По низу', 'M3 20h18M7 4v12M17 9v7') +
      '</div></div>' +
      '<div class="xpe-actions">' +
        '<button type="button" class="xpe-btn" data-align="cx" title="Группу по центру этикетки по горизонтали">↔ Центр</button>' +
        '<button type="button" class="xpe-btn" data-align="cy" title="Группу по центру этикетки по вертикали">↕ Центр</button>' +
        '<button type="button" class="xpe-btn" data-gact="dup">Копия</button>' +
        '<button type="button" class="xpe-btn xpe-danger" data-gact="del">Удалить</button>' +
      '</div>' +
      '<p class="xpe-keys">Тяните за любой выбранный элемент — двигается вся группа.<br>' +
      'Уголки общей рамки — пропорционально меняют размер, вместе со шрифтом.<br>' +
      'Shift+клик — добавить или убрать элемент, Esc — снять выделение.</p>';
    P.querySelectorAll('[data-align]').forEach(function (b) {
      b.addEventListener('click', function () { self.alignGroup(b.getAttribute('data-align')); });
    });
    P.querySelector('[data-gact=dup]').addEventListener('click', function () { self.duplicateGroup(); });
    P.querySelector('[data-gact=del]').addEventListener('click', function () { self.removeGroup(); });
  };

  Editor.prototype.fontSelect = function (cur) {
    var o = '<optgroup label="Встроенные">' + BUILTIN.map(function (b) {
      return '<option value="' + esc(b.family) + '"' + (b.family === cur ? ' selected' : '') + '>' + esc(b.label) + '</option>';
    }).join('') + '</optgroup>';
    var fams = localFonts ? Object.keys(localFonts).sort(function (a, b) { return a.localeCompare(b); }) : [];
    if (!builtin(cur) && fams.indexOf(cur) < 0) fams.unshift(cur);   // шрифт из сохранённого макета
    if (fams.length) {
      o += '<optgroup label="На этом компьютере">' + fams.map(function (f) {
        var bad = localOk[f] === false;
        return '<option value="' + esc(f) + '"' + (f === cur ? ' selected' : '') + (bad ? ' disabled' : '') + '>' +
          esc(f) + (bad ? ' (не встраивается в PDF)' : '') + '</option>';
      }).join('') + '</optgroup>';
    }
    var h = '<label class="xpe-f"><span>Шрифт</span><select data-k="font" class="xpe-font">' + o + '</select></label>';
    if (canLocal && !localFonts) h += '<button type="button" class="xpe-btn xpe-local">Шрифты с компьютера…</button>';
    else if (!canLocal) h += '<div class="xpe-note">Шрифты, установленные на компьютере, доступны в Chrome и Edge.</div>';
    return h;
  };

  /* Выбор шрифта: встроенный — сразу; с компьютера — сначала проверяем, что его можно встроить в PDF */
  Editor.prototype.setFont = function (it, family) {
    var self = this, prev = it.font || 'Arimo';
    var apply = function () {
      it.font = family;
      lastFont = family;
      ensureFont(family).then(function () { self.render(); self.renderProps(); self.commit(); });
    };
    if (builtin(family) || !localFonts || !localFonts[family]) return apply();
    if (localOk[family]) return apply();
    ttfBytes(localFonts[family].regular).then(function () {
      localOk[family] = true;
      apply();
    }).catch(function () {
      localOk[family] = false;
      it.font = prev;
      self.renderProps();
      alert('Шрифт «' + family + '» нельзя встроить в PDF: это шрифт формата OpenType (CFF) или коллекция шрифтов. Выберите другой.');
    });
  };

  Editor.prototype.refreshWarnings = function () {
    // штрихкод: обновить подсказки, не сбивая фокус в поле ввода
    var it = this.sel && this.item(this.sel);
    if (!it || it.type !== 'barcode') return;
    var enc = encodeBarcode(it.format, it.data), box = this.$props.querySelector('.xpe-warn');
    var bad = !enc;
    if (bad && !box) {
      box = document.createElement('div');
      box.className = 'xpe-warn';
      this.$props.querySelector('[data-k="data"]').closest('label').after(box);
    }
    if (box) {
      if (bad) box.textContent = it.format === 'EAN13' ? 'EAN-13: нужно 12 или 13 цифр с верной контрольной цифрой.' : 'Code 128: латиница, цифры и знаки.';
      else box.remove();
    }
  };

  Editor.prototype.updateGeomInputs = function () {
    var it = this.sel && this.item(this.sel);
    if (!it) return;
    ['x', 'y', 'w', 'h'].forEach(function (k) {
      var inp = this.$props.querySelector('[data-k="' + k + '"]');
      if (inp && document.activeElement !== inp) inp.value = r2(it[k]);
    }, this);
  };

  Editor.prototype.action = function (it, a) {
    var L = this.cv(), items = this.doc.items, i = items.indexOf(it);
    if (a === 'cx') it.x = r2((L.w - it.w) / 2);
    else if (a === 'cy') it.y = r2((L.h - it.h) / 2);
    else if (a === 'up' && i < items.length - 1) { items.splice(i, 1); items.splice(i + 1, 0, it); }
    else if (a === 'down' && i > 0) { items.splice(i, 1); items.splice(i - 1, 0, it); }
    else if (a === 'dup') return this.duplicate(it);
    else if (a === 'del') return this.remove(it);
    this.render();
    this.updateGeomInputs();
    this.commit();
  };

  /* ---------- PDF ---------- */
  var fontCache = {};   // 'семейство|жирный' -> base64 файла шрифта
  function toB64(buf) {
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fontKey(family, bold) { return family + '|' + (bold ? 1 : 0); }

  Editor.prototype.fontB64 = function (family, bold) {
    var key = fontKey(family, bold), base = this.base, b = builtin(family), p;
    if (fontCache[key]) return Promise.resolve(fontCache[key]);
    if (b) {
      p = fetch(base + 'fonts/' + b.file + (bold ? '-Bold' : '-Regular') + '.ttf').then(function (r) {
        if (!r.ok) throw new Error('font');
        return r.arrayBuffer();
      });
    } else {
      p = queryLocal().then(function (map) {
        var e = map[family];
        if (!e) throw new Error('missing');
        return ttfBytes(bold && e.bold ? e.bold : e.regular);
      });
    }
    return p.then(toB64).then(function (v) { fontCache[key] = v; return v; });
  };

  /* Шрифты макета для PDF. Недоступный шрифт заменяется на Arimo, имя попадает в missing */
  Editor.prototype.loadFonts = function () {
    var self = this, need = {};
    need[fontKey('Arimo', false)] = ['Arimo', false];
    need[fontKey('Arimo', true)] = ['Arimo', true];
    this.doc.items.forEach(function (it) {
      if (it.type === 'text') need[fontKey(it.font || 'Arimo', it.bold)] = [it.font || 'Arimo', it.bold];
      if (it.type === 'barcode' && it.showText) need[fontKey(it.font || 'Arimo', false)] = [it.font || 'Arimo', false];
    });
    var keys = Object.keys(need), missing = [];
    return Promise.all(keys.map(function (k) {
      return self.fontB64(need[k][0], need[k][1]).catch(function (e) {
        if (builtin(need[k][0])) throw e;
        if (missing.indexOf(need[k][0]) < 0) missing.push(need[k][0]);
        return null;
      });
    })).then(function (list) {
      var files = {};
      keys.forEach(function (k, i) { if (list[i]) files[k] = list[i]; });
      return { files: files, missing: missing };
    });
  };

  Editor.prototype.buildPDF = function (fonts, rotImages) {
    var L = this.doc.label, ids = {}, n = 0, rot = !!L.rot;
    var pdf = new window.jspdf.jsPDF({ unit: 'mm', format: [L.w, L.h], orientation: L.w > L.h ? 'landscape' : 'portrait', compress: true });
    embedLayout(pdf, this.serialize());
    Object.keys(fonts.files).forEach(function (k) {
      var id = 'F' + (n++);
      pdf.addFileToVFS(id + '.ttf', fonts.files[k]);
      pdf.addFont(id + '.ttf', id, 'normal');
      ids[k] = id;
    });
    var fontId = function (family, bold) {
      return ids[fontKey(family, bold)] || ids[fontKey('Arimo', bold)];
    };
    pdf.setFillColor(0, 0, 0);
    pdf.setDrawColor(0, 0, 0);
    pdf.setTextColor(0, 0, 0);

    // холст (x, y) -> страница: поворот на 90° по часовой стрелке
    var R = function (x, y, w, h) { return rot ? [L.w - (y + h), x, h, w] : [x, y, w, h]; };
    var rect = function (x, y, w, h, style) { var r = R(x, y, w, h); pdf.rect(r[0], r[1], r[2], r[3], style); };
    var rrect = function (x, y, w, h, rad, style) { var r = R(x, y, w, h); pdf.roundedRect(r[0], r[1], r[2], r[3], rad, rad, style); };
    var text = function (str, x, y, align) {   // y — базовая линия
      var tw = pdf.getTextWidth(str), x0 = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
      if (rot) pdf.text(str, L.w - y, x0, { angle: -90, baseline: 'alphabetic' });
      else pdf.text(str, x0, y, { baseline: 'alphabetic' });
    };

    this.doc.items.forEach(function (it) {
      if (it.type === 'text') {
        var lay = textLayout(it);
        pdf.setFont(fontId(it.font || 'Arimo', it.bold), 'normal');
        pdf.setFontSize(it.size);
        lay.lines.forEach(function (ln, i) {
          text(ln, anchorX(it), baseline(it, lay, i), it.align);
        });
      } else if (it.type === 'barcode') {
        var enc = encodeBarcode(it.format, it.data);
        if (!enc) return;
        var gm = barcodeGeom(it, enc);
        enc.bars.forEach(function (b) { rect(gm.x0 + b[0] * gm.mw, it.y, b[1] * gm.mw, gm.barsH, 'F'); });
        if (it.showText) {
          pdf.setFont(fontId(it.font || 'Arimo', false), 'normal');
          pdf.setFontSize(it.textSize);
          text(enc.text, it.x + it.w / 2, gm.textY, 'center');
        }
      } else if (it.type === 'qr') {
        var qe = encodeQR(it.data);
        if (!qe) return;
        var qg = qrGeom(it, qe);
        qe.runs.forEach(function (r) { rect(qg.x0 + r[0] * qg.ms, qg.y0 + r[1] * qg.ms, r[2] * qg.ms, qg.ms, 'F'); });
      } else if (it.type === 'line') {
        var lr = lineRect(it);
        rect(lr[0], lr[1], lr[2], lr[3], 'F');
      } else if (it.type === 'rect') {
        var t = it.thickness, x = it.x + t / 2, y = it.y + t / 2, w = Math.max(0, it.w - t), hh = Math.max(0, it.h - t);
        pdf.setLineWidth(t);
        var style = it.fill ? 'FD' : 'S';
        if (it.radius > 0) rrect(x, y, w, hh, it.radius, style);
        else rect(x, y, w, hh, style);
      } else if (it.type === 'image' || it.type === 'sign') {
        var iw = it.w, ih = it.h, ratio = imgRatio(it);
        if (ratio) { if (ih / iw > ratio) ih = iw * ratio; else iw = ih / ratio; }
        var src = rotImages[imgKey(it)];
        if (!src) return;
        var fmt = /^data:image\/jpe?g/.test(src) ? 'JPEG' : 'PNG';
        var ir = R(it.x + (it.w - iw) / 2, it.y + (it.h - ih) / 2, iw, ih);
        try { pdf.addImage(src, fmt, ir[0], ir[1], ir[2], ir[3]); } catch (e) { /* повреждённая картинка */ }
      }
    });
    return pdf;
  };

  function rotateImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = img.naturalHeight; c.height = img.naturalWidth;
        var x = c.getContext('2d');
        x.translate(c.width, 0);
        x.rotate(Math.PI / 2);
        x.drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }
  var PX_MM = 16;   // растр знаков и SVG-картинок для PDF: 16 точек на мм ≈ 400 dpi
  function imgRatio(it) {
    if (it.type === 'sign') { var sg = SIGNS.get(it.key); return sg ? SIGNS.ratio(sg) : 0; }
    return it.nw ? it.nh / it.nw : 0;
  }
  function imgKey(it) {
    return it.type === 'sign' ? 'sign:' + it.key + ':' + Math.round(it.w) + 'x' + Math.round(it.h) : it.src;
  }
  function rasterize(src, wpx, hpx) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = wpx; c.height = hpx;
        c.getContext('2d').drawImage(img, 0, 0, wpx, hpx);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }
  /* Готовит картинки для PDF: знаки и SVG — в PNG, при повёрнутом макете — поворот на 90° */
  Editor.prototype.rotatedImages = function () {
    var out = {}, jobs = {}, rot = !!this.doc.label.rot;
    this.doc.items.forEach(function (it) {
      if (it.type !== 'image' && it.type !== 'sign') return;
      var key = imgKey(it);
      if (jobs[key]) return;
      var ratio = imgRatio(it) || it.h / it.w, wpx = Math.max(64, Math.round(Math.min(it.w, it.h / ratio) * PX_MM));
      var hpx = Math.round(wpx * ratio), p;
      if (it.type === 'sign') {
        var sg = SIGNS.get(it.key);
        p = sg ? rasterize(SIGNS.url(sg), wpx, hpx) : Promise.resolve(null);
      } else if (/^data:image\/svg/.test(it.src)) {
        p = rasterize(it.src, wpx, hpx);
      } else {
        p = Promise.resolve(it.src);
      }
      jobs[key] = p.then(function (src) { return src && rot ? rotateImage(src) : src; })
        .then(function (src) { out[key] = src; });
    });
    var all = Object.keys(jobs).map(function (k) { return jobs[k]; });
    return Promise.all(all).then(function () { return out; });
  };

  // На телефонах и планшетах встроенной печати PDF из страницы нет — открываем PDF в новой вкладке
  var MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  Editor.prototype.exportPDF = function (mode) {
    var self = this, L = this.doc.label;
    var win = mode === 'print' && MOBILE ? window.open('', '_blank') : null;
    Promise.all([this.loadFonts(), this.rotatedImages()]).then(function (res) {
      var fonts = res[0];
      if (fonts.missing.length) {
        alert('Шрифт «' + fonts.missing.join('», «') + '» не найден на этом компьютере или не встраивается в PDF. ' +
          'В PDF он заменён на Arimo.');
      }
      var pdf = self.buildPDF(fonts, res[1]);
      if (mode !== 'print') return pdf.save(self.suggestName().replace(/\.xplabel$/, '.pdf'));
      var url = pdf.output('bloburl');
      if (MOBILE) {
        if (win) win.location.href = url; else window.location.href = url;
        return;
      }
      self.printURL(url);
    }).catch(function (e) {
      if (win) win.close();
      alert('Не удалось создать PDF: ' + e.message);
    });
  };

  /* Печать PDF через скрытый iframe: открывается обычное окно печати браузера */
  Editor.prototype.printURL = function (url) {
    if (this.$frame) this.$frame.remove();
    var fr = document.createElement('iframe');
    fr.className = 'xpe-printframe';
    fr.setAttribute('aria-hidden', 'true');
    fr.onload = function () {
      setTimeout(function () {
        try {
          fr.contentWindow.focus();
          fr.contentWindow.print();
        } catch (e) {
          window.open(url, '_blank');
        }
      }, 300);
    };
    fr.src = url;
    document.body.appendChild(fr);
    this.$frame = fr;
  };

  /* ---------- запуск ---------- */
  window.XPEditor = {
    mount: function (el, base) {
      if (el.__xpe) return el.__xpe;
      var fontReady = document.fonts && document.fonts.load ? Promise.all([
        document.fonts.load('400 10px Arimo'), document.fonts.load('700 10px Arimo')
      ]).catch(function () {}) : Promise.resolve();
      SIGN_BASE = base;
      return fontReady.then(function () { el.__xpe = new Editor(el, base); return el.__xpe; });
    }
  };
})();
