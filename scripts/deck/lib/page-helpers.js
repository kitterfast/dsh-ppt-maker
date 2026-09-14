/**
 * Injected into the deck page. Shared verbatim by deck-render.mjs and the
 * fidelity probe, so the probe measures the real capture path.
 *
 * Two details matter for pixel fidelity and were both found the hard way:
 *   - hide with `visibility`, never `display`: these decks lay out with flexbox,
 *     so removing siblings from the flow MOVES the element being captured.
 *   - layers must be captured with every ancestor surface transparent, otherwise
 *     the page's own background is baked into every layer and they occlude each
 *     other in PowerPoint.
 */
window.__deckRender = (function () {
  var CFG = null;
  function setCfg(c) { CFG = c; }

  function styleOnce() {
    if (document.getElementById('__deck_render_style')) return;
    var s = document.createElement('style');
    s.id = '__deck_render_style';
    s.textContent =
      CFG.chrome.map(function (sel) { return sel + '{display:none !important}'; }).join('\n') +
      '\nhtml,body,.deck{background:transparent !important}' +
      '\n.page{transform:none !important}' +
      '\nhtml.__deck_isolate .page,html.__deck_isolate .slide,html.__deck_isolate .body' +
      '{background:transparent !important;box-shadow:none !important}' +
      '\nhtml.__deck_isolate .crop{display:none !important}';
    document.head.appendChild(s);
  }

  function freezeScale() {
    var pages = document.querySelectorAll(CFG.page);
    for (var i = 0; i < pages.length; i++) pages[i].style.transform = 'none';
  }

  function slides() { return Array.prototype.slice.call(document.querySelectorAll(CFG.slide)); }

  function groups(slideEl) {
    return Array.prototype.slice.call(slideEl.querySelectorAll(CFG.groups.selector));
  }

  function hideEls(list) {
    var prev = [];
    for (var i = 0; i < list.length; i++) {
      prev.push(list[i].style.visibility);
      list[i].style.visibility = 'hidden';
    }
    return function restore() { for (var i = 0; i < list.length; i++) list[i].style.visibility = prev[i]; };
  }

  function isolate(keep) {
    var toHide = [];
    var cur = keep;
    while (cur && cur !== document.body && cur.parentElement) {
      var parent = cur.parentElement;
      var kids = parent.children;
      for (var i = 0; i < kids.length; i++) if (kids[i] !== cur) toHide.push(kids[i]);
      cur = parent;
    }
    document.documentElement.classList.add('__deck_isolate');
    var restoreHide = hideEls(toHide);
    return function restore() {
      restoreHide();
      document.documentElement.classList.remove('__deck_isolate');
    };
  }

  function hideAll(list) { return hideEls(list); }

  function box(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  /*
   * getBoundingClientRect() covers the BORDER box only. A box-shadow (or a
   * filter: drop-shadow) paints outside it, so clipping to the border box cut
   * the shadow off every layer — measured as a band of differing pixels exactly
   * along the top and bottom edges of each card (up to 1128 px on one row).
   * Grow the capture rect to the element's real ink extent.
   */
  function inkBox(el) {
    var r = el.getBoundingClientRect();
    var grow = 0;
    var cs = window.getComputedStyle(el);
    (cs.boxShadow || '').split(/,(?![^(]*\))/).forEach(function (sh) {
      var n = (sh.match(/-?[\d.]+px/g) || []).map(parseFloat);
      if (n.length < 3) return;
      var ox = Math.abs(n[0] || 0), oy = Math.abs(n[1] || 0), blur = n[2] || 0, spread = Math.abs(n[3] || 0);
      grow = Math.max(grow, Math.max(ox, oy) + blur + spread);
    });
    var dm = /drop-shadow\(([^)]*)\)/.exec(cs.filter || '');
    if (dm) {
      var d = (dm[1].match(/-?[\d.]+px/g) || []).map(parseFloat);
      grow = Math.max(grow, Math.max(Math.abs(d[0] || 0), Math.abs(d[1] || 0)) + (d[2] || 0));
    }
    grow = Math.ceil(grow) + 1;
    return { x: r.left - grow, y: r.top - grow, w: r.width + grow * 2, h: r.height + grow * 2, grow: grow };
  }

  function describe(el) {
    return {
      text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400),
      cls: el.className && el.className.baseVal === undefined ? String(el.className) : (el.tagName || '').toLowerCase(),
    };
  }

  return {
    setCfg: setCfg, styleOnce: styleOnce, freezeScale: freezeScale,
    slides: slides, groups: groups, isolate: isolate, hideAll: hideAll, box: box, inkBox: inkBox, describe: describe,
    ready: function () {
      var imgs = Array.prototype.slice.call(document.images).filter(function (i) { return !i.complete; });
      return document.fonts.ready.then(function () {
        return Promise.all(imgs.map(function (i) {
          return new Promise(function (r) { i.onload = i.onerror = r; });
        }));
      }).then(function () { return true; });
    },
    goto: function (n) { CFG.goto(n, true); },
    /* Enter WITH the entrance animation, so CSS keyframe loops actually start
       and the deck's own JS starts any canvas/WebGL motion for this page. */
    gotoAnimated: function (n) { CFG.goto(n, false); },
    /* A <canvas> inside the group means its motion may be script-driven, which
       getAnimations() cannot see. */
    hasCanvas: function (el) { return !!el.querySelector('canvas'); },
    hasGoto: function () { try { return typeof CFG.goto === 'function'; } catch (e) { return false; } },
  };
})();
true;
