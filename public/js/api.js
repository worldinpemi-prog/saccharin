// 서버 API 호출. 미리보기(데모) 모드에서는 demo.js의 가짜 데이터로 대체됩니다.
export const DEMO = !!window.SF_DEMO;

async function req(method, url, body, isForm) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) {
    if (isForm) opt.body = body;
    else {
      opt.headers['content-type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
  }
  const r = await fetch(url, opt);
  let data = null;
  try {
    data = await r.json();
  } catch {
    /* 본문 없음 */
  }
  if (!r.ok) {
    const e = new Error((data && data.error) || `요청 실패 (${r.status})`);
    e.status = r.status;
    throw e;
  }
  return data;
}

const real = {
  site: () => req('GET', '/api/site'),
  works: ({ kind, status } = {}) => {
    const q = new URLSearchParams();
    if (kind) q.set('kind', kind);
    if (status) q.set('status', status);
    return req('GET', '/api/works?' + q);
  },
  work: (slug) => req('GET', '/api/works/' + encodeURIComponent(slug)),
  links: () => req('GET', '/api/links'),
  ask: (form) => req('POST', '/api/ask', form, true),
  askView: (token) => req('GET', '/api/ask/' + encodeURIComponent(token)),

  me: () => req('GET', '/api/admin/me'),
  login: (password) => req('POST', '/api/admin/login', { password }),
  logout: () => req('POST', '/api/admin/logout'),
  stats: () => req('GET', '/api/admin/stats'),
  adminWorks: () => req('GET', '/api/admin/works'),
  saveWork: (w) => (w.id ? req('PUT', '/api/admin/works/' + w.id, w) : req('POST', '/api/admin/works', w)),
  deleteWork: (id) => req('DELETE', '/api/admin/works/' + id),
  upload: (file) => {
    const f = new FormData();
    f.append('file', file);
    return req('POST', '/api/admin/upload', f, true);
  },
  questions: () => req('GET', '/api/admin/questions'),
  answer: (id, answer) => req('PUT', '/api/admin/questions/' + id, { answer }),
  markSeen: (id) => req('PUT', '/api/admin/questions/' + id, { seen: true }),
  deleteQuestion: (id) => req('DELETE', '/api/admin/questions/' + id),
  blockQuestion: (id) => req('POST', '/api/admin/questions/' + id + '/block'),
  adminLinks: () => req('GET', '/api/admin/links'),
  saveLink: (l) => (l.id ? req('PUT', '/api/admin/links/' + l.id, l) : req('POST', '/api/admin/links', l)),
  deleteLink: (id) => req('DELETE', '/api/admin/links/' + id),
  settings: () => req('GET', '/api/admin/settings'),
  saveSettings: (s) => req('PUT', '/api/admin/settings', s),
};

let implPromise = null;
function impl() {
  if (!implPromise) implPromise = DEMO ? import('./demo.js').then((m) => m.default) : Promise.resolve(real);
  return implPromise;
}

export const api = new Proxy(
  {},
  {
    get: (_, name) => async (...args) => (await impl())[name](...args),
  }
);
