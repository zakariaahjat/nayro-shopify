/*!
 * Nayro theme — storefront interactions
 * Vanilla JS, no dependencies. Works with Shopify AJAX Cart API and Section Rendering API.
 */
(function () {
  'use strict';

  var cfg = window.NayroConfig || {};
  var strings = cfg.strings || {};
  var root = (cfg.root || '/').replace(/\/?$/, '/');
  var docEl = document.documentElement;
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var WISHLIST_KEY = 'nayro-wishlist';
  var RECENT_KEY = 'nayro-recently-viewed';
  var THEME_KEY = 'nayro-theme';
  var VIEW_KEY = 'nayro-shop-view';
  var productCache = {};

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */
  function qs(selector, ctx) { return (ctx || document).querySelector(selector); }
  function qsa(selector, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(selector)); }
  function on(target, type, handler, options) { if (target) { target.addEventListener(type, handler, options || false); } }
  function debounce(fn, wait) {
    var timer;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(value) { return escapeHtml(value); }
  function stripHtml(value) {
    var div = document.createElement('div');
    div.innerHTML = value || '';
    return (div.textContent || div.innerText || '').trim();
  }
  function number(value) { var n = parseFloat(value); return isNaN(n) ? 0 : n; }
  function getList(key) {
    try {
      var raw = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(raw) ? raw.filter(function (item) { return typeof item === 'string' && item; }) : [];
    } catch (e) { return []; }
  }
  function setList(key, list) {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) {}
  }
  function formatMoney(cents, format) {
    var value = number(cents) / 100;
    var fmt = format || cfg.moneyFormat || '{{amount}}';
    var fixed = value.toFixed(2).split('.');
    var integer = fixed[0];
    var decimals = fixed[1];
    function group(str, separator) {
      return String(str).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
    }
    var values = {
      amount: group(integer, ',') + '.' + decimals,
      amount_no_decimals: group(integer, ','),
      amount_with_comma_separator: group(integer, '.') + ',' + decimals,
      amount_no_decimals_with_comma_separator: group(integer, '.'),
      amount_with_apostrophe_separator: group(integer, "'") + '.' + decimals,
      amount_no_decimals_with_apostrophe_separator: group(integer, "'"),
      amount_with_space_separator: group(integer, ' ') + '.' + decimals,
      amount_no_decimals_with_space_separator: group(integer, ' ')
    };
    if (!/\{\{/.test(fmt)) {
      try {
        return new Intl.NumberFormat(docEl.lang || 'en', {
          style: 'currency',
          currency: cfg.currency || 'USD'
        }).format(value);
      } catch (e) { return value.toFixed(2); }
    }
    return fmt.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, function (match, key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match;
    });
  }
  function formatMoneyRaw(value) {
    return formatMoney(number(value), cfg.moneyFormat);
  }
  function toast(message) {
    var el = qs('#nayro-toast');
    if (!el || !message) { return; }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(el._nayroTimer);
    el._nayroTimer = setTimeout(function () { el.classList.remove('is-visible'); }, 2800);
  }
  function setError(form, message) {
    if (!form) { return; }
    var box = qs('[data-form-error]', form);
    if (box) {
      box.textContent = message || strings.error || 'Something went wrong.';
      box.hidden = false;
    }
  }
  function clearError(form) {
    if (!form) { return; }
    var box = qs('[data-form-error]', form);
    if (box) { box.textContent = ''; box.hidden = true; }
  }
  function requestSubmit(form) {
    if (!form) { return; }
    if (typeof form.requestSubmit === 'function') { form.requestSubmit(); } else { form.submit(); }
  }

  /* ------------------------------------------------------------------ */
  /* Dark mode                                                          */
  /* ------------------------------------------------------------------ */
  function currentTheme() { return docEl.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function applyTheme(theme) {
    docEl.setAttribute('data-theme', theme);
    var toggle = qs('#nayro-theme-toggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
      toggle.setAttribute('title', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }
  function initTheme() {
    var toggle = qs('#nayro-theme-toggle');
    if (!toggle) { return; }
    toggle.setAttribute('aria-pressed', currentTheme() === 'dark' ? 'true' : 'false');
    on(toggle, 'click', function () {
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    });
  }

  /* ------------------------------------------------------------------ */
  /* Panels, focus management and scroll lock                           */
  /* ------------------------------------------------------------------ */
  var panelSelectors = '.nayro-mobile-panel, .nayro-cart-drawer, .nayro-shop__sidebar';
  var quickViewTrigger = null;

  function isFacets(panel) { return panel && panel.hasAttribute && panel.hasAttribute('data-facets-sidebar'); }
  function isMobileFacets() { return window.matchMedia('(max-width: 1024px)').matches; }
  function canInert(panel) { return !isFacets(panel) || isMobileFacets(); }
  function anyPanelOpen() {
    return qsa(panelSelectors + '.is-open').length > 0;
  }
  function syncOverlay() {
    var overlay = qs('#nayro-overlay');
    var open = anyPanelOpen() || (qs('#nayro-quickview') && !qs('#nayro-quickview').hidden);
    if (overlay) {
      overlay.hidden = !open;
      overlay.classList.toggle('is-open', open);
    }
    document.body.style.overflow = open ? 'hidden' : '';
  }
  function focusables(container) {
    return qsa('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', container)
      .filter(function (el) { return !el.hasAttribute('hidden') && el.getClientRects().length > 0; });
  }
  function openPanel(panel, trigger) {
    if (!panel) { return; }
    closeQuickView(false);
    qsa(panelSelectors + '.is-open').forEach(function (other) {
      if (other !== panel) { closePanel(other, false); }
    });
    var opener = trigger || document.activeElement;
    if (opener && opener !== document.body) { panel._nayroTrigger = opener; }
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    if (canInert(panel)) { panel.inert = false; }
    if (opener && opener.getAttribute && opener.hasAttribute('aria-expanded')) {
      opener.setAttribute('aria-expanded', 'true');
    }
    syncOverlay();
    window.requestAnimationFrame(function () {
      var first = qs('[data-close-panel], [data-close-facets]', panel) || focusables(panel)[0];
      if (first) { first.focus({ preventScroll: true }); }
    });
  }
  function closePanel(panel, restoreFocus) {
    if (!panel || !panel.classList.contains('is-open')) { return; }
    var trigger = panel._nayroTrigger;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    if (canInert(panel)) { panel.inert = true; }
    if (trigger && trigger.getAttribute && trigger.hasAttribute('aria-expanded')) {
      trigger.setAttribute('aria-expanded', 'false');
    }
    syncOverlay();
    if (restoreFocus !== false && trigger && document.contains(trigger)) {
      trigger.focus({ preventScroll: true });
    }
  }
  function closeAllPanels() {
    qsa(panelSelectors + '.is-open').forEach(function (panel) { closePanel(panel, false); });
    closeQuickView(false);
    syncOverlay();
  }
  function trapFocus(event, container) {
    if (event.key !== 'Tab') { return; }
    var items = focusables(container);
    if (!items.length) { return; }
    var first = items[0];
    var last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  function initPanels() {
    qsa(panelSelectors).forEach(function (panel) {
      if (panel.classList.contains('is-open')) { return; }
      if (isFacets(panel)) {
        var mobile = isMobileFacets();
        panel.setAttribute('aria-hidden', mobile ? 'true' : 'false');
        panel.inert = mobile;
      } else {
        panel.setAttribute('aria-hidden', 'true');
        panel.inert = true;
      }
    });

    document.addEventListener('click', function (event) {
      var opener = event.target.closest('[data-open-panel]');
      if (opener) {
        event.preventDefault();
        var map = { 'mobile-menu': '#nayro-mobile-menu', cart: '#nayro-cart-drawer' };
        var panel = qs(map[opener.getAttribute('data-open-panel')]);
        if (panel) {
          if (panel.classList.contains('is-open')) { closePanel(panel); } else { openPanel(panel, opener); }
        }
        return;
      }

      var close = event.target.closest('[data-close-panel]');
      if (close) {
        if (close.tagName !== 'A') { event.preventDefault(); }
        closePanel(close.closest(panelSelectors) || qs('#nayro-cart-drawer'));
        return;
      }

      var facetOpener = event.target.closest('[data-toggle-facets]');
      if (facetOpener) {
        event.preventDefault();
        var id = facetOpener.getAttribute('aria-controls');
        var sidebar = id ? document.getElementById(id) : qs('[data-facets-sidebar]');
        openPanel(sidebar, facetOpener);
        return;
      }

      var facetClose = event.target.closest('[data-close-facets]');
      if (facetClose) {
        event.preventDefault();
        closePanel(facetClose.closest('[data-facets-sidebar]'));
      }
    });

    var overlay = qs('#nayro-overlay');
    on(overlay, 'click', closeAllPanels);

    document.addEventListener('keydown', function (event) {
      var quickview = qs('#nayro-quickview');
      if (event.key === 'Escape') {
        if (quickview && !quickview.hidden) { closeQuickView(); return; }
        if (anyPanelOpen()) { closeAllPanels(); }
        return;
      }
      if (event.key === 'Tab') {
        if (quickview && !quickview.hidden) { trapFocus(event, quickview); return; }
        var openPanels = qsa(panelSelectors + '.is-open');
        if (openPanels.length) { trapFocus(event, openPanels[openPanels.length - 1]); }
      }
    });

    on(window, 'resize', function () {
      qsa('[data-facets-sidebar]').forEach(function (panel) {
        if (panel.classList.contains('is-open')) { return; }
        var mobile = isMobileFacets();
        panel.inert = mobile;
        panel.setAttribute('aria-hidden', mobile ? 'true' : 'false');
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Header and reading progress                                        */
  /* ------------------------------------------------------------------ */
  function initHeader() {
    var header = qs('#nayro-header');
    var progress = qs('#nayro-progress');
    if (!header && !progress) { return; }
    var ticking = false;
    function update() {
      var scroll = window.pageYOffset || docEl.scrollTop;
      if (header) { header.classList.toggle('is-sticky', scroll > 120); }
      if (progress) {
        var max = docEl.scrollHeight - window.innerHeight;
        var ratio = max > 0 ? Math.min(1, Math.max(0, scroll / max)) : 0;
        progress.style.transform = 'scaleX(' + ratio + ')';
      }
      ticking = false;
    }
    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }
    on(window, 'scroll', onScroll, { passive: true });
    update();
  }

  /* ------------------------------------------------------------------ */
  /* Hero slider                                                        */
  /* ------------------------------------------------------------------ */
  function initHeroSliders() {
    qsa('[data-nh-slider]').forEach(function (slider) {
      var slides = qsa('.nh-slide', slider);
      if (slides.length < 2) { return; }
      var dots = qsa('.nh-dots button', slider);
      var index = 0;
      var timer = null;

      function show(next, focusDot) {
        index = (next + slides.length) % slides.length;
        slides.forEach(function (slide, i) {
          var active = i === index;
          slide.classList.toggle('is-active', active);
          if (active) {
            slide.removeAttribute('aria-hidden');
            slide.removeAttribute('tabindex');
          } else {
            slide.setAttribute('aria-hidden', 'true');
            slide.setAttribute('tabindex', '-1');
          }
        });
        dots.forEach(function (dot, i) {
          dot.classList.toggle('is-active', i === index);
          if (i === index) { dot.setAttribute('aria-current', 'true'); } else { dot.removeAttribute('aria-current'); }
        });
        if (focusDot && dots[index]) { dots[index].focus({ preventScroll: true }); }
      }
      function stop() { if (timer) { clearInterval(timer); timer = null; } }
      function start() {
        stop();
        if (reducedMotion) { return; }
        timer = setInterval(function () { show(index + 1); }, 6500);
      }

      dots.forEach(function (dot, i) { on(dot, 'click', function () { show(i); start(); }); });
      qsa('[data-dir]', slider).forEach(function (button) {
        on(button, 'click', function () {
          show(index + (parseInt(button.getAttribute('data-dir'), 10) || 1));
          start();
        });
      });
      on(slider, 'mouseenter', stop);
      on(slider, 'mouseleave', start);
      on(slider, 'focusin', stop);
      on(slider, 'focusout', function (event) {
        if (!slider.contains(event.relatedTarget)) { start(); }
      });
      on(slider, 'keydown', function (event) {
        if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
      });
      start();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Countdown and count-up                                             */
  /* ------------------------------------------------------------------ */
  function initCountdowns() {
    qsa('[data-countdown]').forEach(function (rootEl) {
      var value = rootEl.getAttribute('data-countdown') || '';
      var match = /^(\d{1,2}):(\d{2})$/.exec(value);
      if (!match) { return; }
      var hours = Math.min(23, parseInt(match[1], 10));
      var minutes = Math.min(59, parseInt(match[2], 10));
      var end = new Date();
      end.setHours(hours, minutes, 0, 0);
      if (end.getTime() <= Date.now()) { end.setDate(end.getDate() + 1); }

      var out = {
        h: qs('[data-u="h"]', rootEl),
        m: qs('[data-u="m"]', rootEl),
        s: qs('[data-u="s"]', rootEl)
      };
      function pad(n) { return (n < 10 ? '0' : '') + n; }
      function tick() {
        var diff = Math.max(0, end.getTime() - Date.now());
        var h = Math.floor(diff / 3600000);
        var m = Math.floor((diff % 3600000) / 60000);
        var s = Math.floor((diff % 60000) / 1000);
        if (out.h) { out.h.textContent = pad(h); }
        if (out.m) { out.m.textContent = pad(m); }
        if (out.s) { out.s.textContent = pad(s); }
      }
      tick();
      setInterval(tick, 1000);
    });
  }

  function initCountUps() {
    var elements = qsa('[data-count-to]');
    if (!elements.length) { return; }
    function finish(el) {
      var target = number(el.getAttribute('data-count-to'));
      el.textContent = Math.round(target).toLocaleString() + (el.getAttribute('data-count-suffix') || '');
    }
    if (reducedMotion || !('IntersectionObserver' in window)) {
      elements.forEach(finish);
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) { return; }
        var el = entry.target;
        observer.unobserve(el);
        var target = number(el.getAttribute('data-count-to'));
        var suffix = el.getAttribute('data-count-suffix') || '';
        var start = performance.now();
        var duration = 1200;
        function frame(now) {
          var progress = Math.min(1, (now - start) / duration);
          var eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.round(target * eased).toLocaleString() + suffix;
          if (progress < 1) { window.requestAnimationFrame(frame); } else { finish(el); }
        }
        window.requestAnimationFrame(frame);
      });
    }, { threshold: 0.4 });
    elements.forEach(function (el) { observer.observe(el); });
  }

  /* ------------------------------------------------------------------ */
  /* Tabs                                                               */
  /* ------------------------------------------------------------------ */
  function setupTabs(tabs) {
    if (!tabs.length) { return; }
    function activate(tab, focus) {
      tabs.forEach(function (item) {
        var selected = item === tab;
        item.setAttribute('aria-selected', selected ? 'true' : 'false');
        item.tabIndex = selected ? 0 : -1;
        var panel = document.getElementById(item.getAttribute('aria-controls'));
        if (panel) { panel.hidden = !selected; }
      });
      if (focus) { tab.focus({ preventScroll: true }); }
    }
    tabs.forEach(function (tab, index) {
      on(tab, 'click', function () { activate(tab); });
      on(tab, 'keydown', function (event) {
        var next = null;
        if (event.key === 'ArrowRight') { next = (index + 1) % tabs.length; }
        if (event.key === 'ArrowLeft') { next = (index - 1 + tabs.length) % tabs.length; }
        if (event.key === 'Home') { next = 0; }
        if (event.key === 'End') { next = tabs.length - 1; }
        if (next !== null) {
          event.preventDefault();
          activate(tabs[next], true);
        }
      });
    });
  }
  function initTabs() {
    qsa('[data-nh-tabs]').forEach(function (rootEl) {
      setupTabs(qsa('.nh-tab', rootEl));
    });
    qsa('[data-product-tabs]').forEach(function (rootEl) {
      setupTabs(qsa('[data-product-tab]', rootEl));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Collection toolbar, filters, sorting, localization and view mode   */
  /* ------------------------------------------------------------------ */
  function applyShopView(view) {
    var grid = qs('[data-shop-view]');
    var mode = view === 'list' ? 'list' : 'grid';
    if (grid) {
      grid.classList.toggle('nayro-view-list', mode === 'list');
    }
    qsa('[data-view]').forEach(function (button) {
      var active = button.getAttribute('data-view') === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }
  function initShopTools() {
    document.addEventListener('click', function (event) {
      var view = event.target.closest('[data-view]');
      if (!view) { return; }
      event.preventDefault();
      var mode = view.getAttribute('data-view');
      applyShopView(mode);
      try { localStorage.setItem(VIEW_KEY, mode); } catch (e) {}
    });

    var savedView = null;
    try { savedView = localStorage.getItem(VIEW_KEY); } catch (e) {}
    applyShopView(savedView || 'grid');

    document.addEventListener('change', function (event) {
      var target = event.target;
      if (target.matches('[data-sort-select]') || target.matches('[data-localization-select]')) {
        requestSubmit(target.form);
      }
    });

    document.addEventListener('change', function (event) {
      if (event.target.matches('[data-facet-input]') && event.target.type !== 'number') {
        requestSubmit(event.target.form);
      }
    });

    var debouncedFacetSubmit = debounce(function (form) { requestSubmit(form); }, 450);
    document.addEventListener('input', function (event) {
      if (event.target.matches('[data-facet-input][type="number"]')) {
        debouncedFacetSubmit(event.target.form);
      }
    });

    document.addEventListener('change', function (event) {
      var qty = event.target.closest('[data-cart-page-qty]');
      if (!qty) { return; }
      if (number(qty.value) < 1) { qty.value = 1; }
      requestSubmit(qty.form);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Confirmation prompts and customer address provinces                */
  /* ------------------------------------------------------------------ */
  function initConfirmForms() {
    document.addEventListener('submit', function (event) {
      var form = event.target.closest('form[data-confirm]');
      if (form && !window.confirm(form.getAttribute('data-confirm'))) {
        event.preventDefault();
      }
    });
  }

  function initAddressProvinces() {
    qsa('[data-address-country]').forEach(function (country) {
      var key = country.getAttribute('data-address-country');
      var province = qs('[data-address-province="' + key + '"]');
      if (!province) { return; }
      var defaultCountry = country.getAttribute('data-default');
      if (defaultCountry) {
        Array.prototype.some.call(country.options, function (option) {
          if (option.value === defaultCountry || option.textContent.trim() === defaultCountry) {
            option.selected = true;
            return true;
          }
          return false;
        });
      }
      function update() {
        var selected = country.options[country.selectedIndex];
        var provinces = [];
        if (selected) {
          try { provinces = JSON.parse(selected.getAttribute('data-provinces') || '[]'); } catch (e) { provinces = []; }
        }
        var previous = province.getAttribute('data-default') || province.value;
        province.innerHTML = '';
        if (!Array.isArray(provinces) || !provinces.length) {
          province.disabled = true;
          var empty = document.createElement('option');
          empty.value = '';
          empty.textContent = '—';
          province.appendChild(empty);
          return;
        }
        province.disabled = false;
        provinces.forEach(function (item) {
          if (!item || item.length < 2) { return; }
          var option = document.createElement('option');
          option.value = item[1];
          option.textContent = item[0];
          if (previous && previous === item[1]) { option.selected = true; }
          province.appendChild(option);
        });
        if (previous) {
          var exists = Array.prototype.some.call(province.options, function (option) { return option.value === previous; });
          if (exists) { province.value = previous; }
        }
        province.removeAttribute('data-default');
      }
      update();
      on(country, 'change', update);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Product gallery                                                    */
  /* ------------------------------------------------------------------ */
  function initGaller(scope) {
    qsa('[data-gallery]', scope).forEach(function (gallery) {
      if (gallery._nayroGallery) { return; }
      gallery._nayroGallery = true;
      var slides = qsa('[data-gallery-slide]', gallery);
      var thumbs = qsa('[data-gallery-thumb]', gallery);
      var zoom = qs('[data-gallery-zoom]', gallery);
      if (!slides.length) { return; }
      var index = 0;
      function show(next) {
        index = (next + slides.length) % slides.length;
        slides.forEach(function (slide, i) {
          var active = i === index;
          slide.classList.toggle('is-active', active);
          if (active) { slide.removeAttribute('aria-hidden'); } else { slide.setAttribute('aria-hidden', 'true'); }
        });
        thumbs.forEach(function (thumb, i) {
          var active = i === index;
          thumb.classList.toggle('is-active', active);
          thumb.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        if (zoom && slides[index]) {
          var full = slides[index].getAttribute('data-full');
          if (full) { zoom.setAttribute('href', full); }
        }
      }
      thumbs.forEach(function (thumb) {
        on(thumb, 'click', function () { show(parseInt(thumb.getAttribute('data-index'), 10) || 0); });
      });
      on(qs('[data-gallery-prev]', gallery), 'click', function () { show(index - 1); });
      on(qs('[data-gallery-next]', gallery), 'click', function () { show(index + 1); });
      on(gallery, 'keydown', function (event) {
        if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
      });
      gallery._nayroShow = show;
    });
  }
  function activateGalleryMedia(scope, mediaId) {
    if (!mediaId) { return; }
    var gallery = qs('[data-gallery]', scope);
    if (!gallery || !gallery._nayroShow) { return; }
    var slide = qs('[data-gallery-slide][data-media-id="' + mediaId + '"]', gallery);
    if (slide) {
      gallery._nayroShow(parseInt(slide.getAttribute('data-index'), 10) || 0);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Product variant selector                                           */
  /* ------------------------------------------------------------------ */
  function initVariantSelectors() {
    qsa('[data-product-root]').forEach(function (rootEl) {
      var select = qs('select[data-variant-select]', rootEl);
      if (!select) { return; }
      on(select, 'change', function () {
        var option = select.options[select.selectedIndex];
        if (!option) { return; }
        var price = qs('[data-product-price]', rootEl);
        if (price) {
          var value = option.getAttribute('data-variant-price') || '';
          var compare = option.getAttribute('data-variant-compare') || '';
          price.innerHTML = compare ? '<span class="nayro-price" data-price><del>' + escapeHtml(compare) + '</del> <ins>' + escapeHtml(value) + '</ins></span>' : '<span class="nayro-price" data-price>' + escapeHtml(value) + '</span>';
        }
        var sku = qs('[data-product-sku]', rootEl);
        if (sku) { sku.textContent = option.getAttribute('data-variant-sku') || '—'; }

        var available = option.getAttribute('data-variant-available') === 'true';
        var inventory = number(option.getAttribute('data-variant-inventory'));
        var stock = qs('[data-product-stock]', rootEl);
        if (stock) {
          stock.classList.toggle('nayro-stock--out', !available);
          stock.classList.toggle('nayro-stock--low', available && inventory > 0 && inventory <= 5);
          stock.textContent = !available ? (strings.outOfStock || 'Out of stock') : (inventory > 0 && inventory <= 5 ? (strings.lowStock || 'Low stock') : (strings.inStock || 'In stock'));
        }

        var button = qs('[data-add-to-cart]', rootEl);
        var label = qs('[data-add-to-cart-text]', rootEl);
        if (button) { button.disabled = !available; }
        if (label) { label.textContent = available ? (strings.addToCart || 'Add to cart') : (strings.soldOut || 'Sold out'); }

        activateGalleryMedia(rootEl, option.getAttribute('data-variant-media'));
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* AJAX cart                                                          */
  /* ------------------------------------------------------------------ */
  function normalizeUrl(path) {
    if (!path) { return ''; }
    if (/^https?:/i.test(path)) { return path; }
    return path.replace(/^\//, '');
  }
  function cartUrl(key, fallback) {
    var value = cfg[key] || fallback;
    if (!value) { return fallback; }
    if (!/^[a-z]+:\/\//i.test(value)) {
      value = value.replace(/^\//, '');
      return root + value;
    }
    return value;
  }
  function productUrl(product) {
    if (product.url) { return product.url; }
    return root + 'products/' + encodeURIComponent(product.handle);
  }
  function fetchJSON(url, options) {
    return fetch(url, options).then(function (response) {
      return response.text().then(function (text) {
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (e) { data = {}; }
        if (!response.ok) {
          var message = data.description || data.message || strings.error || 'Something went wrong.';
          throw new Error(message);
        }
        return data;
      });
    });
  }
  function setCartCount(count) {
    if (typeof count !== 'number' || isNaN(count)) { return; }
    qsa('[data-cart-count]').forEach(function (el) { el.textContent = count; });
  }
  function refreshCartCount() {
    if (!cfg.cartJs) { return Promise.resolve(); }
    return fetchJSON(cartUrl('cartJs', 'cart.js'))
      .then(function (cart) { setCartCount(cart.item_count); })
      .catch(function () {});
  }
  function replaceDrawer(html) {
    if (!html) { return false; }
    var freshDoc = new DOMParser().parseFromString(html, 'text/html');
    var fresh = qs('#nayro-cart-drawer', freshDoc) || qs('.nayro-cart-drawer', freshDoc);
    var old = qs('#nayro-cart-drawer');
    if (!fresh || !old) { return false; }
    var wasOpen = old.classList.contains('is-open');
    fresh.classList.toggle('is-open', wasOpen);
    fresh.setAttribute('aria-hidden', wasOpen ? 'false' : 'true');
    fresh.inert = !wasOpen;
    if (wasOpen && old._nayroTrigger) { fresh._nayroTrigger = old._nayroTrigger; }
    old.replaceWith(fresh);
    return true;
  }
  function refreshDrawer() {
    return fetch(root + '?section_id=cart-drawer&t=' + Date.now(), {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    }).then(function (response) {
      if (!response.ok) { throw new Error(strings.error || 'Cart could not be refreshed.'); }
      return response.text();
    }).then(function (html) {
      replaceDrawer(html);
    });
  }
  function openCartDrawer() {
    var drawer = qs('#nayro-cart-drawer');
    if (drawer) { openPanel(drawer, qs('#nayro-cart-btn')); }
  }
  function addToCart(formData, trigger, form) {
    var original = null;
    if (trigger) {
      original = trigger.innerHTML;
      trigger.disabled = true;
      trigger.setAttribute('aria-busy', 'true');
    }
    clearError(form);
    if (!formData.has('quantity')) { formData.append('quantity', '1'); }
    formData.append('sections', 'cart-drawer');

    return fetchJSON(cartUrl('cartAddJs', 'cart/add.js'), {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData
    }).then(function (data) {
      if (data && typeof data.item_count !== 'undefined') { setCartCount(data.item_count); }
      if (data && data.sections && data.sections['cart-drawer']) {
        if (replaceDrawer(data.sections['cart-drawer'])) { return null; }
      }
      return refreshDrawer();
    }).then(function () {
      return refreshCartCount();
    }).then(function () {
      openCartDrawer();
      toast(strings.addedToCart || strings.addToCart || 'Added to cart');
      return true;
    }).catch(function (error) {
      var message = error && error.message ? error.message : (strings.error || 'Something went wrong.');
      toast(message);
      setError(form, message);
      return false;
    }).then(function (result) {
      if (trigger) {
        trigger.disabled = false;
        trigger.removeAttribute('aria-busy');
        if (original !== null) { trigger.innerHTML = original; }
      }
      return result;
    });
  }
  function changeCart(line, quantity, trigger) {
    if (trigger) { trigger.setAttribute('aria-busy', 'true'); }
    return fetchJSON(cartUrl('cartChangeJs', 'cart/change.js'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ line: line, quantity: quantity })
    }).then(function (cart) {
      setCartCount(cart.item_count);
      return refreshDrawer();
    }).catch(function (error) {
      toast(error && error.message ? error.message : (strings.error || 'Something went wrong.'));
    }).then(function () {
      if (trigger) { trigger.removeAttribute('aria-busy'); }
    });
  }
  function initCart() {
    document.addEventListener('submit', function (event) {
      var form = event.target.closest('form[data-cart-form]');
      if (!form) { return; }
      event.preventDefault();
      addToCart(new FormData(form), qs('[data-add-to-cart]', form), form);
    });

    document.addEventListener('click', function (event) {
      var qtyButton = event.target.closest('[data-qty-plus], [data-qty-minus]');
      if (qtyButton) {
        event.preventDefault();
        var qtyInput = qs('[data-qty-input]', qtyButton.closest('.nayro-qty-wrap') || qtyButton.closest('form'));
        if (!qtyInput) { return; }
        var qtyValue = parseInt(qtyInput.value, 10) || 1;
        qtyInput.value = Math.max(1, qtyValue + (qtyButton.hasAttribute('data-qty-plus') ? 1 : -1));
        return;
      }

      var quickAdd = event.target.closest('[data-quick-add]');
      if (quickAdd) {
        event.preventDefault();
        var payload = new FormData();
        payload.append('id', quickAdd.getAttribute('data-variant-id'));
        payload.append('quantity', quickAdd.getAttribute('data-quantity') || '1');
        addToCart(payload, quickAdd, quickAdd.closest('form'));
        return;
      }

      var qtyChange = event.target.closest('[data-cart-qty-change]');
      if (qtyChange && qs('#nayro-cart-drawer') && qs('#nayro-cart-drawer').contains(qtyChange)) {
        event.preventDefault();
        var qtyUrl = new URL(qtyChange.href, window.location.origin);
        var quantity = parseInt(qtyUrl.searchParams.get('quantity'), 10);
        var qtyLine = parseInt(qtyChange.getAttribute('data-line') || qtyUrl.searchParams.get('line'), 10);
        if (!isNaN(qtyLine) && !isNaN(quantity)) { changeCart(qtyLine, quantity, qtyChange); }
        return;
      }

      var remove = event.target.closest('[data-cart-remove]');
      if (remove && qs('#nayro-cart-drawer') && qs('#nayro-cart-drawer').contains(remove)) {
        event.preventDefault();
        var removeLine = parseInt(remove.getAttribute('data-line'), 10);
        if (!isNaN(removeLine)) { changeCart(removeLine, 0, remove); }
        return;
      }

      var pageButton = event.target.closest('[data-cart-page-plus], [data-cart-page-minus]');
      if (pageButton) {
        event.preventDefault();
        var row = pageButton.closest('[data-cart-page-row]');
        if (!row) { return; }
        var input = qs('[data-cart-page-qty]', row);
        if (!input) { return; }
        var current = parseInt(input.value, 10) || 1;
        var next = pageButton.hasAttribute('data-cart-page-plus') ? current + 1 : current - 1;
        if (next < 1) {
          var removeLink = qs('[data-cart-page-remove]', row);
          if (removeLink) { window.location.href = removeLink.href; }
          return;
        }
        input.value = next;
        requestSubmit(qs('[data-cart-page-form]'));
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Product data helpers                                               */
  /* ------------------------------------------------------------------ */
  function fetchProduct(handle) {
    if (productCache[handle]) { return Promise.resolve(productCache[handle]); }
    var url = root + 'products/' + encodeURIComponent(handle) + '.js';
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (!response.ok) { throw new Error('Product not found'); }
        return response.json();
      })
      .then(function (product) {
        productCache[handle] = product;
        return product;
      });
  }
  function priceMarkup(product) {
    var price = number(product.price_min != null ? product.price_min : product.price);
    var compare = number(product.compare_at_price);
    var varies = product.price_varies;
    if (!varies && product.variants && product.variants.length > 1) {
      varies = product.variants.some(function (variant) { return number(variant.price) !== price; });
    }
    if (compare > price && compare > 0) {
      return '<span class="nayro-price" data-price><del>' + formatMoneyRaw(compare) + '</del> <ins>' + formatMoneyRaw(price) + '</ins></span>';
    }
    if (varies) {
      return '<span class="nayro-price" data-price><span class="nayro-price__from">' + escapeHtml(strings.from || 'From') + '</span> ' + formatMoneyRaw(price) + '</span>';
    }
    return '<span class="nayro-price" data-price>' + formatMoneyRaw(price) + '</span>';
  }
  function productFrom(product) {
    return {
      handle: product.handle,
      url: productUrl(product),
      title: product.title || '',
      vendor: product.vendor || '',
      type: product.type || '',
      available: !!product.available,
      image: product.featured_image || '',
      priceHtml: priceMarkup(product),
      variants: product.variants || [],
      compare: number(product.compare_at_price),
      price: number(product.price_min != null ? product.price_min : product.price)
    };
  }
  function buildProductCard(product) {
    var data = productFrom(product);
    var image = data.image
      ? '<img class="nayro-product__img nayro-product__img--primary is-active" src="' + escapeAttr(data.image) + '" alt="' + escapeAttr(data.title) + '" loading="lazy" width="700" height="700">'
      : '<span class="nayro-product__placeholder" aria-hidden="true"></span>';
    var badges = '';
    if (data.compare > data.price && data.compare > 0) {
      badges += '<span class="nayro-badge nayro-badge--sale">' + escapeHtml(strings.onSale || 'Sale') + '</span>';
    }
    if (!data.available) {
      badges += '<span class="nayro-badge nayro-badge--out">' + escapeHtml(strings.soldOut || 'Sold out') + '</span>';
    }
    var action = '';
    if (!data.available) {
      action = '<button type="button" class="button button--soldout" disabled>' + escapeHtml(strings.soldOut || 'Sold out') + '</button>';
    } else if (data.variants.length > 1) {
      action = '<a class="button" href="' + escapeAttr(data.url) + '">' + escapeHtml(strings.chooseOptions || 'Choose options') + '</a>';
    } else {
      var variant = data.variants[0];
      if (variant) {
        action = '<button type="button" class="button" data-quick-add data-variant-id="' + escapeAttr(variant.id) + '">' + escapeHtml(strings.addToCart || 'Add to cart') + '</button>';
      }
    }
    var vendor = data.vendor && cfg.showVendor !== false ? '<span class="nayro-product__brand">' + escapeHtml(data.vendor) + '</span>' : '';
    var type = data.type ? '<span class="nayro-product__cat">' + escapeHtml(data.type) + '</span>' : '';
    return '<li class="product nayro-product" data-product-card>' +
      '<div class="nayro-product__media">' +
        '<a class="nayro-product__image-link" href="' + escapeAttr(data.url) + '" aria-label="' + escapeAttr(data.title) + '">' +
          '<span class="nayro-product__slides">' + image + '</span>' +
        '</a>' +
        '<div class="nayro-product__quick">' +
          '<button type="button" class="nayro-quick-btn" data-quick-view="' + escapeAttr(data.handle) + '" aria-label="' + escapeAttr((strings.quickView || 'Quick view') + ': ' + data.title) + '">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>' +
          '</button>' +
          '<button type="button" class="nayro-wish-btn" data-wishlist-handle="' + escapeAttr(data.handle) + '" aria-pressed="false" aria-label="' + escapeAttr((strings.addToWishlist || 'Add to wishlist') + ': ' + data.title) + '">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="nayro-product__body">' +
        '<div class="nayro-product__meta-top">' + type + vendor + '</div>' +
        '<h3 class="nayro-product__title"><a href="' + escapeAttr(data.url) + '">' + escapeHtml(data.title) + '</a></h3>' +
        '<div class="nayro-product__badges">' + badges + '</div>' +
        '<div class="nayro-product__footer">' +
          '<div class="nayro-product__price">' + data.priceHtml + '</div>' +
          '<div class="nayro-product__actions">' + action + '</div>' +
        '</div>' +
      '</div>' +
    '</li>';
  }

  /* ------------------------------------------------------------------ */
  /* Quick view                                                         */
  /* ------------------------------------------------------------------ */
  function quickViewHtml(product) {
    var data = productFrom(product);
    var variants = data.variants;
    var selected = variants.filter(function (variant) { return variant.available; })[0] || variants[0];
    var control;
    if (variants.length > 1) {
      control = '<label class="nayro-visually-hidden" for="QuickViewVariant">' + escapeHtml(strings.chooseOptions || 'Choose options') + '</label><select id="QuickViewVariant" name="id" data-qv-variant>' +
        variants.map(function (variant) {
          return '<option value="' + escapeAttr(variant.id) + '" data-price="' + escapeAttr(variant.price) + '" data-compare="' + escapeAttr(variant.compare_at_price || '') + '" data-available="' + (variant.available ? 'true' : 'false') + '"' + (selected && variant.id === selected.id ? ' selected' : '') + (variant.available ? '' : ' disabled') + '>' + escapeHtml(variant.title) + (variant.available ? '' : ' — ' + escapeHtml(strings.soldOut || 'Sold out')) + '</option>';
        }).join('') + '</select>';
    } else {
      control = '<input type="hidden" name="id" value="' + escapeAttr(selected ? selected.id : '') + '" data-qv-variant>';
    }
    var description = product.description ? '<div class="nayro-quickview__desc">' + product.description + '</div>' : '';
    var media = data.image ? '<img src="' + escapeAttr(data.image) + '" alt="' + escapeAttr(data.title) + '" loading="eager">' : '';
    return '<div class="nayro-quickview__grid">' +
      '<div class="nayro-quickview__media">' + media + '</div>' +
      '<div>' +
        '<h2 class="nayro-quickview__title">' + escapeHtml(data.title) + '</h2>' +
        '<div class="nayro-quickview__price" data-qv-price>' + data.priceHtml + '</div>' +
        description +
        '<form class="nayro-quickview__form" data-cart-form data-quick-view-form>' +
          control +
          '<div class="nayro-qty-wrap">' +
            '<button type="button" class="nayro-qty-btn" data-qv-minus aria-label="' + escapeAttr(strings.quantity || 'Quantity') + ' -">−</button>' +
            '<label class="nayro-visually-hidden" for="QuickViewQty">' + escapeHtml(strings.quantity || 'Quantity') + '</label>' +
            '<input id="QuickViewQty" class="qty" type="number" name="quantity" value="1" min="1" inputmode="numeric" data-qv-qty>' +
            '<button type="button" class="nayro-qty-btn" data-qv-plus aria-label="' + escapeAttr(strings.quantity || 'Quantity') + ' +">+</button>' +
          '</div>' +
          '<button type="submit" class="nayro-btn nayro-btn--primary" data-add-to-cart' + (selected && selected.available ? '' : ' disabled') + '>' + escapeHtml(selected && selected.available ? (strings.addToCart || 'Add to cart') : (strings.soldOut || 'Sold out')) + '</button>' +
          '<a class="nayro-btn nayro-btn--ghost" href="' + escapeAttr(data.url) + '">' + escapeHtml(strings.viewProduct || 'View product') + '</a>' +
          '<p class="nayro-quickview__error" data-form-error role="alert" hidden></p>' +
        '</form>' +
      '</div>' +
    '</div>';
  }
  function openQuickView(handle, trigger) {
    var modal = qs('#nayro-quickview');
    var content = qs('#nayro-quickview-content');
    if (!modal || !content) { return; }
    quickViewTrigger = trigger || document.activeElement;
    content.innerHTML = '<p class="nayro-quickview__error">' + escapeHtml(strings.loading || 'Loading') + '…</p>';
    modal.hidden = false;
    modal.removeAttribute('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('nayro-quickview-open');
    syncOverlay();
    var closeButton = qs('[data-close-quickview]', modal);
    if (closeButton) { closeButton.focus({ preventScroll: true }); }
    fetchProduct(handle).then(function (product) {
      content.innerHTML = quickViewHtml(product);
      syncWishlistButtons();
    }).catch(function () {
      content.innerHTML = '<p class="nayro-quickview__error">' + escapeHtml(strings.error || 'Something went wrong.') + '</p>';
    });
  }
  function closeQuickView(restoreFocus) {
    var modal = qs('#nayro-quickview');
    if (!modal) { return; }
    modal.hidden = true;
    modal.setAttribute('hidden', '');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('nayro-quickview-open');
    syncOverlay();
    if (restoreFocus !== false && quickViewTrigger && document.contains(quickViewTrigger)) {
      quickViewTrigger.focus({ preventScroll: true });
    }
  }
  function initQuickView() {
    document.addEventListener('click', function (event) {
      var opener = event.target.closest('[data-quick-view]');
      if (opener) {
        event.preventDefault();
        openQuickView(opener.getAttribute('data-quick-view'), opener);
        return;
      }
      var closer = event.target.closest('[data-close-quickview]');
      if (closer) {
        event.preventDefault();
        closeQuickView();
      }
    });

    document.addEventListener('click', function (event) {
      var minus = event.target.closest('[data-qv-minus], [data-qv-plus]');
      if (!minus) { return; }
      var input = qs('[data-qv-qty]', minus.closest('form'));
      if (!input) { return; }
      var value = parseInt(input.value, 10) || 1;
      input.value = Math.max(1, value + (minus.hasAttribute('data-qv-plus') ? 1 : -1));
    });

    document.addEventListener('change', function (event) {
      var select = event.target.closest('[data-qv-variant]');
      if (!select || select.tagName !== 'SELECT') { return; }
      var modal = select.closest('#nayro-quickview');
      if (!modal) { return; }
      var option = select.options[select.selectedIndex];
      var price = qs('[data-qv-price]', modal);
      if (price && option) {
        var value = option.getAttribute('data-price') || '';
        var compare = option.getAttribute('data-compare') || '';
        price.innerHTML = compare ? '<span class="nayro-price"><del>' + escapeHtml(formatMoneyRaw(compare)) + '</del> <ins>' + escapeHtml(formatMoneyRaw(value)) + '</ins></span>' : '<span class="nayro-price">' + escapeHtml(formatMoneyRaw(value)) + '</span>';
      }
      var button = qs('[data-add-to-cart]', modal);
      if (button && option) {
        var available = option.getAttribute('data-available') === 'true';
        button.disabled = !available;
        button.textContent = available ? (strings.addToCart || 'Add to cart') : (strings.soldOut || 'Sold out');
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Wishlist                                                           */
  /* ------------------------------------------------------------------ */
  function syncWishlist() {
    var active = getList(WISHLIST_KEY);
    qsa('[data-wishlist-handle]').forEach(function (button) {
      var handle = button.getAttribute('data-wishlist-handle');
      var inList = active.indexOf(handle) > -1;
      button.classList.toggle('is-active', inList);
      button.setAttribute('aria-pressed', inList ? 'true' : 'false');
      var label = qs('[data-wishlist-label]', button);
      if (label) {
        label.textContent = inList ? (strings.removeFromWishlist || 'Remove from wishlist') : (strings.addToWishlist || 'Add to wishlist');
      }
    });
    qsa('[data-wishlist-count]').forEach(function (el) { el.textContent = active.length; });
  }
  function renderWishlist() {
    var page = qs('[data-wishlist-page]');
    if (!page) { return; }
    var grid = qs('[data-wishlist-grid]', page);
    var empty = qs('[data-wishlist-empty]', page);
    if (!grid) { return; }
    var handles = getList(WISHLIST_KEY);
    if (!handles.length) {
      grid.hidden = true;
      if (empty) { empty.hidden = false; }
      syncWishlist();
      return;
    }
    Promise.all(handles.map(function (handle) {
      return fetchProduct(handle).catch(function () { return null; });
    })).then(function (products) {
      var valid = products.filter(Boolean);
      if (!valid.length) {
        grid.hidden = true;
        if (empty) { empty.hidden = false; }
        return;
      }
      grid.innerHTML = valid.map(buildProductCard).join('');
      grid.hidden = false;
      if (empty) { empty.hidden = true; }
      syncWishlist();
    });
  }
  function initWishlist() {
    document.addEventListener('click', function (event) {
      var button = event.target.closest('[data-wishlist-handle]');
      if (!button) { return; }
      event.preventDefault();
      var handle = button.getAttribute('data-wishlist-handle');
      var list = getList(WISHLIST_KEY);
      var index = list.indexOf(handle);
      var added = index === -1;
      if (added) { list.push(handle); } else { list.splice(index, 1); }
      setList(WISHLIST_KEY, list);
      syncWishlist();
      toast(added ? (strings.addToWishlist || 'Added to wishlist') : (strings.removeFromWishlist || 'Removed from wishlist'));
      if (qs('[data-wishlist-page]')) { renderWishlist(); }
    });
    syncWishlist();
    renderWishlist();
  }

  /* ------------------------------------------------------------------ */
  /* Recently viewed                                                    */
  /* ------------------------------------------------------------------ */
  function currentProductHandle() {
    var rootEl = qs('[data-product-root]');
    return rootEl ? rootEl.getAttribute('data-product-handle') : '';
  }
  function recordRecentlyViewed() {
    var handle = currentProductHandle();
    if (!handle) { return; }
    var list = getList(RECENT_KEY).filter(function (item) { return item !== handle; });
    list.unshift(handle);
    setList(RECENT_KEY, list.slice(0, 12));
  }
  function initRecentlyViewed() {
    var section = qs('[data-recently-viewed]');
    if (!section) { return; }
    var grid = qs('[data-recently-viewed-grid]', section);
    var empty = qs('[data-recently-viewed-empty]', section);
    if (!grid) { return; }
    var limit = parseInt(grid.getAttribute('data-limit'), 10) || 4;
    var current = currentProductHandle();
    var handles = getList(RECENT_KEY).filter(function (item) { return item !== current; }).slice(0, limit);
    if (!handles.length) { section.hidden = true; return; }
    Promise.all(handles.map(function (handle) {
      return fetchProduct(handle).catch(function () { return null; });
    })).then(function (products) {
      var valid = products.filter(Boolean);
      if (!valid.length) {
        section.hidden = true;
        return;
      }
      grid.innerHTML = valid.map(buildProductCard).join('');
      grid.hidden = false;
      if (empty) { empty.hidden = true; }
      section.hidden = false;
      syncWishlist();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Product recommendations                                            */
  /* ------------------------------------------------------------------ */
  function initRecommendations() {
    qsa('[data-product-recommendations]').forEach(function (section) {
      if (!section.hidden) { return; }
      var url = section.getAttribute('data-url');
      if (!url) { return; }
      fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (response) { return response.ok ? response.text() : ''; })
        .then(function (html) {
          if (!html) { return; }
          var parsed = new DOMParser().parseFromString(html, 'text/html');
          var fresh = qs('[data-product-recommendations]', parsed);
          if (!fresh || fresh.hasAttribute('hidden')) { return; }
          section.innerHTML = fresh.innerHTML;
          section.hidden = false;
          syncWishlist();
        })
        .catch(function () {});
    });
  }

  /* ------------------------------------------------------------------ */
  /* Brand filter search                                                */
  /* ------------------------------------------------------------------ */
  function initBrandSearch() {
    var inputs = qsa('[data-brand-search]');
    inputs.forEach(function (input) {
      var group = input.closest('[data-brand-group]') || document;
      var list = qs('[data-brand-list]', group);
      var empty = qs('[data-brand-empty]', group);
      if (!list) { return; }
      var items = qsa('[data-brand-name]', list);
      function apply() {
        var term = input.value.trim().toLowerCase();
        var shown = 0;
        items.forEach(function (item) {
          var name = item.getAttribute('data-brand-name') || '';
          var match = !term || name.indexOf(term) !== -1;
          item.hidden = !match;
          if (match) { shown += 1; }
        });
        if (empty) { empty.hidden = shown !== 0; }
        list.hidden = shown === 0;
      }
      input.addEventListener('input', apply);
      input.addEventListener('search', apply);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */
  function init() {
    initTheme();
    initPanels();
    initHeader();
    initHeroSliders();
    initCountdowns();
    initCountUps();
    initTabs();
    initShopTools();
    initConfirmForms();
    initAddressProvinces();
    initGaller(document);
    initVariantSelectors();
    initCart();
    initQuickView();
    initWishlist();
    recordRecentlyViewed();
    initRecentlyViewed();
    initRecommendations();
    initBrandSearch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
