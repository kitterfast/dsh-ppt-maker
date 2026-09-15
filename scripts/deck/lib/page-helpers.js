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


  /* Innermost elements that keep moving: infinite CSS animation on the element
     itself, or a <canvas> (script-driven). These get baked on their own so the
     text around them can stay a lossless PNG. */
  function animatedBits(el) {
    var all = el.querySelectorAll('*');
    var picked = [];
    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      if (n.tagName === 'CANVAS') {
        // ECharts canvases are NOT baked (their reveal is one-shot and the
        // proven deck keeps charts as plain layers). Only THREE canvases
        // qualify. Skip canvases owned by an echarts instance.
        var dom = n.parentElement, own = false;
        for (var up = 0; up < 4 && dom; up++) {
          try { if (window.echarts && window.echarts.getInstanceByDom(dom)) { own = true; break; } } catch (e) {}
          dom = dom.parentElement;
        }
        if (own) continue;
        picked.push(n);
        continue;
      }
      var an = n.getAnimations ? n.getAnimations({ subtree: false }) : [];
      for (var a = 0; a < an.length; a++) {
        var t = an[a].effect && an[a].effect.getTiming ? an[a].effect.getTiming() : {};
        if (t.iterations === Infinity) { picked.push(n); break; }
      }
    }
    return picked.filter(function (n) {
      return !picked.some(function (m) { return m !== n && m.contains(n); });
    });
  }

  function animatedBitsOf(slideEl) {
    var out = [], gs = groups(slideEl);
    for (var i = 0; i < gs.length; i++) {
      var b = animatedBits(gs[i]);
      for (var j = 0; j < b.length; j++) out.push(b[j]);
    }
    return out;
  }

  /* Nearest .aN ancestor of a canvas — the entrance layer that owns it. */
  function canvasOwner(cv) {
    var cur = cv;
    while (cur && cur.parentElement && cur !== document.body) {
      cur = cur.parentElement;
      if (cur.matches && cur.matches(CFG.groups.selector)) return cur;
    }
    return cv;
  }

  /* Two nested .aN layers around one canvas (e.g. `.a4 > #threeAI.a4`): the
     inner layer must become the GIF and the outer layers must lose the canvas
     ink, exactly like the proven deck. */
  function nestedCanvas(cv) {
    var own = canvasOwner(cv);
    if (!own || own === cv) return false;
    var cur = own;
    while (cur && cur.parentElement && cur !== document.body) {
      cur = cur.parentElement;
      if (cur.matches && cur.matches(CFG.groups.selector)) return true;
    }
    return false;
  }

  /* What layer capture must hide: infinite-CSS elements, plus THREE canvases —
     or their owning .aN layer when nested, so the GIF replaces the whole group
     instead of leaving the group's chrome (title, background) duplicated. */
  function hiddenBits(slideEl) {
    var bits = animatedBitsOf(slideEl);
    var out = [], seen = [];
    for (var i = 0; i < bits.length; i++) {
      var b = bits[i];
      var keep = b;
      if (b.tagName === 'CANVAS' && nestedCanvas(b)) keep = canvasOwner(b);
      if (seen.indexOf(keep) === -1) { seen.push(keep); out.push(keep); }
    }
    return out;
  }

  /* Owners of nested canvases (deduped) — their ancestor .aN groups must hide
     every descendant group during capture, or the ancestor layer keeps ink that
     belongs to a child layer and the entrance timing doubles. */
  function nestedOwners(slideEl) {
    var bits = animatedBitsOf(slideEl), out = [], seen = [];
    for (var i = 0; i < bits.length; i++) {
      if (bits[i].tagName !== 'CANVAS' || !nestedCanvas(bits[i])) continue;
      var own = canvasOwner(bits[i]);
      if (seen.indexOf(own) === -1) { seen.push(own); out.push(own); }
    }
    return out;
  }


  /* ECharts plays its per-item reveal ONCE at page load; afterwards the chart
     sits at the final state and any later recording sees "no motion". Re-run
     the entry animation right before recording. */
  function replayCharts(slideEl) {
    if (!window.echarts) return 0;
    var n = 0;
    var cs = slideEl.querySelectorAll('canvas');
    for (var i = 0; i < cs.length; i++) {
      // ECharts 5 wraps the canvas in an inner div, so walk UP until the
      // element that echarts.init() was called with is found.
      var dom = cs[i];
      try {
        for (var up = 0; up < 4 && dom; up++) {
          var c = window.echarts.getInstanceByDom(dom);
          if (c) break;
          dom = dom.parentElement;
        }
        if (!c) continue;
        var o = c.getOption();
        c.clear();
        c.setOption(o);
        n++;
      } catch (e) {}
    }
    return n;
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
    slides: slides, groups: groups, isolate: isolate, hideAll: hideAll, box: box, inkBox: inkBox, describe: describe, animatedBits: animatedBits, animatedBitsOf: animatedBitsOf, replayCharts: replayCharts,
    canvasOwner: canvasOwner, nestedCanvas: nestedCanvas, hiddenBits: hiddenBits, nestedOwners: nestedOwners,
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
