/* ============================================================
   翰林斉家 — interaction engine
   preloader / cursor / reveals / pinned horizontal / marquee /
   counters / magnetic / hanko / areas / nav theme / clock
   ============================================================ */

const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
const mqFine = window.matchMedia("(pointer: fine)");
const mqMobile = window.matchMedia("(max-width: 860px)");
const mqShort = window.matchMedia("(max-height: 640px)");
const mqBurger = window.matchMedia("(max-width: 1100px)");

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
/* dt-normalized smoothing: k per 16.67ms frame */
const smooth = (base, dt) => 1 - Math.pow(1 - base, dt / 16.67);

/* dev helper for screenshot review: ?static=1 forces all reveals, ?jump=#id scrolls there */
const devParams = new URLSearchParams(location.search);
const devStatic = devParams.has("static");
if (devStatic) document.documentElement.classList.add("is-static");

/* ---------- Osaka clock ---------- */
{
  const el = document.getElementById("clock");
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const tick = () => { if (el) el.textContent = fmt.format(new Date()); };
  tick();
  setInterval(tick, 10_000);
}

/* ---------- hero title char split (stagger runs across lines) ---------- */
{
  let splitIdx = 0;
  document.querySelectorAll("[data-split]").forEach((node) => {
    const frag = document.createDocumentFragment();
    const YAKU = "、。「」・（）";
    const walk = (parent, into) => {
      [...parent.childNodes].forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          [...child.textContent].forEach((ch) => {
            const s = document.createElement("span");
            s.className = YAKU.includes(ch) ? "ch ch--yaku" : "ch";
            s.textContent = ch;
            s.style.transitionDelay = `${0.055 * splitIdx++}s`;
            into.appendChild(s);
          });
        } else {
          const cl = child.cloneNode(false);
          walk(child, cl);
          into.appendChild(cl);
        }
      });
    };
    walk(node, frag);
    node.textContent = "";
    node.appendChild(frag);
  });
}

/* ---------- preloader: gated on fonts + first city frame + min dwell ---------- */
{
  const loader = document.getElementById("loader");
  if (loader && !devStatic) {
    document.body.classList.add("is-locked");
    const count = document.getElementById("loaderCount");
    const fill = loader.querySelector(".loader-kanji-fill");
    let seen = null;
    try { seen = sessionStorage.getItem("hanlin-seen"); } catch { /* storage blocked */ }
    const minDwell = mqReduce.matches ? 50 : (seen ? 600 : 1500);

    let ready = false;
    const fontsReady = document.fonts?.ready || Promise.resolve();
    const cityFrame = window.__hanlinCityFrame ? Promise.resolve() : new Promise((r) => {
      addEventListener("hanlin:cityframe", r, { once: true });
      setTimeout(r, 3200); // never hold the door for a missing GPU
    });
    const dwell = new Promise((r) => setTimeout(r, minDwell));
    Promise.all([fontsReady, cityFrame, dwell]).then(() => { ready = true; });

    let p = 0;
    let prev = performance.now();
    const step = (now) => {
      const dt = Math.min(now - prev, 50);
      prev = now;
      p = ready ? lerp(p, 1.02, smooth(0.14, dt)) : lerp(p, 0.92, smooth(0.03, dt));
      const n = Math.min(100, Math.round(p * 100));
      if (count) count.textContent = String(n).padStart(3, "0");
      if (fill) fill.style.clipPath = `inset(${100 - n}% 0 0 0)`;
      if (n < 100) { requestAnimationFrame(step); return; }
      loader.classList.add("is-done");
      try { sessionStorage.setItem("hanlin-seen", "1"); } catch { /* storage blocked */ }
      document.body.classList.remove("is-locked");
      /* let the ink curtain finish most of its lift before the type rises */
      setTimeout(() => document.body.classList.add("is-loaded"), 480);
      setTimeout(() => loader.remove(), 1600);
    };
    requestAnimationFrame(step);
  } else if (loader) {
    loader.remove();
    document.body.classList.add("is-loaded");
  }
}

/* ---------- custom cursor (fine pointers, motion allowed) ---------- */
const cursorState = { down: false };
if (mqFine.matches && !mqReduce.matches) {
  document.documentElement.classList.add("has-cursor");
  const cursor = document.getElementById("cursor");
  const dot = document.getElementById("cursorDot");
  const ring = document.getElementById("cursorRing");
  const label = document.getElementById("cursorLabel");
  let mx = innerWidth / 2, my = innerHeight / 2;
  let rx = mx, ry = my;
  let press = 0;

  addEventListener("mousemove", (e) => {
    mx = e.clientX; my = e.clientY;
    if (!cursor.classList.contains("is-awake")) {
      rx = mx; ry = my;
      cursor.classList.add("is-awake");
    }
  }, { passive: true });
  document.documentElement.addEventListener("mouseleave", () => cursor.classList.remove("is-awake"));
  addEventListener("mousedown", () => { cursorState.down = true; cursor.classList.add("is-down"); });
  addEventListener("mouseup", () => { cursorState.down = false; cursor.classList.remove("is-down"); });

  const labelFor = (t) => {
    if (t.dataset.cursorLabel) return t.dataset.cursorLabel;
    if (t.dataset.cursor === "drag") return "繰る";
    const href = t.getAttribute("href") || "";
    if (href.startsWith("mailto:")) return "送る";
    if (href.startsWith("tel:")) return "話す";
    if (t.matches("button, .btn")) return "押す";
    return "見る";
  };
  const hitTest = (target) => {
    const t = target && target.closest ? target.closest("[data-cursor], a, button") : null;
    cursor.classList.toggle("is-hover", !!t);
    if (t) label.textContent = labelFor(t);
  };
  document.addEventListener("mouseover", (e) => hitTest(e.target));
  /* re-hit-test when scrolling moves the page under a stationary pointer */
  let scrollHitTimer = 0;
  addEventListener("scroll", () => {
    clearTimeout(scrollHitTimer);
    scrollHitTimer = setTimeout(() => hitTest(document.elementFromPoint(mx, my)), 90);
  }, { passive: true });

  let prevT = performance.now();
  const loop = (now) => {
    const dt = Math.min(now - prevT, 50);
    prevT = now;
    rx = lerp(rx, mx, smooth(0.16, dt));
    ry = lerp(ry, my, smooth(0.16, dt));
    press = lerp(press, cursorState.down ? 1 : 0, smooth(0.3, dt));
    dot.style.transform = `translate(${mx}px, ${my}px)`;
    ring.style.transform = `translate(${rx}px, ${ry}px) scale(${1 - press * 0.18})`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/* ---------- reveal observer (with sibling stagger inside [data-stagger]) ---------- */
{
  const clearDelay = (e) => { e.target.style.transitionDelay = ""; };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      const group = el.closest("[data-stagger]");
      if (group) {
        const sibs = [...group.querySelectorAll("[data-reveal]")];
        const idx = sibs.indexOf(el);
        el.style.transitionDelay = `${Math.max(0, idx) * 0.09}s`;
        el.addEventListener("transitionend", clearDelay, { once: true });
      }
      el.classList.add("is-in");
      io.unobserve(el);
    });
  }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });

  document.querySelectorAll("[data-reveal], .prop-art, .sv-card").forEach((el) => io.observe(el));
}

/* ---------- counters ---------- */
{
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  const render = (el, v, pad) => {
    el.textContent = pad ? String(v).padStart(pad, "0") : v.toLocaleString("ja-JP");
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      const el = en.target;
      const target = parseFloat(el.dataset.count);
      const pad = parseInt(el.dataset.countPad || "0", 10);
      const dur = mqReduce.matches ? 10 : 1600;
      const t0 = performance.now();
      const step = (now) => {
        const p = clamp01((now - t0) / dur);
        render(el, Math.round(ease(p) * target), pad);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, { threshold: 0.6 });
  document.querySelectorAll("[data-count]").forEach((el) => {
    if (devStatic) {
      render(el, parseFloat(el.dataset.count), parseInt(el.dataset.countPad || "0", 10));
    } else {
      io.observe(el);
    }
  });
}

/* ---------- hanko stamp: after the quote finishes its reveal ---------- */
{
  const hanko = document.getElementById("hanko");
  const quote = hanko?.closest(".phil-quote");
  if (hanko && quote) {
    let stamped = false;
    const stamp = () => {
      if (stamped) return;
      stamped = true;
      hanko.classList.add("is-stamped");
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        quote.addEventListener("transitionend", (e) => {
          if (e.propertyName === "opacity") setTimeout(stamp, 260);
        }, { once: true });
        setTimeout(stamp, 1500); // fallback if the reveal already ran
      });
    }, { threshold: 0.5 });
    io.observe(quote);
  }
}

/* ---------- area rows (mouse + keyboard) ---------- */
{
  const rows = document.querySelectorAll(".area-row");
  const arts = document.querySelectorAll(".area-svg");
  const artLabel = document.getElementById("areaArtLabel");
  const LABELS = {
    chuo: "CHUO-KU / 中央区",
    kita: "KITA-KU / 北区",
    konohana: "KONOHANA-KU / 此花区",
    naniwa: "NANIWA-KU / 浪速区",
    nishi: "NISHI-KU / 西区",
  };
  const activate = (row) => {
    rows.forEach((r) => {
      const on = r === row;
      r.classList.toggle("is-active", on);
      r.setAttribute("aria-pressed", String(on));
      r.querySelector(".area-desc")?.setAttribute("aria-hidden", String(!on));
    });
    arts.forEach((a) => a.classList.toggle("is-active", a.dataset.art === row.dataset.area));
    if (artLabel) artLabel.textContent = LABELS[row.dataset.area] || "";
  };
  rows.forEach((row) => {
    row.addEventListener("mouseenter", () => activate(row));
    row.addEventListener("focus", () => activate(row));
    row.addEventListener("click", () => activate(row));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate(row);
      }
    });
  });
  if (rows.length) activate(rows[0]);
}

/* ---------- magnetic buttons (rAF-driven, cached center) ---------- */
const magnetics = [];
if (mqFine.matches && !mqReduce.matches) {
  document.querySelectorAll("[data-magnetic]").forEach((el) => {
    const m = { el, inner: el.querySelector("span"), cx: 0, cy: 0, tx: 0, ty: 0, x: 0, y: 0, active: false };
    el.addEventListener("mouseenter", () => {
      const r = el.getBoundingClientRect();
      m.cx = r.left + r.width / 2 - m.x;
      m.cy = r.top + r.height / 2 - m.y;
      m.active = true;
    });
    el.addEventListener("mousemove", (e) => {
      const dx = e.clientX - m.cx;
      const dy = e.clientY - m.cy;
      m.tx = dx * 0.3;
      m.ty = dy * 0.3;
    });
    el.addEventListener("mouseleave", () => { m.active = false; m.tx = 0; m.ty = 0; });
    magnetics.push(m);
  });
}

/* ---------- mobile menu ---------- */
{
  const burger = document.getElementById("navBurger");
  const mnav = document.getElementById("mnav");
  if (burger && mnav) {
    let lockY = 0;
    mnav.inert = true;
    const toggle = (open) => {
      burger.setAttribute("aria-expanded", String(open));
      mnav.classList.toggle("is-open", open);
      mnav.setAttribute("aria-hidden", String(!open));
      mnav.inert = !open;
      if (open) {
        lockY = scrollY;
        document.body.style.position = "fixed";
        document.body.style.top = `-${lockY}px`;
        document.body.style.width = "100%";
        mnav.querySelector("a")?.focus({ preventScroll: true });
      } else {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        scrollTo({ top: lockY, behavior: "instant" });
        burger.focus({ preventScroll: true });
      }
    };
    const isOpen = () => burger.getAttribute("aria-expanded") === "true";
    burger.addEventListener("click", () => toggle(!isOpen()));
    mnav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => toggle(false)));
    /* header links/CTA sit above the open menu — close it before navigating */
    document.querySelectorAll(".nav a").forEach((a) =>
      a.addEventListener("click", () => { if (isOpen()) toggle(false); }));
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen()) toggle(false);
      if (e.key === "Tab" && isOpen()) {
        const items = [burger, ...mnav.querySelectorAll("a")];
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    mqBurger.addEventListener("change", (e) => { if (!e.matches && isOpen()) toggle(false); });
  }
}

/* ============================================================
   scroll-driven systems (single rAF, measurements cached)
   ============================================================ */
const nav = document.getElementById("nav");
const progressBar = document.getElementById("progressBar");
const services = document.getElementById("services");
const servicesPin = document.getElementById("servicesPin");
const svTrack = document.getElementById("svTrack");
const svProgressBar = document.getElementById("svProgressBar");
const marquee = document.querySelector(".marquee");
const marqueeTracks = [...document.querySelectorAll(".marquee-track")];

/* cached measurements */
const M = { navSections: [], svTop: 0, svTotal: 0, svDist: 0, docMax: 1, marqueeHalf: [0, 0] };

const svStatic = () => mqMobile.matches || mqShort.matches || mqReduce.matches;

function measure() {
  /* toggle layout modes FIRST — all measurements below depend on them */
  if (services && servicesPin && svTrack) {
    document.documentElement.classList.toggle("sv-static", svStatic());
    if (svStatic()) svTrack.style.transform = "";
  }
  M.navSections = [...document.querySelectorAll("[data-nav]")].map((el) => ({
    top: el.offsetTop, bottom: el.offsetTop + el.offsetHeight, theme: el.dataset.nav,
  }));
  M.docMax = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  if (services && servicesPin && svTrack && !svStatic()) {
    M.svTop = services.offsetTop;
    M.svTotal = Math.max(1, services.offsetHeight - servicesPin.offsetHeight);
    M.svDist = Math.max(0, svTrack.scrollWidth - document.documentElement.clientWidth + innerWidth * 0.06);
  }
  M.marqueeHalf = marqueeTracks.map((t) => t.scrollWidth / 2); // transform-free width
}
addEventListener("resize", measure);
addEventListener("load", measure);
document.fonts?.ready?.then(measure);
[mqMobile, mqShort, mqReduce].forEach((mq) => mq.addEventListener("change", measure));

/* nav hide/show with intent threshold */
let navAcc = 0;
function navShowHide(y, dy) {
  nav.classList.toggle("is-scrolled", y > 40);
  if (Math.sign(dy) !== Math.sign(navAcc)) navAcc = 0;
  navAcc += dy;
  if (navAcc > 24 && y > 420) nav.classList.add("is-hidden");
  else if (navAcc < -24 || y < 200) nav.classList.remove("is-hidden");
}
nav.addEventListener("focusin", () => nav.classList.remove("is-hidden"));

function navTheme(y) {
  const probe = y + 60;
  let theme = "dark";
  for (const s of M.navSections) {
    if (s.top <= probe && s.bottom > probe) { theme = s.theme; break; }
  }
  if (nav.dataset.themeNow !== theme) nav.dataset.themeNow = theme;
}

/* pinned services: lerped track + drag-to-scrub */
let svCur = 0;
function servicesScroll(y, dt) {
  if (!services || !svTrack || svStatic()) return;
  const pTarget = clamp01((y - M.svTop) / M.svTotal);
  svCur = Math.abs(pTarget - svCur) < 0.0004 ? pTarget : lerp(svCur, pTarget, smooth(0.13, dt));
  svTrack.style.transform = `translate3d(${-svCur * M.svDist}px, 0, 0)`;
  if (svProgressBar) svProgressBar.style.transform = `scaleX(${svCur})`;
}
/* keyboard: keep the focused card in view by jumping the scroll position */
svTrack?.addEventListener("focusin", (e) => {
  if (svStatic() || !e.target.matches(":focus-visible")) return;
  const card = e.target.closest(".sv-card");
  if (!card) return;
  const p = clamp01((card.offsetLeft - innerWidth * 0.2) / Math.max(1, M.svDist));
  scrollTo({ top: M.svTop + p * M.svTotal, behavior: "instant" });
});
/* drag to scrub the scroll (the cursor promises 繰る) */
if (svTrack && mqFine.matches) {
  let dragging = false, startX = 0, startY = 0;
  svTrack.addEventListener("pointerdown", (e) => {
    if (svStatic() || e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    startY = scrollY;
    svTrack.style.willChange = "transform";
  });
  addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    scrollTo({ top: startY - dx * (M.svTotal / Math.max(1, M.svDist)), behavior: "instant" });
  }, { passive: true });
  const endDrag = () => { dragging = false; svTrack.style.willChange = ""; };
  addEventListener("pointerup", endDrag);
  addEventListener("pointercancel", endDrag);
}

/* marquee: IO-gated, hover-pausable, velocity-coupled, ink-skew */
let marqueeVisible = true;
let marqueePause = 0; // 0 = running, 1 = paused (lerped)
let marqueeHover = false;
const marqueeOffset = [0, 0];
if (marquee) {
  new IntersectionObserver(([en]) => { marqueeVisible = en.isIntersecting; }).observe(marquee);
  marquee.addEventListener("pointerenter", () => { marqueeHover = true; });
  marquee.addEventListener("pointerleave", () => { marqueeHover = false; });
}
function marqueeStep(dt, vel) {
  if (!marqueeTracks.length || mqReduce.matches || !marqueeVisible) return;
  marqueePause = lerp(marqueePause, marqueeHover ? 1 : 0, smooth(0.12, dt));
  const run = 1 - marqueePause;
  const boost = Math.min(Math.abs(vel) * 2.6, 4.5);
  const skew = Math.max(-6, Math.min(6, vel * 7));
  marqueeTracks.forEach((track, i) => {
    const dir = i === 0 ? -1 : 1;
    const speed = ((i === 0 ? 0.05 : 0.032) + boost * 0.04) * run;
    marqueeOffset[i] += dir * speed * dt;
    const half = M.marqueeHalf[i];
    if (half > 0) {
      let off = marqueeOffset[i] % half;
      if (dir === 1 && off > 0) off -= half;
      track.style.transform = `translate3d(${off}px, 0, 0) skewX(${skew * run}deg)`;
    }
  });
}

/* main loop */
let lastY = scrollY;
let scrollVel = 0; // px per ms, smoothed
let prevT = performance.now();
let firstRaf = true;
function raf(now) {
  const dt = Math.min(now - prevT, 50);
  prevT = now;
  const y = scrollY;
  const dy = y - lastY;
  scrollVel = lerp(scrollVel, dy / Math.max(dt, 1), smooth(0.2, dt));

  if (dy !== 0 || firstRaf) {
    firstRaf = false;
    navTheme(y);
    navShowHide(y, dy);
    if (progressBar) progressBar.style.transform = `scaleX(${y / M.docMax})`;
  }
  servicesScroll(y, dt);
  marqueeStep(dt, scrollVel);

  for (const m of magnetics) {
    m.x = lerp(m.x, m.active ? m.tx : 0, smooth(0.16, dt));
    m.y = lerp(m.y, m.active ? m.ty : 0, smooth(0.16, dt));
    if (Math.abs(m.x) > 0.05 || Math.abs(m.y) > 0.05 || m.active) {
      m.el.style.transform = `translate(${m.x}px, ${m.y}px)`;
      if (m.inner) m.inner.style.transform = `translate(${m.x * 0.35}px, ${m.y * 0.35}px)`;
    } else if (m.el.style.transform) {
      m.el.style.transform = "";
      if (m.inner) m.inner.style.transform = "";
    }
  }

  lastY = y;
  requestAnimationFrame(raf);
}
measure();
requestAnimationFrame(raf);

/* seal-press feedback on primary CTAs */
document.querySelectorAll(".btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    btn.classList.remove("is-pressed");
    void btn.offsetWidth; // restart animation
    btn.classList.add("is-pressed");
    btn.addEventListener("animationend", () => btn.classList.remove("is-pressed"), { once: true });
  });
});

/* dev jump (after layout settles) */
if (devParams.get("jump")) {
  addEventListener("load", () => {
    setTimeout(() => {
      const target = document.querySelector(devParams.get("jump"));
      if (target) scrollTo({ top: target.getBoundingClientRect().top + scrollY + (parseInt(devParams.get("off") || "0", 10)), behavior: "instant" });
    }, devStatic ? 300 : 2600);
  });
}
