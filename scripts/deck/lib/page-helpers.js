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
      // Full-slide pseudo-element veils (the paper-noise ::after at alpha ~6-14)
      // paint over the WHOLE layer rectangle, so no layer pixel is ever fully
      // transparent. Measured on the rebuilt deck: 0.0% transparent pixels per
      // layer against the proven deck's 70-99%, which cost ~10MB of PNG across
      // 11 pages. The veil still lives in the BASE, which is captured outside
      // isolation, so the composite is unchanged.
      '\nhtml.__deck_isolate .slide::after,html.__deck_isolate .slide::before' +
      '{display:none !important}' +
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

  /* Idempotent: one isolate list can legitimately name the same node twice (a
     hidden .aN layer is also a non-member sibling on the ancestor walk). Without
     the dedupe the restore replays both history entries in order — '' then
     'hidden' — and leaves the node hidden for every LATER capture, which emptied
     page 1's a2..a5 layers while a1 (captured first) looked fine. */
  function hideEls(list) {
    var prev = [], seen = [];
    for (var i = 0; i < list.length; i++) {
      if (seen.indexOf(list[i]) !== -1) continue;
      seen.push(list[i]);
      prev.push(list[i].style.visibility);
      list[i].style.visibility = 'hidden';
    }
    return function restore() { for (var i = 0; i < seen.length; i++) seen[i].style.visibility = prev[i]; };
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

  /* ══════════════════════════════════════════════════════════════════════════
   * LAYER MODEL — one layer per distinct .aN CLASS, not per element.
   *
   * The proven deck is built this way and it is visible in its own XML: page 1
   * has EIGHT elements carrying .a1…​.a5 but only FIVE layers, and page 11 skips
   * the .a2 delay entirely (40,260,370,480) because that page has no .a2 element
   * at all. Per-element layers produced 68 layers against the proven deck's 56.
   *
   * Repeated classes merge: every element with .a4 on a page becomes ONE layer
   * whose box is the union of its members. The element-level helpers above are
   * kept unchanged so the probes and the fidelity check still work.
   * ═════════════════════════════════════════════════════════════════════════ */
  function classOf(el) {
    var m = /(?:^|\s)(a\d+)(?=\s|$)/.exec(el.className || '');
    return m ? m[1] : null;
  }

  function elsOf(x) { return x && x.els ? x.els : (x ? [x] : []); }

  function deckGroups(slideEl) {
    var els = groups(slideEl), order = [], map = {}, allClassed = true;
    for (var i = 0; i < els.length; i++) {
      var c = classOf(els[i]);
      if (c) {
        if (!map[c]) { map[c] = { cls: c, els: [] }; order.push(c); }
        map[c].els.push(els[i]);
      } else {
        // A deck whose layer selector carries no .aN class (the AI decks declare
        // theirs as `.body > *`, with delays from nth-child rules) must keep the
        // legacy one-layer-per-element split. Without this every element would be
        // skipped and the deck would build with ZERO pictures.
        allClassed = false;
        var key = '#' + i;
        map[key] = { cls: null, els: [els[i]], legacy: true };
        order.push(key);
      }
    }
    if (allClassed) {
      order.sort(function (a, b) { return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10); });
    }
    return order.map(function (k) { return map[k]; });
  }

  /* Plain layout rect. NO box-shadow growth: the proven deck pads every layer by
     a constant 10px instead, which covers the card shadows without inflating
     each box to the element's own (uneven) ink extent. */
  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  function unionRect(x) {
    var els = elsOf(x), r = null;
    // Classless (legacy) groups keep the old box: the element's own INK extent,
    // box-shadow included, because those decks have no measured 10px convention.
    if (x && x.legacy && els.length === 1) return inkBox(els[0]);
    for (var i = 0; i < els.length; i++) {
      var b = rectOf(els[i]);
      r = r ? { x: Math.min(r.x, b.x), y: Math.min(r.y, b.y),
                r: Math.max(r.r, b.x + b.w), b: Math.max(r.b, b.y + b.h) }
            : { x: b.x, y: b.y, r: b.x + b.w, b: b.y + b.h };
    }
    if (!r) return null;
    return { x: r.x, y: r.y, w: r.r - r.x, h: r.b - r.y };
  }

  /* Isolate a SET of elements: hide every other .aN layer AND every non-member
     sibling along each member's ancestor chain. Hiding an ancestor of a member
     would hide the member itself, so ancestors of members always survive. */
  function isolateMany(x) {
    var keep = elsOf(x), toHide = [];
    var all = document.querySelectorAll(CFG.groups.selector);
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (keep.indexOf(e) !== -1) continue;
      var holds = false;
      for (var h = 0; h < keep.length; h++) if (e.contains(keep[h])) { holds = true; break; }
      if (!holds) toHide.push(e);
    }
    // Only LEGACY groups hide non-member siblings too. A class layer keeps the
    // slide's non-animated content, exactly like the proven deck -- page 6's
    // yellow note (a plain div, no .aN class) is baked into its .a4 layer there,
    // so it rises with that entrance instead of sitting still in the base.
    if (x && x.legacy) {
      for (var j = 0; j < keep.length; j++) {
        var cur = keep[j];
        while (cur && cur !== document.body && cur.parentElement) {
          var kids = cur.parentElement.children;
          for (var t = 0; t < kids.length; t++) {
            var k = kids[t];
            if (k === cur) continue;
            var has = false;
            for (var q = 0; q < keep.length; q++) if (k === keep[q] || k.contains(keep[q])) { has = true; break; }
            if (!has) toHide.push(k);
          }
          cur = cur.parentElement;
        }
      }
    }
    document.documentElement.classList.add('__deck_isolate');
    var restoreHide = hideEls(toHide);
    return function restore() {
      restoreHide();
      document.documentElement.classList.remove('__deck_isolate');
    };
  }

  function groupDescribe(g) {
    var els = elsOf(g), texts = [];
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].innerText || '').replace(/\s+/g, ' ').trim();
      if (t) texts.push(t);
    }
    var names = els.map(function (e) { return String(e.className); }).join(' ');
    return {
      text: texts.join(' | ').slice(0, 400),
      cls: (g && g.cls ? g.cls + ' ' : '') + names,
    };
  }

  function groupHasCanvas(g) {
    var els = elsOf(g);
    for (var i = 0; i < els.length; i++) if (els[i].querySelector('canvas')) return true;
    return false;
  }

  /* Animated sub-elements of a whole class-group: infinite-CSS elements and
     THREE canvases across all members, deduped, innermost only. */
  function groupAnimatedBits(g) {
    var els = elsOf(g), picked = [];
    for (var i = 0; i < els.length; i++) {
      var b = animatedBits(els[i]);
      for (var j = 0; j < b.length; j++) if (picked.indexOf(b[j]) === -1) picked.push(b[j]);
    }
    return picked.filter(function (n) {
      return !picked.some(function (m) { return m !== n && m.contains(n); });
    });
  }

  /* What the STATIC layer of this group must hide: a canvas that sits inside the
     layer is drawn by its own GIF, so the canvas (or the .aN layer that owns it,
     which also carries the screen's chrome) must not be baked into the PNG. */
  function groupHiddenBits(g) {
    var bits = groupAnimatedBits(g), out = [], seen = [];
    for (var i = 0; i < bits.length; i++) {
      var b = bits[i], keep = b;
      if (b.tagName === 'CANVAS' && nestedCanvas(b)) keep = canvasOwner(b);
      if (seen.indexOf(keep) === -1) { seen.push(keep); out.push(keep); }
    }
    return out;
  }

  return {
    setCfg: setCfg, styleOnce: styleOnce, freezeScale: freezeScale,
    slides: slides, groups: groups, isolate: isolate, hideAll: hideAll, box: box, inkBox: inkBox, describe: describe, animatedBits: animatedBits, animatedBitsOf: animatedBitsOf, replayCharts: replayCharts,
    canvasOwner: canvasOwner, nestedCanvas: nestedCanvas, hiddenBits: hiddenBits, nestedOwners: nestedOwners,
    classOf: classOf, deckGroups: deckGroups, elsOf: elsOf, rectOf: rectOf, unionRect: unionRect,
    isolateMany: isolateMany, groupDescribe: groupDescribe, groupHasCanvas: groupHasCanvas,
    groupAnimatedBits: groupAnimatedBits, groupHiddenBits: groupHiddenBits,
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
