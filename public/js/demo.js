// 미리보기 전용 가짜 데이터. 실제 사이트에서는 쓰이지 않습니다.
const D = (n) => `demo/t${n}.jpg`;
const day = (d) => Date.now() - d * 86400000;

const sampleHtml = (name, line) => `<div style="max-width:640px;margin:24px auto;padding:36px 32px;background:#fff;border:1px solid #e3e4e6;border-radius:4px">
  <p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;color:#8a8d92">CHARACTER</p>
  <h2 style="margin:0 0 14px;font-size:30px;letter-spacing:-.02em">${name}</h2>
  <p style="margin:0 0 20px;color:#555">${line}</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:22px">
    <span style="padding:4px 10px;border-radius:99px;background:#f1f2f3;font-size:13px">로맨스 코미디</span>
    <span style="padding:4px 10px;border-radius:99px;background:#f1f2f3;font-size:13px">현대물</span>
  </div>
  <p style="margin:0;color:#333">다른 사이트에 올린 소개 HTML이 그대로 들어가는 자리. 관리 페이지에서 붙여넣은 HTML이 이 영역에 그대로 표시됨.</p>
</div>`;

let nextId = 100;
const store = {
  site: {
    nickname: 'saccharin',
    hero_note: 'AI CHAT BOT MAKER',
    about: '내가 먹고 싶은 캐릭터를 만듭니다.',
    hero_image: 'demo',
    hero_image_url: 'demo/hero.jpg',
    turnstile_sitekey: '',
  },
  works: [
    ['kang-taeju', '강태주', 'character', 'published', 1, '회장 자녀를 떠맡은 38세 비서실장의 입덕부정 로코', '로맨스 코미디, 현대물, 직장', 3],
    ['kwon-ijin', '권이진', 'character', 'published', 2, '과묵한 해결사가 한 사람 앞에서만 서툴러지는 이야기', '로맨스 코미디, 시트콤', 12],
    ['helios', '헬리오스 제국', 'world', 'published', 3, '황태자 카시안과 다섯 남자가 사는 로판 코미디 제국', '로판, 군상극', 20],
    ['yeon-taeo', '연태오', 'character', 'published', 4, '대치동 영어 일타강사, 존댓말로 사람 웃기는 남자', '개그 로맨스, 존댓말', 26],
    ['choi-kanghyun', '최강현', 'character', 'published', 5, '만사 귀찮은 전설의 전 국가대표 양궁 코치', '로맨스 코미디, 캠퍼스', 40],
    ['winterheim', '윈터하임', 'world', 'published', 6, '대공을 광적으로 숭배하는 사람들이 사는 북부 영지', '로판, 북부', 52],
    ['kim-jaegyeong', '김재경', 'character', 'published', 7, '성인군자 행세하는 유도부 연하남', '캠퍼스, 연하남', 61],
    ['solmare', '솔마레', 'world', 'published', 8, '청혼이 인사가 되는 남부 해군 제국', '로판, 해군', 70],
    ['ian-seiz', '이안 세이즈', 'character', 'wip', 9, '황태자의 그림자로 사는 시종', '로판', 2, 2],
    ['big-dog', '대형견남 (가칭)', 'character', 'wip', 10, '다 컸는데 덩치 차이를 모르고 여전히 애교 부리는 소꿉친구', '로맨스 코미디', 4, 1],
    ['castle-capital', '캐슬캐피탈 채권팀', 'world', 'wip', 11, '세 여자가 굴러가는 채권추심팀 다인챗', '직장, 다인챗', 6, 0],
    ['yoon-taekyung', '윤태경 (가칭)', 'character', 'wip', 12, '인생 계획표를 다 끝내고 공허해진 대기업 임원', '로맨스 코미디', 8, 0],
  ].map(([slug, title, kind, status, img, subtitle, tags, ago, stage = 0], i) => ({
    id: i + 1,
    slug,
    title,
    kind,
    status,
    stage,
    subtitle,
    description: tags.split(', ').join(' · ') + ' 장르의 작품.',
    thumb: D(img),
    thumb_key: 'demo',
    links: status === 'published' ? [{ label: '대화하러 가기', url: 'https://caveduck.io/user/saccharin' }] : [],
    body_html: sampleHtml(title, subtitle),
    sort: 0,
    created_at: day(ago),
    updated_at: day(ago),
  })),
  links: [
    { id: 1, name: 'CaveDuck', url: 'https://caveduck.io/user/saccharin', note: '캐릭터 챗봇을 공개하는 주 활동 플랫폼', sort: 0 },
    { id: 2, name: 'GitHub', url: 'https://github.com', note: '사이트 코드와 작업 도구', sort: 1 },
    { id: 3, name: 'Discord', url: 'https://discord.com', note: '공지와 소식', sort: 2 },
  ],
  questions: [
    { id: 1, token: 'demo-answered-question-token-000', body: '캐릭터 만들 때 말투는 어떻게 정하세요?', images: [], answer: '먼저 그 캐릭터가 하루를 어떻게 보내는지 정하고, 그 하루에서 가장 자주 하는 말을 골라요. 말투는 거기서 자연스럽게 나와요.', answered_at: day(1), created_at: day(2), seen: 1 },
    { id: 2, token: 'demo-open-question-token-000000', body: '다음 캐릭터는 언제 나와요?', images: [D(4)], answer: '', answered_at: null, created_at: day(0.2), seen: 0 },
  ],
  admin: false,
};

const pub = (w) => {
  const { body_html, ...rest } = w;
  return rest;
};
const sortWorks = (a, b) => b.sort - a.sort || b.created_at - a.created_at;
const tick = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 60));
const err = (m, status = 400) => Object.assign(new Error(m), { status });

export default {
  site: () => tick(store.site),
  works: ({ kind, status } = {}) =>
    tick(store.works.filter((w) => w.status === (status === 'wip' ? 'wip' : 'published') && (!kind || w.kind === kind)).sort(sortWorks).map(pub)),
  work: async (slug) => {
    const w = store.works.find((x) => x.slug === slug && x.status !== 'hidden');
    if (!w) throw err('작품을 찾을 수 없음', 404);
    return tick(w);
  },
  links: () => tick([...store.links].sort((a, b) => a.sort - b.sort)),
  ask: async (form) => {
    const body = String(form.get('body') || '').trim();
    if (!body) throw err('질문 내용 입력 필요');
    const token = 'demo' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const images = form.getAll('images').map((f) => URL.createObjectURL(f));
    store.questions.unshift({ id: nextId++, token, body, images, answer: '', answered_at: null, created_at: Date.now(), seen: 0 });
    return tick({ token });
  },
  askView: async (token) => {
    let q = store.questions.find((x) => x.token === token);
    if (!q) q = store.questions[0];
    return tick({ body: q.body, images: q.images, answer: q.answer, answered_at: q.answered_at, created_at: q.created_at });
  },

  me: () => tick({ admin: store.admin }),
  login: async () => {
    store.admin = true;
    return tick({ ok: true });
  },
  logout: async () => {
    store.admin = false;
    return tick({ ok: true });
  },
  stats: () => tick({ unseen: store.questions.filter((q) => !q.seen).length }),
  visits: () => {
    const days = Array.from({ length: 30 }, (_, i) => ({ day: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10), count: Math.round(20 + 15 * Math.sin(i / 3) + (i % 5) * 3) }));
    const sum = (n) => days.slice(0, n).reduce((a, b) => a + b.count, 0);
    return tick({ today: days[0].count, yesterday: days[1].count, last7: sum(7), last30: sum(30), days });
  },
  adminWorks: () => tick([...store.works].sort(sortWorks)),
  saveWork: async (w) => {
    if (!String(w.title || '').trim()) throw err('제목 입력 필요');
    const data = {
      ...w,
      slug: w.slug || String(w.title).trim().toLowerCase().replace(/\s+/g, '-'),
      thumb: w.thumb || '',
      updated_at: Date.now(),
    };
    if (w.id) {
      const i = store.works.findIndex((x) => x.id === w.id);
      store.works[i] = { ...store.works[i], ...data };
      return tick(store.works[i]);
    }
    const n = { ...data, id: nextId++, created_at: Date.now() };
    store.works.push(n);
    return tick(n);
  },
  deleteWork: async (id) => {
    store.works = store.works.filter((w) => w.id !== id);
    return tick({ ok: true });
  },
  upload: async (file) => {
    const url = URL.createObjectURL(file);
    return tick({ key: 'pub/demo', url, absolute: url });
  },
  questions: () => tick(store.questions),
  answer: async (id, answer) => {
    const q = store.questions.find((x) => x.id === id);
    q.answer = answer.trim();
    q.answered_at = Date.now();
    q.seen = 1;
    return tick({ ok: true });
  },
  markSeen: async (id) => {
    store.questions.find((x) => x.id === id).seen = 1;
    return tick({ ok: true });
  },
  deleteQuestion: async (id) => {
    store.questions = store.questions.filter((q) => q.id !== id);
    return tick({ ok: true });
  },
  blockQuestion: () => tick({ ok: true }),
  adminLinks: () => tick(store.links),
  saveLink: async (l) => {
    if (!l.name || !/^https?:\/\//.test(l.url)) throw err('사이트 이름과 http(s) 주소 입력 필요');
    if (l.id) {
      const i = store.links.findIndex((x) => x.id === l.id);
      store.links[i] = { ...l };
      return tick(l);
    }
    const n = { ...l, id: nextId++ };
    store.links.push(n);
    return tick(n);
  },
  deleteLink: async (id) => {
    store.links = store.links.filter((l) => l.id !== id);
    return tick({ ok: true });
  },
  settings: () => tick(store.site),
  saveSettings: async (s) => {
    Object.assign(store.site, s);
    return tick(store.site);
  },
};
