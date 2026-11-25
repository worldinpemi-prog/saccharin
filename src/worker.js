/**
 * sccharinfever.com — Cloudflare Worker
 * 화면 파일(public/) 전달 + API + 이미지 + 관리자 로그인 + 익명 질문 + 디스코드 알림
 *
 * 필요한 바인딩: DB(D1), MEDIA(R2), ASSETS(정적 파일)
 * 필요한 비밀값(Secret): ADMIN_PASSWORD, SESSION_SECRET, TURNSTILE_SECRET, DISCORD_WEBHOOK_URL
 */

const SESSION_COOKIE = 'sf_session';
const SESSION_DAYS = 7;
const Q_MAX_IMAGES = 3;
const Q_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const Q_MAX_LEN = 3000;
const Q_RATE_LIMIT = 5; // 같은 접속지에서 10분에 최대 질문 수
const ADMIN_MAX_UPLOAD = 15 * 1024 * 1024;
const LOGIN_MAX_FAILS = 5; // 15분에 최대 로그인 실패 횟수

const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};
const ADMIN_EXTRA_TYPES = { 'image/svg+xml': 'svg' };

const DEFAULT_SETTINGS = {
  nickname: 'saccharin',
  hero_note: 'AI CHAT BOT MAKER',
  about: '내가 먹고 싶은 캐릭터를 만듭니다.',
  hero_image: '',
  since: '',
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS works (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    kind TEXT NOT NULL DEFAULT 'character',
    status TEXT NOT NULL DEFAULT 'hidden',
    stage INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    thumb TEXT NOT NULL DEFAULT '',
    body_html TEXT NOT NULL DEFAULT '',
    links TEXT NOT NULL DEFAULT '[]',
    sort INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT UNIQUE NOT NULL,
    body TEXT NOT NULL,
    images TEXT NOT NULL DEFAULT '[]',
    answer TEXT NOT NULL DEFAULT '',
    answered_at INTEGER,
    created_at INTEGER NOT NULL,
    ip_hash TEXT NOT NULL DEFAULT '',
    seen INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS blocks (ip_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (ip_hash TEXT NOT NULL, ts INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_q_ip ON questions(ip_hash, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_login ON login_attempts(ip_hash, ts)`,
];

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
  schemaReady = true;
}

/* ───────────── 공통 유틸 ───────────── */

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
const fail = (status, message) => json({ error: message }, status);

const now = () => Date.now();
const enc = new TextEncoder();

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomToken(n = 24) {
  return b64url(crypto.getRandomValues(new Uint8Array(n)));
}
async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return b64url(new Uint8Array(d));
}
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
  return b64url(new Uint8Array(sig));
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '0.0.0.0';
}
async function ipHash(request, env) {
  return (await sha256(clientIp(request) + '|' + (env.SESSION_SECRET || 'dev'))).slice(0, 24);
}
function parseCookies(request) {
  const out = {};
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
function slugify(text) {
  const s = String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'work-' + Date.now().toString(36);
}
function cleanUrl(u) {
  try {
    const url = new URL(String(u).trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}
function sniffImage(bytes) {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'image/avif';
  return '';
}
function monthPrefix() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/* ───────────── 관리자 세션 ───────────── */

async function makeSession(env) {
  const exp = now() + SESSION_DAYS * 86400 * 1000;
  const sig = await hmac(env.SESSION_SECRET, 'admin.' + exp);
  return `${exp}.${sig}`;
}
async function isAdmin(request, env) {
  if (!env.SESSION_SECRET) return false;
  const v = parseCookies(request)[SESSION_COOKIE];
  if (!v) return false;
  const [exp, sig] = v.split('.');
  if (!exp || !sig || Number(exp) < now()) return false;
  return safeEqual(sig, await hmac(env.SESSION_SECRET, 'admin.' + exp));
}
function sessionCookie(value, maxAge) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // 일부 브라우저는 같은 출처 요청에 Origin을 생략
  return new URL(origin).host === new URL(request.url).host;
}

/* ───────────── 데이터 변환 ───────────── */

function mediaUrl(key) {
  return key ? `/media/${key}` : '';
}
function workOut(row, withBody = false) {
  const out = {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    status: row.status,
    stage: row.stage,
    title: row.title,
    subtitle: row.subtitle,
    tags: row.tags ? row.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    thumb: mediaUrl(row.thumb),
    thumb_key: row.thumb,
    links: safeJson(row.links, []),
    sort: row.sort,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (withBody) out.body_html = row.body_html;
  return out;
}
function safeJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const s = { ...DEFAULT_SETTINGS };
  for (const r of results) s[r.key] = r.value;
  s.hero_image_url = mediaUrl(s.hero_image);
  return s;
}

/* ───────────── 공개 API ───────────── */

async function apiSite(env) {
  const s = await getSettings(env);
  const key = env.TURNSTILE_SITEKEY && !env.TURNSTILE_SITEKEY.startsWith('REPLACE') ? env.TURNSTILE_SITEKEY : '';
  return json({ ...s, turnstile_sitekey: key });
}

async function apiWorks(url, env) {
  const kind = url.searchParams.get('kind');
  const status = url.searchParams.get('status') === 'wip' ? 'wip' : 'published';
  let sql = 'SELECT * FROM works WHERE status = ?';
  const args = [status];
  if (kind === 'character' || kind === 'world') {
    sql += ' AND kind = ?';
    args.push(kind);
  }
  sql += ' ORDER BY sort DESC, created_at DESC';
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  return json(results.map((r) => workOut(r)));
}

async function apiWork(slug, env) {
  const row = await env.DB.prepare("SELECT * FROM works WHERE slug = ? AND status IN ('published','wip')").bind(slug).first();
  if (!row) return fail(404, '작품을 찾을 수 없음');
  return json(workOut(row, true));
}

async function apiLinks(env) {
  const { results } = await env.DB.prepare('SELECT * FROM links ORDER BY sort ASC, id ASC').all();
  return json(results);
}

async function verifyTurnstile(token, request, env) {
  if (!env.TURNSTILE_SECRET) return env.ALLOW_NO_CAPTCHA === 'true';
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: clientIp(request) }),
  });
  const data = await res.json().catch(() => ({}));
  return data.success === true;
}

async function apiAskCreate(request, env, ctx) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return fail(400, '질문 내용 읽기 실패. 다시 전송 필요');
  }
  const body = String(form.get('body') || '').trim();
  if (!body) return fail(400, '질문 내용 입력 필요');
  if (body.length > Q_MAX_LEN) return fail(400, `질문은 최대 ${Q_MAX_LEN}자`);

  const ok = await verifyTurnstile(String(form.get('cf-turnstile-response') || ''), request, env);
  if (!ok) return fail(400, '스팸 확인 실패. 확인 상자 다시 체크 필요');

  const ih = await ipHash(request, env);
  const blocked = await env.DB.prepare('SELECT 1 FROM blocks WHERE ip_hash = ?').bind(ih).first();
  if (blocked) return fail(403, '현재 질문 전송 불가');
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM questions WHERE ip_hash = ? AND created_at > ?')
    .bind(ih, now() - 10 * 60 * 1000)
    .first();
  if (recent && recent.n >= Q_RATE_LIMIT) return fail(429, '전송 횟수 초과. 10분 뒤 다시 시도');

  const files = form.getAll('images').filter((f) => f && typeof f === 'object' && f.size > 0);
  if (files.length > Q_MAX_IMAGES) return fail(400, `이미지는 최대 ${Q_MAX_IMAGES}장까지 첨부 가능`);
  const prepared = [];
  for (const f of files) {
    if (f.size > Q_MAX_IMAGE_BYTES) return fail(400, '이미지는 장당 5MB 이하만 첨부 가능');
    const bytes = new Uint8Array(await f.arrayBuffer());
    const type = sniffImage(bytes);
    if (!type) return fail(400, 'JPG, PNG, WEBP, GIF 이미지만 첨부 가능');
    prepared.push({ bytes, type });
  }

  const keys = [];
  for (const p of prepared) {
    const key = `q/${monthPrefix()}/${randomToken(12)}.${IMAGE_TYPES[p.type]}`;
    await env.MEDIA.put(key, p.bytes, { httpMetadata: { contentType: p.type } });
    keys.push(key);
  }

  const token = randomToken(24);
  const tokenHash = await sha256(token);
  await env.DB.prepare('INSERT INTO questions (token_hash, body, images, created_at, ip_hash) VALUES (?, ?, ?, ?, ?)')
    .bind(tokenHash, body, JSON.stringify(keys), now(), ih)
    .run();

  if (env.DISCORD_WEBHOOK_URL) ctx.waitUntil(notifyDiscord(env, body, keys.length));
  return json({ token });
}

async function notifyDiscord(env, body, imageCount) {
  const preview = body.length > 300 ? body.slice(0, 300) + '…' : body;
  const site = env.SITE_URL || '';
  try {
    await fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'saccharinfever',
        allowed_mentions: { parse: [] }, // 질문 안의 @everyone 같은 멘션이 울리지 않게
        embeds: [
          {
            title: '새 익명 질문 도착',
            description: preview,
            url: site ? `${site}/admin` : undefined,
            color: 0x00c6ff,
            footer: { text: imageCount ? `이미지 ${imageCount}장 첨부` : '이미지 없음' },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch (e) {
    console.log('discord notify failed', e);
  }
}

async function findQuestionByToken(token, env) {
  if (!token || token.length < 20) return null;
  return env.DB.prepare('SELECT * FROM questions WHERE token_hash = ?').bind(await sha256(token)).first();
}

async function apiAskView(token, env) {
  const q = await findQuestionByToken(token, env);
  if (!q) return fail(404, '질문을 찾을 수 없음. 링크 확인 필요');
  const images = safeJson(q.images, []).map((_, i) => `/api/ask/${token}/img/${i}`);
  return json({ body: q.body, images, answer: q.answer, answered_at: q.answered_at, created_at: q.created_at });
}

async function apiAskImage(token, index, env) {
  const q = await findQuestionByToken(token, env);
  if (!q) return fail(404, 'not found');
  const key = safeJson(q.images, [])[Number(index)];
  if (!key) return fail(404, 'not found');
  return serveObject(env, key, 'private');
}

/* ───────────── 이미지 전달 ───────────── */

async function serveObject(env, key, cache) {
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  headers.set('cache-control', cache === 'public' ? 'public, max-age=31536000, immutable' : 'private, no-store');
  return new Response(obj.body, { headers });
}

async function routeMedia(path, request, env) {
  const key = decodeURIComponent(path.replace(/^\/media\//, ''));
  if (key.includes('..')) return fail(400, 'bad key');
  if (key.startsWith('pub/')) return serveObject(env, key, 'public');
  if (key.startsWith('q/') && (await isAdmin(request, env))) return serveObject(env, key, 'private');
  return new Response('Not found', { status: 404 });
}

/* ───────────── 관리자 API ───────────── */

async function adminLogin(request, env) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return fail(500, '관리자 비밀번호 미설정. README 6단계 확인');
  const ih = await ipHash(request, env);
  const since = now() - 15 * 60 * 1000;
  const fails = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ? AND ts > ?').bind(ih, since).first();
  if (fails && fails.n >= LOGIN_MAX_FAILS) return fail(429, '로그인 실패 횟수 초과. 15분간 잠금');

  const { password } = await request.json().catch(() => ({}));
  const ok = safeEqual(await sha256(String(password || '')), await sha256(env.ADMIN_PASSWORD));
  if (!ok) {
    await env.DB.prepare('INSERT INTO login_attempts (ip_hash, ts) VALUES (?, ?)').bind(ih, now()).run();
    return fail(401, '비밀번호 불일치');
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash = ? OR ts < ?').bind(ih, since).run();
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(await makeSession(env), SESSION_DAYS * 86400) });
}

function workIn(body) {
  const kind = body.kind === 'world' ? 'world' : 'character';
  const status = ['published', 'wip', 'hidden'].includes(body.status) ? body.status : 'hidden';
  const stage = Math.max(0, Math.min(2, Number(body.stage) || 0));
  const links = Array.isArray(body.links)
    ? body.links
        .map((l) => ({ label: String(l.label || '').trim().slice(0, 40), url: cleanUrl(l.url) }))
        .filter((l) => l.url)
    : [];
  const tags = Array.isArray(body.tags) ? body.tags.join(',') : String(body.tags || '');
  return {
    kind,
    status,
    stage,
    title: String(body.title || '').trim().slice(0, 120),
    subtitle: String(body.subtitle || '').trim().slice(0, 300),
    tags: tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12).join(','),
    thumb: String(body.thumb_key || '').startsWith('pub/') ? String(body.thumb_key) : '',
    body_html: String(body.body_html || ''),
    links: JSON.stringify(links),
    sort: Number(body.sort) || 0,
    slug: slugify(body.slug || body.title),
  };
}

async function adminWorks(request, env, id) {
  const m = request.method;
  if (m === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM works ORDER BY sort DESC, created_at DESC').all();
    return json(results.map((r) => workOut(r, true)));
  }
  if (m === 'DELETE' && id) {
    await env.DB.prepare('DELETE FROM works WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  if (m === 'POST' || m === 'PUT') {
    const w = workIn(await request.json().catch(() => ({})));
    if (!w.title) return fail(400, '제목 입력 필요');
    const clash = await env.DB.prepare('SELECT id FROM works WHERE slug = ? AND id != ?').bind(w.slug, id || 0).first();
    if (clash) w.slug = `${w.slug}-${randomToken(3).toLowerCase()}`;
    const t = now();
    if (m === 'POST') {
      const r = await env.DB.prepare(
        `INSERT INTO works (slug, kind, status, stage, title, subtitle, tags, thumb, body_html, links, sort, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(w.slug, w.kind, w.status, w.stage, w.title, w.subtitle, w.tags, w.thumb, w.body_html, w.links, w.sort, t, t)
        .run();
      id = r.meta.last_row_id;
    } else {
      await env.DB.prepare(
        `UPDATE works SET slug=?, kind=?, status=?, stage=?, title=?, subtitle=?, tags=?, thumb=?, body_html=?, links=?, sort=?, updated_at=? WHERE id=?`
      )
        .bind(w.slug, w.kind, w.status, w.stage, w.title, w.subtitle, w.tags, w.thumb, w.body_html, w.links, w.sort, t, id)
        .run();
    }
    const row = await env.DB.prepare('SELECT * FROM works WHERE id = ?').bind(id).first();
    return json(workOut(row, true));
  }
  return fail(405, 'method not allowed');
}

async function adminUpload(request, env) {
  const form = await request.formData().catch(() => null);
  const f = form && form.get('file');
  if (!f || typeof f !== 'object') return fail(400, '파일 없음');
  if (f.size > ADMIN_MAX_UPLOAD) return fail(400, '이미지는 15MB 이하만 업로드 가능');
  const bytes = new Uint8Array(await f.arrayBuffer());
  let type = sniffImage(bytes);
  if (!type && f.type === 'image/svg+xml') type = 'image/svg+xml';
  const ext = IMAGE_TYPES[type] || ADMIN_EXTRA_TYPES[type];
  if (!ext) return fail(400, 'JPG, PNG, WEBP, GIF, AVIF, SVG 이미지만 업로드 가능');
  const key = `pub/${monthPrefix()}/${randomToken(9)}.${ext}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type } });
  const site = env.SITE_URL || new URL(request.url).origin;
  return json({ key, url: mediaUrl(key), absolute: site + mediaUrl(key) });
}

async function adminQuestions(request, env, id, action) {
  const m = request.method;
  if (m === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM questions ORDER BY (answer = \'\') DESC, created_at DESC LIMIT 500').all();
    return json(
      results.map((q) => ({
        id: q.id,
        body: q.body,
        images: safeJson(q.images, []).map(mediaUrl),
        answer: q.answer,
        answered_at: q.answered_at,
        created_at: q.created_at,
        seen: q.seen,
      }))
    );
  }
  if (!id) return fail(400, 'id required');
  if (m === 'PUT') {
    const { answer, seen } = await request.json().catch(() => ({}));
    if (typeof answer === 'string') {
      const a = answer.trim().slice(0, 5000);
      await env.DB.prepare('UPDATE questions SET answer = ?, answered_at = ?, seen = 1 WHERE id = ?').bind(a, a ? now() : null, id).run();
    } else if (seen) {
      await env.DB.prepare('UPDATE questions SET seen = 1 WHERE id = ?').bind(id).run();
    }
    return json({ ok: true });
  }
  if (m === 'POST' && action === 'block') {
    const q = await env.DB.prepare('SELECT ip_hash FROM questions WHERE id = ?').bind(id).first();
    if (q && q.ip_hash) await env.DB.prepare('INSERT OR IGNORE INTO blocks (ip_hash, created_at) VALUES (?, ?)').bind(q.ip_hash, now()).run();
    return json({ ok: true });
  }
  if (m === 'DELETE') {
    const q = await env.DB.prepare('SELECT images FROM questions WHERE id = ?').bind(id).first();
    if (q) {
      const keys = safeJson(q.images, []);
      if (keys.length) await env.MEDIA.delete(keys);
    }
    await env.DB.prepare('DELETE FROM questions WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  return fail(405, 'method not allowed');
}

async function adminLinks(request, env, id) {
  const m = request.method;
  if (m === 'GET') return apiLinks(env);
  if (m === 'DELETE' && id) {
    await env.DB.prepare('DELETE FROM links WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  const b = await request.json().catch(() => ({}));
  const name = String(b.name || '').trim().slice(0, 60);
  const url = cleanUrl(b.url);
  const note = String(b.note || '').trim().slice(0, 120);
  const sort = Number(b.sort) || 0;
  if (!name || !url) return fail(400, '사이트 이름과 http(s) 주소 입력 필요');
  if (m === 'POST') {
    const r = await env.DB.prepare('INSERT INTO links (name, url, note, sort) VALUES (?, ?, ?, ?)').bind(name, url, note, sort).run();
    return json({ id: r.meta.last_row_id, name, url, note, sort });
  }
  if (m === 'PUT' && id) {
    await env.DB.prepare('UPDATE links SET name=?, url=?, note=?, sort=? WHERE id=?').bind(name, url, note, sort, id).run();
    return json({ id: Number(id), name, url, note, sort });
  }
  return fail(405, 'method not allowed');
}

async function adminSettings(request, env) {
  if (request.method === 'GET') return json(await getSettings(env));
  const b = await request.json().catch(() => ({}));
  const stmts = [];
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (typeof b[key] !== 'string') continue;
    let v = b[key].slice(0, 2000);
    if (key === 'hero_image' && v && !v.startsWith('pub/')) continue;
    stmts.push(env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, v));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json(await getSettings(env));
}

async function adminStats(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM questions WHERE seen = 0").first();
  return json({ unseen: r ? r.n : 0 });
}

/* ───────────── 라우터 ───────────── */

async function handleApi(request, env, ctx, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const m = request.method;
  const seg = path.split('/').filter(Boolean); // ['api', ...]

  // 공개
  if (m === 'GET' && path === '/api/site') return apiSite(env);
  if (m === 'GET' && path === '/api/works') return apiWorks(url, env);
  if (m === 'GET' && seg[1] === 'works' && seg[2]) return apiWork(decodeURIComponent(seg[2]), env);
  if (m === 'GET' && path === '/api/links') return apiLinks(env);
  if (m === 'POST' && path === '/api/ask') return apiAskCreate(request, env, ctx);
  if (m === 'GET' && seg[1] === 'ask' && seg[2] && seg[3] === 'img') return apiAskImage(seg[2], seg[4], env);
  if (m === 'GET' && seg[1] === 'ask' && seg[2]) return apiAskView(seg[2], env);

  // 관리자
  if (seg[1] === 'admin') {
    if (m !== 'GET' && !sameOrigin(request)) return fail(403, 'forbidden');
    if (seg[2] === 'login' && m === 'POST') return adminLogin(request, env);
    if (seg[2] === 'logout' && m === 'POST') return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
    const admin = await isAdmin(request, env);
    if (seg[2] === 'me') return json({ admin });
    if (!admin) return fail(401, '로그인 필요');
    switch (seg[2]) {
      case 'works':
        return adminWorks(request, env, seg[3] ? Number(seg[3]) : null);
      case 'upload':
        return m === 'POST' ? adminUpload(request, env) : fail(405, 'method not allowed');
      case 'questions':
        return adminQuestions(request, env, seg[3] ? Number(seg[3]) : null, seg[4]);
      case 'links':
        return adminLinks(request, env, seg[3] ? Number(seg[3]) : null);
      case 'settings':
        return adminSettings(request, env);
      case 'stats':
        return adminStats(env);
    }
  }
  return fail(404, 'not found');
}

async function handleAssets(request, env, url) {
  let res = await env.ASSETS.fetch(request);
  if (res.status === 404 && request.method === 'GET' && !/\.[a-z0-9]{2,5}$/i.test(url.pathname)) {
    // 화면 주소(/works/어떤작품 등)는 전부 index.html로 — 화면 전환은 브라우저에서 처리
    res = await env.ASSETS.fetch(new Request(new URL('/', url), request));
  }
  const headers = new Headers(res.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  if ((headers.get('content-type') || '').includes('text/html')) headers.set('cache-control', 'no-cache');
  return new Response(res.body, { status: res.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) {
        await ensureSchema(env);
        return await handleApi(request, env, ctx, url);
      }
      if (url.pathname.startsWith('/media/')) {
        return await routeMedia(url.pathname, request, env);
      }
      return await handleAssets(request, env, url);
    } catch (err) {
      console.log('error', err && err.stack);
      return fail(500, '서버 오류. 잠시 뒤 다시 시도');
    }
  },
};
