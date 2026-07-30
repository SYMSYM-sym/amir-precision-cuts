/**
 * Interactions. Hand-written and DELIBERATELY free of business facts — this is
 * the one front-end file derive does not render, so anything business-specific
 * here is a weld that survives every swap test.
 *
 * The reference version had two things this one does not:
 *
 *  1. An "XOR-obfuscated" phone number. The transform was
 *     `.map((n,i) => n ^ (i&1)).map((n,i) => n ^ (i&1))` — XOR with the same
 *     mask twice is the identity function, so the literal array WAS the phone
 *     number, digit for digit. It was security theatre, and it welded a
 *     business fact into a static asset. Phone numbers now render server-side
 *     from `booking.phone`, and only when `booking.publish_phone` is true.
 *
 *  2. A #contactForm that had no endpoint and told the visitor "your note is
 *     queued" (14 §D). A form that silently drops messages is worse than no
 *     form, so there isn't one. Contact routes to booking.url or to a channel
 *     the business actually publishes.
 *
 * DOM CONTRACT (04 §C) — renaming any of these fails SILENTLY:
 *   #year · .faq__item · #nav · #navToggle · #navMobile · .reveal
 * (.js-tel was in this list until the XOR phone obfuscation came out. No code
 *  reads it now, so listing it here was a contract nothing honoured.)
 * The bucket filter and Load-more are NOT here; they are an inline IIFE in
 * templates/blog-index.html. Look in the wrong file and you'll conclude the
 * filter doesn't exist.
 */
(function () {
  'use strict';

  // --- current year ---
  var y = document.getElementById('year');
  if (y) y.textContent = String(new Date().getFullYear());

  // --- sticky nav state ---
  var nav = document.getElementById('nav');
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // --- mobile menu: toggle, focus trap, Esc to close (04 §E) ---
  var toggle = document.getElementById('navToggle');
  var mobile = document.getElementById('navMobile');
  if (nav && toggle && mobile) {
    var setOpen = function (open) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (open) {
        var first = mobile.querySelector('a');
        if (first) first.focus();
      }
    };
    toggle.addEventListener('click', function () {
      setOpen(nav.classList.contains('is-open') === false);
    });
    mobile.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
      if (e.key !== 'Tab' || !nav.classList.contains('is-open')) return;
      var items = mobile.querySelectorAll('a, button');
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  // --- FAQ accordion: one open at a time ---
  var faqItems = document.querySelectorAll('.faq__item');
  Array.prototype.forEach.call(faqItems, function (item) {
    item.addEventListener('toggle', function () {
      if (!item.open) return;
      Array.prototype.forEach.call(faqItems, function (other) {
        if (other !== item) other.open = false;
      });
    });
  });

  // --- reveal on scroll (skipped entirely under prefers-reduced-motion) ---
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var targets = document.querySelectorAll(
    '.hero__title, .hero__lede, .hero__cta, .hero__meta, .hero__facts, .section__head,' +
    '.about__copy, .about__card, .about__strip, .service-row, .service-card,' +
    '.service-list__item, .service-table__row, .care__col, .care-steps__step,' +
    '.faq__item, .visit__copy, .visit__aside, .visit__panel'
  );
  if (reduce || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(targets, function (el) { el.classList.add('is-visible'); });
  } else {
    Array.prototype.forEach.call(targets, function (el) { el.classList.add('reveal'); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    Array.prototype.forEach.call(targets, function (el) { io.observe(el); });
  }

  // --- smooth scroll with sticky-nav offset ---
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href');
    if (!id || id === '#') return;
    var target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    var offset = nav ? nav.offsetHeight : 0;
    var top = target.getBoundingClientRect().top + window.scrollY - offset - 8;
    window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
    history.replaceState(null, '', id);
  });
})();
