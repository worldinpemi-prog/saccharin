import { DEMO } from './api.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** 사이트 안 이동 주소 (미리보기 모드에서는 #/경로) */
export const href = (path) => (DEMO ? '#' + path : path);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const KIND_LABEL = { character: '캐릭터', world: '세계관' };
export const STAGES = ['기획', '작업', '테스트'];

export function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export const ICON = {
  arrowUR:
    '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 12 12 4M5.5 4H12v6.5"/></svg>',
  left: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M13 8H3M7 4 3 8l4 4"/></svg>',
  right: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>',
  figure:
    '<svg viewBox="0 0 100 120" fill="currentColor" aria-hidden="true"><circle cx="50" cy="40" r="22"/><path d="M8 120c2-30 20-46 42-46s40 16 42 46z"/></svg>',
  globe:
    '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="5" aria-hidden="true"><circle cx="50" cy="50" r="40"/><ellipse cx="50" cy="50" rx="17" ry="40"/><path d="M10 50h80M16 30h68M16 70h68"/></svg>',
};

export function media(src, alt, kind) {
  if (src) return `<img src="${esc(src)}" alt="${esc(alt || '')}" loading="lazy" decoding="async">`;
  return `<div class="ph-tile" role="img" aria-label="${esc(alt || '이미지 없음')}">${kind === 'world' ? ICON.globe : ICON.figure}</div>`;
}

export function stageHTML(stage) {
  const s = Number(stage) || 0;
  const bars = STAGES.map((_, i) => `<i class="${i < s ? 'on' : i === s ? 'now' : ''}"></i>`).join('');
  return `<span class="stage" title="진행 단계"><span class="stage-bar" aria-hidden="true">${bars}</span><span>${esc(STAGES[s])} 중</span></span>`;
}

export function cardHTML(w, { current = false, cls = '' } = {}) {
  return `<a class="card ${cls} ${current ? 'is-current' : ''}" href="${href('/works/' + encodeURIComponent(w.slug))}" data-link ${current ? 'aria-current="page"' : ''}>
    <div class="card-media rv-img">${media(w.thumb, w.title, w.kind)}</div>
    <div class="card-info">
      <h3 class="card-title">${esc(w.title)}</h3>
      <span class="card-kind">${esc(KIND_LABEL[w.kind] || '')}</span>
      ${w.subtitle ? `<p class="card-sub">${esc(w.subtitle)}</p>` : ''}
    </div>
  </a>`;
}

let toastTimer;
export function toast(msg) {
  let el = $('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2400);
}
