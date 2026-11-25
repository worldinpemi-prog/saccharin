import { api, DEMO } from './api.js';
import { esc, href, $, $$, clamp, lerp, wait, reduceMotion, KIND_LABEL, fmtDate, ICON, media, stageHTML, cardHTML, toast } from './util.js';

const main = $('#main');
const nav = $('.nav');
const curtain = $('.curtain');

let site = null; // 사이트 설정 캐시
let linksCache = null;
let cleanups = [];
let scrollFns = [];
let resizeFns = [];
let currentPath = null;
let firstRender = true;

/* ───────────── 공통: 데이터 ───────────── */

async function getSite() {
  if (!site) site = await api.site().catch(() => ({ nickname: 'saccharin' }));
  return site;
}
async function getLinks() {
  if (!linksCache) linksCache = await api.links().catch(() => []);
  return linksCache;
}
export function invalidateCache() {
  site = null;
  linksCache = null;
}

/* ───────────── 스크롤 엔진 ───────────── */

let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const y = window.scrollY;
    for (const fn of scrollFns) fn(y);
    updateNav(y);
  });
}
window.addEventListener('scroll', onScroll, { passive: true });
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    for (const fn of resizeFns) fn();
    onScroll();
  }, 120);
});

function updateNav(y) {
  const probe = 32;
  let tone = 'dark';
  for (const el of $$('[data-tone-zone="light"]', main)) {
    const r = el.getBoundingClientRect();
    if (r.top <= probe && r.bottom >= probe) {
      tone = 'light';
      break;
    }
  }
  nav.dataset.tone = tone;
  const overHero = $('.hero', main) && y < $('.hero', main).offsetHeight - probe;
  nav.classList.toggle('is-solid', y > 8 && !overHero);
  nav.classList.toggle('over-hero', !!overHero && !document.body.classList.contains('menu-open'));
}

let io;
function observeReveals() {
  if (io) io.disconnect();
  if (reduceMotion() || !('IntersectionObserver' in window)) {
    $$('.rv, .rv-img', main).forEach((el) => el.classList.add('in'));
    return;
  }
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
  );
  $$('.rv, .rv-img', main).forEach((el) => io.observe(el));
}

/* ───────────── 라우터 ───────────── */

function currentLocation() {
  if (DEMO) return location.hash.slice(1) || '/';
  return location.pathname + location.search;
}

const routes = [
  [/^\/$/, 'home'],
  [/^\/works\/?$/, 'works'],
  [/^\/works\/([^/?#]+)/, 'work'],
  [/^\/wip\/?$/, 'wip'],
  [/^\/ask\/?$/, 'ask'],
  [/^\/ask\/([^/?#]+)/, 'askView'],
  [/^\/links\/?$/, 'links'],
  [/^\/admin\/?$/, 'admin'],
];

function match(path) {
  const [pathname, search = ''] = path.split('?');
  for (const [re, name] of routes) {
    const m = pathname.match(re);
    if (m) return { name, params: m.slice(1).map(decodeURIComponent), query: new URLSearchParams(search) };
  }
  return { name: 'notFound', params: [], query: new URLSearchParams() };
}

export async function navigate(path, { replace = false } = {}) {
  if (path === currentPath && !replace) {
    window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
    return;
  }
  const url = DEMO ? '#' + path : path;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  await render(path);
}

async function render(path) {
  const route = match(path);
  const page = pages[route.name];
  const animate = !firstRender && !reduceMotion();
  closeMenu();

  const dataPromise = page.load ? page.load(route).catch((e) => ({ __error: e })) : Promise.resolve(null);
  if (animate) {
    curtain.className = 'curtain';
    void curtain.offsetWidth;
    curtain.classList.add('is-in');
    await wait(430);
  }
  const data = await dataPromise;

  for (const fn of cleanups) fn();
  cleanups = [];
  scrollFns = [];
  resizeFns = [];
  document.body.classList.remove('is-ready');

  currentPath = path;
  setActiveNav(route.name);
  window.scrollTo(0, 0);

  if (data && data.__error) renderError(data.__error);
  else {
    const out = page.render(data, route);
    if (typeof out === 'function') cleanups.push(out);
  }
  document.title = pageTitle(route, data);
  observeReveals();
  onScroll();

  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('is-ready')));
  if (animate) {
    curtain.classList.remove('is-in');
    curtain.classList.add('is-out');
    setTimeout(() => (curtain.className = 'curtain'), 650);
  }
  if (!firstRender) main.focus({ preventScroll: true });
  firstRender = false;
}

function pageTitle(route, data) {
  const nick = (site && site.nickname) || 'saccharin';
  const t = {
    home: nick,
    works: `works — ${nick}`,
    work: data && data.work ? `${data.work.title} — ${nick}` : nick,
    wip: `in progress — ${nick}`,
    ask: `ask — ${nick}`,
    askView: `내 질문 — ${nick}`,
    links: `links — ${nick}`,
    admin: `admin — ${nick}`,
    notFound: `페이지 없음 — ${nick}`,
  };
  return t[route.name] || nick;
}

function setActiveNav(name) {
  const key = { work: 'works', askView: 'ask' }[name] || name;
  $$('.nav-links a').forEach((a) => {
    if (a.dataset.nav === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const h = a.getAttribute('href') || '/';
  const path = h.startsWith('#') ? h.slice(1) : h;
  e.preventDefault();
  navigate(path);
});
window.addEventListener('popstate', () => render(currentLocation()));
if (DEMO) window.addEventListener('hashchange', () => currentLocation() !== currentPath && render(currentLocation()));

/* mobile menu */
const toggle = $('.nav-toggle');
const menu = $('#mobile-menu');
toggle.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
function openMenu() {
  menu.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
  toggle.textContent = 'Close';
  document.body.classList.add('menu-open');
}
function closeMenu() {
  menu.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = 'Menu';
  document.body.classList.remove('menu-open');
}
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu());

/* ───────────── 공통 조각: 푸터 ───────────── */

function footerHTML(s, links, { withCta = true } = {}) {
  const year = new Date().getFullYear();
  const linkItems = links.length
    ? links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a></li>`).join('')
    : '<li class="muted">등록된 사이트 없음</li>';
  return `
  <section class="on-dark" data-tone-zone="light">
    ${
      withCta
        ? `<div class="cta">
      <a class="cta-link" href="${href('/ask')}" data-link>
        <p class="cta-big rv">ask me<br>anything<svg class="arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 13 13 3M4.5 3H13v8.5"/></svg></p>
      </a>
      <div class="cta-row"><p class="rv">가입 없이 익명 질문 가능<br>질문과 답변은 질문자 본인과 운영자만 열람</p></div>
    </div>`
        : ''
    }
    <footer class="foot">
      <div class="foot-top">
        <div class="foot-col"><h3>Menu</h3><ul>
          <li><a href="${href('/works')}" data-link>Works</a></li>
          <li><a href="${href('/wip')}" data-link>In progress</a></li>
          <li><a href="${href('/ask')}" data-link>Ask</a></li>
          <li><a href="${href('/links')}" data-link>Links</a></li>
        </ul></div>
        <div class="foot-col"><h3>Elsewhere</h3><ul>${linkItems}</ul></div>
      </div>
      <p class="foot-name" aria-hidden="true">${esc(s.nickname || 'saccharin')}</p>
      <div class="foot-bottom"><span>© ${year} ${esc(s.nickname || 'saccharin')}</span><a href="#main" class="to-top">맨 위로</a></div>
    </footer>
  </section>`;
}
document.addEventListener('click', (e) => {
  if (e.target.closest('.to-top')) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
  }
});

function renderError(err) {
  main.innerHTML = `<section class="nf"><h1 class="page-title">oops</h1><p class="muted">${esc(err.message || '불러오기 실패')}</p><p><a class="btn" href="${href('/')}" data-link>홈으로 가기</a></p></section>`;
}

/* ───────────── 페이지: 홈 ───────────── */

function setupHeroName(el, text) {
  // 스크롤하면 글자 폭(wdth)이 125 → 62로 좁아지면서, 화면 폭은 그대로 채우도록 글자 크기가 커집니다.
  const chars = [...text];
  el.innerHTML = `<span class="ln">${chars
    .map((c, i) => `<span class="ch" style="transition-delay:${120 + i * 55}ms">${c === ' ' ? '&nbsp;' : esc(c)}</span>`)
    .join('')}</span>`;
  el.setAttribute('aria-label', text);
  const samples = [125, 110, 95, 80, 62];
  let table = [];
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-weight:800;letter-spacing:-0.045em;font-size:100px;left:-9999px;top:0';
  probe.textContent = text;
  document.body.appendChild(probe);
  const measure = () => {
    table = samples.map((w) => {
      probe.style.fontStretch = w + '%';
      return { w, px: probe.getBoundingClientRect().width };
    });
  };
  const startW = () => (window.innerWidth < 720 ? 82 : 125);
  let wdth = startW();
  const apply = () => {
    const avail = el.clientWidth - parseFloat(getComputedStyle(el).paddingLeft) * 2;
    let i = 0;
    while (i < table.length - 2 && wdth < table[i + 1].w) i++;
    const a = table[i],
      b = table[i + 1];
    const t = clamp((a.w - wdth) / (a.w - b.w));
    const px = lerp(a.px, b.px, t);
    el.style.fontStretch = wdth + '%';
    el.style.fontSize = (avail / px) * 100 + 'px';
  };
  const ready = document.fonts && document.fonts.load ? document.fonts.load('800 100px Archivo') : Promise.resolve();
  ready.then(() => {
    measure();
    apply();
  });
  measure();
  apply();
  return {
    set(p) {
      wdth = lerp(startW(), 62, p);
      if (table.length) apply();
    },
    resize() {
      measure();
      apply();
    },
    destroy() {
      probe.remove();
    },
  };
}

function splitWords(text) {
  return esc(text)
    .split(/(\s+)/)
    .map((w) => (w.trim() ? `<span class="w">${w}</span>` : w))
    .join('');
}

const pages = {};

pages.home = {
  async load() {
    const [s, works, wip, links] = await Promise.all([
      getSite(),
      api.works({ status: 'published' }),
      api.works({ status: 'wip' }),
      getLinks(),
    ]);
    return { s, works, wip, links };
  },
  render({ s, works, wip, links }) {
    const recent = works.slice(0, 6);
    const colA = recent.filter((_, i) => i % 2 === 0);
    const colB = recent.filter((_, i) => i % 2 === 1);
    main.innerHTML = `
    <section class="hero" data-tone-zone="light">
      <div class="hero-par"><div class="hero-media">${s.hero_image_url ? `<img src="${esc(s.hero_image_url)}" alt="" fetchpriority="high">` : '<div class="ph"></div>'}</div></div>
      <div class="hero-shade"></div>
      <p class="hero-meta">${esc(s.hero_note)}</p>
      <h1 class="hero-name"></h1>
    </section>

    ${s.about ? `<section class="statement"><p class="statement-text">${splitWords(s.about)}</p></section>` : ''}

    <section class="home-works" aria-labelledby="hw-title">
      <div class="home-works-head"><div class="sticky">
        <h2 class="sec-title rv" id="hw-title">works<sup>${works.length}</sup></h2>
        <p class="muted rv" style="max-width:20em;margin:0 0 24px">최근에 공개한 캐릭터 및 세계관</p>
        <a class="btn rv" href="${href('/works')}" data-link>전체 작품 보기</a>
      </div></div>
      ${
        recent.length
          ? `<div class="home-works-grid">
        <div class="col">${colA.map((w) => cardHTML(w)).join('')}</div>
        <div class="col">${colB.map((w) => cardHTML(w)).join('')}</div>
      </div>`
          : `<div class="home-works-grid"><p class="muted">공개된 작품 없음</p></div>`
      }
    </section>

    <div class="marquee" aria-hidden="true"><div class="marquee-track">${Array.from({ length: 4 })
      .map(() => '<span>characters</span><span class="o">worlds</span><span>stories</span><span class="o">romance</span>')
      .join('')}</div></div>

    ${
      wip.length
        ? `<section class="hwip" aria-labelledby="wip-title"><div class="hwip-pin">
      <div class="hwip-head">
        <h2 class="sec-title" id="wip-title" style="margin:0">in progress<sup>${wip.length}</sup></h2>
        <a class="btn" href="${href('/wip')}" data-link>제작중 목록</a>
      </div>
      <div class="hwip-track">${wip
        .map(
          (w) => `<article class="hwip-card">
          <div class="card-media">${media(w.thumb, w.title, w.kind)}</div>
          <div class="card-info"><h3 class="card-title">${esc(w.title)}</h3><span class="card-kind">${esc(KIND_LABEL[w.kind])}</span>
          ${w.subtitle ? `<p class="card-sub">${esc(w.subtitle)}</p>` : ''}</div>
          <div style="margin-top:12px">${stageHTML(w.stage)}</div>
        </article>`
        )
        .join('')}</div>
    </div></section>`
        : ''
    }

    ${footerHTML(s, links)}`;

    // hero
    const hero = $('.hero', main);
    const heroMedia = $('.hero-par', main);
    const shade = $('.hero-shade', main);
    const meta = $('.hero-meta', main);
    const name = setupHeroName($('.hero-name', main), s.nickname || 'saccharin');
    const rm = reduceMotion();
    scrollFns.push((y) => {
      if (rm) return;
      const h = hero.offsetHeight;
      if (y > h * 1.1) return;
      const p = clamp(y / (h * 0.85));
      const e = 1 - Math.pow(1 - p, 2);
      name.set(e);
      heroMedia.style.transform = `translate3d(0, ${y * 0.32}px, 0)`;
      shade.style.opacity = (p * 0.55).toFixed(3);
      meta.style.transform = `translate3d(0, ${-y * 0.15}px, 0)`;
      meta.style.opacity = document.body.classList.contains('is-ready') ? String(clamp(1 - p * 1.6)) : '';
    });
    resizeFns.push(() => name.resize());

    // statement: 스크롤에 따라 단어가 진해짐
    const words = $$('.statement-text .w', main);
    const stText = $('.statement-text', main);
    scrollFns.push(() => {
      if (rm || !stText) return;
      const r = stText.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.25));
      const n = Math.round(p * words.length);
      words.forEach((w, i) => w.classList.toggle('on', i < n));
    });

    // works: 두 번째 열이 조금 더 빠르게 움직임
    const colsB = $('.home-works-grid .col:nth-child(2)', main);
    if (colsB) {
      const grid = $('.home-works-grid', main);
      scrollFns.push(() => {
        if (rm || window.innerWidth < 560) return (colsB.style.transform = '');
        const r = grid.getBoundingClientRect();
        const p = clamp((window.innerHeight - r.top) / (r.height + window.innerHeight));
        colsB.style.transform = `translate3d(0, ${(0.5 - p) * 120}px, 0)`;
      });
    }

    // marquee: 스크롤 양에 맞춰 흐름
    const track = $('.marquee-track', main);
    scrollFns.push((y) => {
      if (rm) return;
      const half = track.scrollWidth / 2;
      track.style.transform = `translate3d(${-((y * 0.45) % half)}px, 0, 0)`;
    });

    // wip: 세로 스크롤 → 가로 이동
    const hw = $('.hwip', main);
    if (hw) {
      const hTrack = $('.hwip-track', main);
      let dist = 0;
      const mobile = () => window.matchMedia('(max-width: 720px)').matches;
      const size = () => {
        if (mobile() || rm) {
          hw.style.height = '';
          hTrack.style.transform = '';
          dist = 0;
          return;
        }
        dist = Math.max(0, hTrack.scrollWidth - window.innerWidth);
        hw.style.height = window.innerHeight + dist + 'px';
      };
      size();
      resizeFns.push(size);
      scrollFns.push(() => {
        if (!dist) return;
        const r = hw.getBoundingClientRect();
        const p = clamp(-r.top / (hw.offsetHeight - window.innerHeight));
        hTrack.style.transform = `translate3d(${-p * dist}px, 0, 0)`;
      });
    }

    return () => name.destroy();
  },
};

/* ───────────── 페이지: 작품 목록 ───────────── */

pages.works = {
  async load({ query }) {
    const [s, works, links] = await Promise.all([getSite(), api.works({ status: 'published' }), getLinks()]);
    return { s, works, links, tab: query.get('tab') === 'world' ? 'world' : 'character' };
  },
  render({ s, works, links, tab }) {
    const by = { character: works.filter((w) => w.kind === 'character'), world: works.filter((w) => w.kind === 'world') };
    main.innerHTML = `
    <header class="page-head">
      <h1 class="page-title rv">works<sup>${works.length}</sup></h1>
      <p class="page-lede rv">썸네일 클릭 시 작품 소개로 이동</p>
    </header>
    <div class="tabs" role="tablist" aria-label="작품 분류">
      <button class="tab" role="tab" id="tab-character" aria-controls="works-panel" data-tab="character">Characters<sup>${by.character.length}</sup></button>
      <button class="tab" role="tab" id="tab-world" aria-controls="works-panel" data-tab="world">Worlds<sup>${by.world.length}</sup></button>
    </div>
    <div id="works-panel" role="tabpanel"></div>
    ${footerHTML(s, links, { withCta: false })}`;

    const panel = $('#works-panel', main);
    const show = async (k, animate) => {
      $$('.tab', main).forEach((b) => {
        const on = b.dataset.tab === k;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
      });
      panel.setAttribute('aria-labelledby', 'tab-' + k);
      const list = by[k];
      const html = list.length
        ? `<div class="grid-works">${list.map((w) => cardHTML(w)).join('')}</div>`
        : `<div class="empty"><p>공개된 ${KIND_LABEL[k]} 없음</p></div>`;
      const old = $('.grid-works', panel);
      if (animate && old && !reduceMotion()) {
        old.classList.add('swap');
        await wait(260);
      }
      panel.innerHTML = html;
      const g = $('.grid-works', panel);
      if (g && animate && !reduceMotion()) {
        g.classList.add('swap');
        requestAnimationFrame(() => requestAnimationFrame(() => g.classList.remove('swap')));
      }
      observeReveals();
      const url = '/works' + (k === 'world' ? '?tab=world' : '');
      currentPath = url;
      history.replaceState(null, '', DEMO ? '#' + url : url);
    };
    $$('.tab', main).forEach((b) => {
      b.addEventListener('click', () => show(b.dataset.tab, true));
      b.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          const next = b.dataset.tab === 'character' ? 'world' : 'character';
          show(next, true);
          $(`[data-tab="${next}"]`, main).focus();
        }
      });
    });
    show(tab, false);
  },
};

/* ───────────── 페이지: 작품 상세 ───────────── */

function frameDoc(html) {
  const resize = `<script>(function(){function s(){parent.postMessage({sfFrame:document.documentElement.scrollHeight},'*')}
new ResizeObserver(s).observe(document.documentElement);addEventListener('load',s);s();})();<\/script>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank">
<style>html,body{margin:0;background:transparent}body{font-family:"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#2a2c2f;line-height:1.6}img{max-width:100%;height:auto}</style>
</head><body>${html}${resize}</body></html>`;
}

export function mountFrame(iframe, html) {
  iframe.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
  iframe.srcdoc = frameDoc(html);
  const onMsg = (e) => {
    if (e.source === iframe.contentWindow && e.data && typeof e.data.sfFrame === 'number') {
      iframe.style.height = Math.min(e.data.sfFrame + 4, 40000) + 'px';
    }
  };
  window.addEventListener('message', onMsg);
  return () => window.removeEventListener('message', onMsg);
}

pages.work = {
  async load({ params }) {
    const [s, work, links] = await Promise.all([getSite(), api.work(params[0]), getLinks()]);
    const siblings = await api.works({ status: work.status === 'wip' ? 'wip' : 'published', kind: work.kind });
    return { s, work, siblings, links };
  },
  render({ s, work, siblings, links }) {
    const w = work;
    main.innerHTML = `
    <article>
      <header class="work-head">
        <div class="work-head-text">
          <a class="work-back" href="${href(w.status === 'wip' ? '/wip' : '/works' + (w.kind === 'world' ? '?tab=world' : ''))}" data-link>${w.status === 'wip' ? 'In progress' : 'Works'} / ${esc(KIND_LABEL[w.kind])}</a>
          <h1 class="work-title rv">${esc(w.title)}</h1>
          ${w.subtitle ? `<p class="work-sub rv">${esc(w.subtitle)}</p>` : ''}
          <dl class="work-meta rv">
            <div><dt>분류</dt><dd>${esc(KIND_LABEL[w.kind])}</dd></div>
            ${w.tags.length ? `<div><dt>태그</dt><dd>${w.tags.map(esc).join(', ')}</dd></div>` : ''}
            <div><dt>공개</dt><dd>${fmtDate(w.created_at)}</dd></div>
            ${w.status === 'wip' ? `<div>${stageHTML(w.stage)}</div>` : ''}
          </dl>
          ${
            w.links.length
              ? `<div class="work-actions rv">${w.links
                  .map((l) => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || '바로가기')} ${ICON.arrowUR}</a>`)
                  .join('')}</div>`
              : ''
          }
        </div>
        <div class="work-cover"><div class="card-media rv-img">${media(w.thumb, w.title, w.kind)}</div></div>
      </header>
      ${w.body_html ? `<div class="work-body"><iframe class="work-frame" title="${esc(w.title)} 소개"></iframe></div>` : ''}
    </article>
    ${
      siblings.length > 1
        ? `<section class="more" aria-labelledby="more-title">
      <div class="more-head">
        <h2 class="sec-title" id="more-title" style="margin:0">more ${w.kind === 'world' ? 'worlds' : 'characters'}</h2>
        <div class="more-arrows">
          <button class="icon-btn" type="button" data-dir="-1" aria-label="이전 작품들">${ICON.left}</button>
          <button class="icon-btn" type="button" data-dir="1" aria-label="다음 작품들">${ICON.right}</button>
        </div>
      </div>
      <div class="more-track">${siblings.map((x) => cardHTML(x, { current: x.slug === w.slug })).join('')}</div>
      <div class="more-foot"><a class="btn" href="${href('/works')}" data-link>작품 목록으로</a></div>
    </section>`
        : ''
    }
    ${footerHTML(s, links, { withCta: false })}`;

    const off = [];
    const frame = $('.work-frame', main);
    if (frame) off.push(mountFrame(frame, w.body_html));

    const track = $('.more-track', main);
    if (track) {
      const cur = $('.is-current', track);
      if (cur) track.scrollLeft = Math.max(0, cur.offsetLeft - track.clientWidth / 2 + cur.clientWidth / 2);
      $$('.more-arrows button', main).forEach((b) =>
        b.addEventListener('click', () =>
          track.scrollBy({ left: Number(b.dataset.dir) * track.clientWidth * 0.8, behavior: reduceMotion() ? 'auto' : 'smooth' })
        )
      );
    }
    return () => off.forEach((f) => f());
  },
};

/* ───────────── 페이지: 제작중 ───────────── */

pages.wip = {
  async load() {
    const [s, wip, links] = await Promise.all([getSite(), api.works({ status: 'wip' }), getLinks()]);
    return { s, wip, links };
  },
  render({ s, wip, links }) {
    main.innerHTML = `
    <header class="page-head">
      <h1 class="page-title rv">in progress<sup>${wip.length}</sup></h1>
      <p class="page-lede rv">제작 중인 캐릭터 및 세계관<br>공개 시 Works로 이동</p>
    </header>
    ${
      wip.length
        ? `<ul class="wip-list">${wip
            .map(
              (w) => `<li class="wip-row rv" data-img="${esc(w.thumb)}">
          <div class="wip-thumb">${media(w.thumb, w.title, w.kind)}</div>
          <h2 class="wip-name">${esc(w.title)}</h2>
          <p class="wip-concept">${esc(w.subtitle)}</p>
          ${stageHTML(w.stage)}
        </li>`
            )
            .join('')}</ul>`
        : `<div class="empty"><p>제작 중인 작품 없음</p><a class="btn" href="${href('/works')}" data-link>공개된 작품 보기</a></div>`
    }
    ${footerHTML(s, links)}`;

    // 마우스를 올리면 커서를 따라다니는 썸네일 (마우스가 있는 기기만)
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || reduceMotion()) return;
    const box = $('.cursor-media');
    const img = $('img', box);
    let tx = 0,
      ty = 0,
      x = 0,
      y = 0,
      raf = 0,
      on = false;
    const loop = () => {
      x = lerp(x, tx, 0.16);
      y = lerp(y, ty, 0.16);
      box.style.left = x + 'px';
      box.style.top = y + 'px';
      raf = on || Math.abs(x - tx) > 0.5 ? requestAnimationFrame(loop) : 0;
    };
    const move = (e) => {
      tx = e.clientX + 40;
      ty = e.clientY;
      if (!raf) raf = requestAnimationFrame(loop);
    };
    $$('.wip-row', main).forEach((row) => {
      const src = row.dataset.img;
      if (!src) return;
      row.addEventListener('mouseenter', (e) => {
        img.src = src;
        x = tx = e.clientX + 40;
        y = ty = e.clientY;
        on = true;
        box.classList.add('on');
        if (!raf) raf = requestAnimationFrame(loop);
      });
      row.addEventListener('mousemove', move);
      row.addEventListener('mouseleave', () => {
        on = false;
        box.classList.remove('on');
      });
    });
    return () => {
      on = false;
      box.classList.remove('on');
      cancelAnimationFrame(raf);
    };
  },
};

/* ───────────── 페이지: 익명 질문 ───────────── */

const MINE_KEY = 'sf_my_questions';
function loadMine() {
  try {
    return JSON.parse(localStorage.getItem(MINE_KEY) || '[]');
  } catch {
    return [];
  }
}
function saveMine(list) {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    /* 저장 불가 브라우저 */
  }
}
function askUrl(token) {
  return DEMO ? location.href.split('#')[0] + '#/ask/' + token : location.origin + '/ask/' + token;
}

let turnstileLoading = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!turnstileLoading) {
    turnstileLoading = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      sc.async = true;
      sc.onload = () => resolve(window.turnstile);
      sc.onerror = () => reject(new Error('스팸 확인 도구 불러오기 실패. 새로고침 후 다시 시도'));
      document.head.appendChild(sc);
    });
  }
  return turnstileLoading;
}

// 사진의 위치정보(EXIF)를 지우고, 너무 크면 줄여서 다시 저장
async function cleanImage(file) {
  if (file.type === 'image/gif') return file;
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  for (const [maxSide, q] of [
    [2560, 0.9],
    [2048, 0.82],
    [1600, 0.75],
  ]) {
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, outType === 'image/png' && maxSide < 2560 ? 'image/jpeg' : outType, q));
    if (blob && blob.size <= 5 * 1024 * 1024) return new File([blob], 'image', { type: blob.type });
  }
  throw new Error('이미지 용량 초과. 장당 5MB 이하만 첨부 가능');
}

pages.ask = {
  async load() {
    const [s, links] = await Promise.all([getSite(), getLinks()]);
    return { s, links };
  },
  render({ s, links }) {
    main.innerHTML = `
    <section class="ask">
      <div class="ask-intro">
        <h1 class="page-title rv">ask</h1>
        <ul class="rv">
          <li>가입 없이 익명 질문 가능</li>
          <li>질문과 답변은 질문자 본인과 운영자만 열람</li>
          <li>전송 후 답변 확인 링크 발급. 분실 시 복구 불가, 반드시 저장</li>
        </ul>
      </div>
      <div class="ask-main">
        <form class="ask-form rv" novalidate>
          <div class="field">
            <label for="q-body">질문</label>
            <textarea class="textarea" id="q-body" name="body" maxlength="3000" required placeholder="질문 내용 입력"></textarea>
            <div class="hint-row"><span>최대 3,000자</span><span class="count">0 / 3000</span></div>
          </div>
          <div class="field">
            <span class="field-label">이미지 첨부 (선택, 최대 3장 · 장당 5MB)</span>
            <div class="attach">
              <label class="btn btn-sm attach-btn">이미지 고르기<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple></label>
              <div class="thumbs"></div>
            </div>
            <span class="small muted">사진 속 위치정보는 업로드 전 자동 삭제</span>
          </div>
          <div class="captcha"></div>
          <p class="form-error" role="alert" hidden></p>
          <button class="btn btn-solid" type="submit">질문 보내기</button>
        </form>
        <div class="ask-done" hidden></div>
        <div class="mine" hidden><h2>내가 보낸 질문</h2><p class="small muted" style="margin:0 0 14px">이 브라우저에서 보낸 질문만 표시</p><ul></ul></div>
      </div>
    </section>
    ${footerHTML(s, links, { withCta: false })}`;

    const form = $('.ask-form', main);
    const ta = $('#q-body', main);
    const count = $('.count', main);
    const errBox = $('.form-error', main);
    const thumbs = $('.thumbs', main);
    const fileInput = $('input[type=file]', main);
    const submit = $('button[type=submit]', form);
    const cap = $('.captcha', main);
    let images = [];
    let widgetId = null;

    const showErr = (m) => {
      errBox.textContent = m;
      errBox.hidden = !m;
    };
    ta.addEventListener('input', () => (count.textContent = `${ta.value.length} / 3000`));

    const drawThumbs = () => {
      thumbs.innerHTML = images
        .map((f, i) => `<div class="thumb"><img src="${URL.createObjectURL(f)}" alt="첨부 이미지 ${i + 1}"><button type="button" data-i="${i}" aria-label="첨부 이미지 ${i + 1} 빼기">×</button></div>`)
        .join('');
    };
    thumbs.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      images.splice(Number(b.dataset.i), 1);
      drawThumbs();
    });
    fileInput.addEventListener('change', async () => {
      showErr('');
      const picked = [...fileInput.files];
      fileInput.value = '';
      if (images.length + picked.length > 3) showErr('이미지는 최대 3장까지 첨부 가능');
      for (const f of picked.slice(0, 3 - images.length)) {
        if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) {
          showErr('JPG, PNG, WEBP, GIF 이미지만 첨부 가능');
          continue;
        }
        try {
          images.push(await cleanImage(f));
        } catch (e) {
          showErr(e.message);
        }
      }
      drawThumbs();
    });

    if (DEMO || !s.turnstile_sitekey) {
      cap.innerHTML = `<span class="captcha-ph">${DEMO ? '스팸 확인 상자 자리 (미리보기에서는 생략)' : '스팸 확인 키 미설정'}</span>`;
    } else {
      loadTurnstile()
        .then((ts) => {
          if (!document.body.contains(cap)) return;
          widgetId = ts.render(cap, { sitekey: s.turnstile_sitekey, theme: 'light', language: 'ko' });
        })
        .catch((e) => showErr(e.message));
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      showErr('');
      const body = ta.value.trim();
      if (!body) return showErr('질문 내용 입력 필요'), ta.focus();
      const fd = new FormData();
      fd.append('body', body);
      images.forEach((f, i) => fd.append('images', f, `image-${i}`));
      const tsInput = $('input[name="cf-turnstile-response"]', cap);
      if (tsInput) fd.append('cf-turnstile-response', tsInput.value);
      submit.disabled = true;
      submit.textContent = '보내는 중…';
      try {
        const { token } = await api.ask(fd);
        const mine = loadMine();
        mine.unshift({ t: token, at: Date.now(), p: body.slice(0, 60) });
        saveMine(mine);
        form.hidden = true;
        const done = $('.ask-done', main);
        done.hidden = false;
        done.innerHTML = `<div class="done">
          <h2>질문 전송 완료</h2>
          <p class="muted" style="margin:0">아래 링크에서 답변 확인 가능</p>
          <div class="secret"><input readonly value="${esc(askUrl(token))}" aria-label="답변 확인 링크"><button class="btn btn-solid" type="button" data-copy>링크 복사</button></div>
          <p class="warn">이 링크로만 답변 확인 가능. 분실 시 복구 불가, 반드시 저장</p>
          <div class="btns"><a class="btn" href="${href('/ask/' + token)}" data-link>답변 확인하러 가기</a><button class="btn" type="button" data-again>질문 하나 더 보내기</button></div>
        </div>`;
        $('[data-copy]', done).addEventListener('click', async () => {
          const inp = $('input', done);
          try {
            await navigator.clipboard.writeText(inp.value);
          } catch {
            inp.select();
            document.execCommand('copy');
          }
          toast('링크 복사 완료');
        });
        $('[data-again]', done).addEventListener('click', () => {
          done.hidden = true;
          form.hidden = false;
          ta.value = '';
          images = [];
          drawThumbs();
          count.textContent = '0 / 3000';
          if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
          ta.focus();
        });
        drawMine();
      } catch (err) {
        showErr(err.message);
        if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
      } finally {
        submit.disabled = false;
        submit.textContent = '질문 보내기';
      }
    });

    const drawMine = async () => {
      const mine = loadMine();
      const box = $('.mine', main);
      if (!mine.length) return (box.hidden = true);
      box.hidden = false;
      const ul = $('ul', box);
      ul.innerHTML = mine
        .map(
          (m) => `<li><a href="${href('/ask/' + m.t)}" data-link><span class="q-prev">${esc(m.p)}</span><span class="status" data-t="${esc(m.t)}">확인 중</span></a></li>`
        )
        .join('');
      for (const m of mine.slice(0, 15)) {
        api
          .askView(m.t)
          .then((q) => {
            const el = $(`.status[data-t="${CSS.escape(m.t)}"]`, ul);
            if (!el) return;
            el.textContent = q.answer ? '답변 도착' : '답변 대기';
            el.classList.toggle('ok', !!q.answer);
          })
          .catch(() => {
            const el = $(`.status[data-t="${CSS.escape(m.t)}"]`, ul);
            if (el) el.textContent = '삭제됨';
          });
      }
    };
    drawMine();

    return () => {
      if (window.turnstile && widgetId !== null) window.turnstile.remove(widgetId);
    };
  },
};

pages.askView = {
  async load({ params }) {
    const [s, links] = await Promise.all([getSite(), getLinks()]);
    let q = null,
      error = null;
    try {
      q = await api.askView(params[0]);
    } catch (e) {
      error = e;
    }
    return { s, links, q, error, token: params[0] };
  },
  render({ s, links, q, error, token }) {
    main.innerHTML = `
    <section class="ask">
      <div class="ask-intro">
        <h1 class="page-title rv">my<br>question</h1>
        <ul class="rv"><li>이 주소를 아는 사람만 열람 가능. 타인 공유 금지</li></ul>
        <p class="rv" style="margin-top:28px"><a class="btn" href="${href('/ask')}" data-link>새 질문 보내기</a></p>
      </div>
      <div class="ask-main">
        ${
          error
            ? `<div class="empty" style="padding-left:0"><p>${esc(error.message)}</p></div>`
            : `<div class="qa rv">
          <div class="qa-block"><h2><span>질문</span><span>${fmtDate(q.created_at)}</span></h2>
            <p class="qa-text"></p>
            ${q.images.length ? `<div class="qa-imgs">${q.images.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="첨부 이미지 ${i + 1}"></a>`).join('')}</div>` : ''}
          </div>
          ${
            q.answer
              ? `<div class="qa-block qa-answer"><h2><span>답변</span><span>${fmtDate(q.answered_at)}</span></h2><p class="qa-text qa-a"></p></div>`
              : `<div class="qa-block"><span class="status">답변 대기 중. 답변 등록 시 이 주소에서 확인 가능</span></div>`
          }
        </div>`
        }
      </div>
    </section>
    ${footerHTML(s, links, { withCta: false })}`;
    if (q) {
      $('.qa-text', main).textContent = q.body;
      const a = $('.qa-a', main);
      if (a) a.textContent = q.answer;
      // 이 브라우저 목록에 없으면 추가
      const mine = loadMine();
      if (!mine.some((m) => m.t === token)) {
        mine.unshift({ t: token, at: q.created_at, p: q.body.slice(0, 60) });
        saveMine(mine);
      }
    }
  },
};

/* ───────────── 페이지: 링크 ───────────── */

pages.links = {
  async load() {
    const [s, links] = await Promise.all([getSite(), getLinks()]);
    return { s, links };
  },
  render({ s, links }) {
    const host = (u) => {
      try {
        return new URL(u).host.replace(/^www\./, '');
      } catch {
        return '';
      }
    };
    main.innerHTML = `
    <header class="page-head">
      <h1 class="page-title rv">links</h1>
      <p class="page-lede rv">활동 중인 사이트 모음<br>새 탭에서 열림</p>
    </header>
    ${
      links.length
        ? `<ul class="link-list">${links
            .map(
              (l) => `<li class="rv"><a class="link-row" href="${esc(l.url)}" target="_blank" rel="noopener">
          <p class="link-name">${esc(l.name)}</p>
          <p class="link-note">${esc(l.note)}</p>
          <span class="link-host">${esc(host(l.url))}<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 12 12 4M5.5 4H12v6.5"/></svg></span>
        </a></li>`
            )
            .join('')}</ul>`
        : `<div class="empty"><p>등록된 사이트 없음</p></div>`
    }
    ${footerHTML(s, links)}`;
  },
};

/* ───────────── 페이지: 관리 ───────────── */

pages.admin = {
  async load() {
    const mod = await import('./admin.js');
    return { mod, s: await getSite() };
  },
  render({ mod }) {
    return mod.renderAdmin(main, { navigate, invalidateCache, mountFrame, setAdminLink });
  },
};

pages.notFound = {
  render() {
    main.innerHTML = `<section class="nf" data-tone-zone="light" style="background:var(--ink);color:var(--paper)"><h1 class="page-title">404</h1><p>존재하지 않는 페이지. 주소 확인 필요</p><p><a class="btn" href="${href('/')}" data-link>홈으로 가기</a></p></section>`;
  },
};

/* ───────────── 시작 ───────────── */

function setAdminLink(on) {
  $('.nav-admin').hidden = !on;
}

if (DEMO) {
  $$('a[data-link]').forEach((a) => {
    const h = a.getAttribute('href');
    if (!h.startsWith('#')) a.setAttribute('href', '#' + h);
  });
}
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

getSite().then(() => render(currentLocation()));
api
  .me()
  .then((r) => setAdminLink(!!(r && r.admin)))
  .catch(() => {});
