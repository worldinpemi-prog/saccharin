// 관리 페이지 — 작품 / 질문함 / 링크 / 사이트 설정
import { api, DEMO } from './api.js';
import { esc, href, $, $$, fmtDate, toast, KIND_LABEL, STAGES } from './util.js';

const STATUS_LABEL = { published: '공개', wip: '제작중', hidden: '비공개' };

export async function renderAdmin(main, ctx) {
  let me = { admin: false };
  try {
    me = await api.me();
  } catch {
    /* 서버 미연결 */
  }
  if (!me.admin) return renderLogin(main, ctx);
  ctx.setAdminLink(true);
  return renderDashboard(main, ctx);
}

/* ───────── 로그인 ───────── */

function renderLogin(main, ctx) {
  main.innerHTML = `<section class="admin"><div class="admin-login">
    <h1>관리자 로그인</h1>
    <form class="login-form">
      <div class="field"><label for="pw">비밀번호</label><input class="input" id="pw" type="password" autocomplete="current-password" required></div>
      ${DEMO ? '<p class="small muted">미리보기에서는 아무 비밀번호나 입력 가능</p>' : ''}
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-solid" type="submit">로그인</button>
    </form></div></section>`;
  const form = $('.login-form', main);
  const err = $('.form-error', main);
  $('#pw', main).focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    try {
      await api.login($('#pw', main).value);
      ctx.setAdminLink(true);
      renderDashboard(main, ctx);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });
}

/* ───────── 대시보드 ───────── */

async function renderDashboard(main, ctx) {
  main.innerHTML = `<section class="admin">
    <div class="admin-tabs" role="tablist">
      <button role="tab" data-tab="works">작품</button>
      <button role="tab" data-tab="questions">질문함<span class="badge q-badge" hidden></span></button>
      <button role="tab" data-tab="links">링크</button>
      <button role="tab" data-tab="site">사이트 설정</button>
      <span class="spacer"></span>
      <a class="btn btn-sm" href="${href('/')}" data-link>사이트 보기</a>
      <button class="btn btn-sm logout" type="button">로그아웃</button>
    </div>
    <div class="admin-body"></div>
  </section>`;
  const body = $('.admin-body', main);
  const tabs = { works: tabWorks, questions: tabQuestions, links: tabLinks, site: tabSite };
  const open = async (name) => {
    $$('.admin-tabs [role=tab]', main).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    body.innerHTML = '<p class="muted">불러오는 중…</p>';
    try {
      await tabs[name](body, ctx, refreshBadge);
    } catch (e) {
      body.innerHTML = `<p class="form-error">${esc(e.message)}</p>`;
    }
  };
  const refreshBadge = async () => {
    try {
      const { unseen } = await api.stats();
      const b = $('.q-badge', main);
      b.textContent = unseen;
      b.hidden = !unseen;
    } catch {
      /* 무시 */
    }
  };
  $$('.admin-tabs [role=tab]', main).forEach((b) => b.addEventListener('click', () => open(b.dataset.tab)));
  $('.logout', main).addEventListener('click', async () => {
    await api.logout().catch(() => {});
    ctx.setAdminLink(false);
    ctx.navigate('/');
  });
  refreshBadge();
  open('works');
}

async function uploadTo(file, { onDone, button }) {
  if (!file) return;
  const label = button ? button.textContent : '';
  if (button) {
    button.disabled = true;
    button.textContent = '올리는 중…';
  }
  try {
    const r = await api.upload(file);
    onDone(r);
  } catch (e) {
    toast(e.message);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = label;
    }
  }
}

/* ───────── 작품 ───────── */

async function tabWorks(body, ctx) {
  let works = await api.adminWorks();
  let currentId = null;
  body.innerHTML = `<div class="admin-split">
    <div>
      <div class="btns" style="margin-bottom:12px"><button class="btn btn-sm btn-solid new-work" type="button">새 작품</button></div>
      <ul class="admin-list"></ul>
    </div>
    <div class="editor"></div>
  </div>`;
  const list = $('.admin-list', body);
  const editor = $('.editor', body);

  const drawList = () => {
    list.innerHTML = works.length
      ? works
          .map(
            (w) => `<li><button type="button" data-id="${w.id}" aria-current="${w.id === currentId}">
        <span class="t">${w.thumb ? `<img src="${esc(w.thumb)}" alt="">` : ''}</span>
        <span><span class="n">${esc(w.title)}</span><span class="pill ${w.status === 'published' ? 'pub' : w.status === 'wip' ? 'wip' : ''}">${STATUS_LABEL[w.status]}</span> <span class="small muted">${KIND_LABEL[w.kind]}</span></span>
      </button></li>`
          )
          .join('')
      : '<li class="muted" style="padding:14px 0">등록된 작품 없음. ‘새 작품’으로 첫 작품 등록</li>';
  };
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (b) edit(works.find((w) => w.id === Number(b.dataset.id)));
  });
  $('.new-work', body).addEventListener('click', () =>
    edit({ kind: 'character', status: 'hidden', stage: 0, title: '', subtitle: '', tags: [], thumb: '', thumb_key: '', body_html: '', links: [], sort: 0, slug: '' })
  );

  let offPreview = null;
  function edit(w) {
    currentId = w.id || null;
    drawList();
    if (offPreview) offPreview();
    editor.innerHTML = `<form class="panel work-form">
      <div class="row3">
        <div class="field"><label>분류</label><select class="select" name="kind"><option value="character">캐릭터</option><option value="world">세계관</option></select></div>
        <div class="field"><label>상태</label><select class="select" name="status"><option value="published">공개 (Works에 보임)</option><option value="wip">제작중 (In progress에 보임)</option><option value="hidden">비공개 (나만 보임)</option></select></div>
        <div class="field stage-field"><label>제작 단계</label><select class="select" name="stage">${STAGES.map((s, i) => `<option value="${i}">${s}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>제목</label><input class="input" name="title" required maxlength="120"></div>
      <div class="field"><label>한 줄 소개</label><input class="input" name="subtitle" maxlength="300"></div>
      <div class="row2">
        <div class="field"><label>태그 (쉼표로 구분)</label><input class="input" name="tags" placeholder="로맨스 코미디, 현대물"></div>
        <div class="field"><label>주소에 쓰일 이름 (비우면 제목으로 자동)</label><input class="input" name="slug" placeholder="예: kang-taeju"></div>
      </div>
      <div class="field"><span class="field-label">썸네일 (세로 4:5 비율 추천)</span>
        <div class="dropzone"><div class="pv thumb-pv">${w.thumb ? `<img src="${esc(w.thumb)}" alt="">` : ''}</div>
          <div class="btns"><label class="btn btn-sm attach-btn thumb-btn">이미지 올리기<input type="file" accept="image/*"></label><button class="btn btn-sm thumb-clear" type="button">빼기</button></div></div>
      </div>
      <div class="field"><label>외부 링크 (한 줄에 하나씩, ‘버튼 이름 | 주소’)</label>
        <textarea class="textarea" name="links" style="min-height:90px" placeholder="대화하러 가기 | https://caveduck.io/..."></textarea></div>
      <div class="field"><label>소개 HTML (다른 사이트에 올린 HTML 그대로 붙여넣기)</label>
        <textarea class="textarea code" name="body_html" spellcheck="false"></textarea>
        <div class="btns"><label class="btn btn-sm attach-btn body-img-btn">본문용 이미지 올리고 주소 넣기<input type="file" accept="image/*"></label><button class="btn btn-sm toggle-preview" type="button">미리보기 보기</button></div>
        <iframe class="preview-frame" title="소개 미리보기" hidden></iframe>
      </div>
      <div class="field" style="max-width:220px"><label>정렬 순서 (클수록 앞에)</label><input class="input" name="sort" type="number"></div>
      <p class="form-error" role="alert" hidden></p>
      <div class="btns">
        <button class="btn btn-solid" type="submit">${w.id ? '저장' : '작품 추가'}</button>
        ${w.id && w.status !== 'hidden' ? `<a class="btn" href="${href('/works/' + encodeURIComponent(w.slug))}" data-link>사이트에서 보기</a>` : ''}
        ${w.id ? '<button class="btn btn-danger del" type="button">삭제</button>' : ''}
      </div>
    </form>`;
    const f = $('.work-form', editor);
    f.kind.value = w.kind;
    f.status.value = w.status;
    f.stage.value = String(w.stage || 0);
    f.title.value = w.title;
    f.subtitle.value = w.subtitle;
    f.tags.value = (w.tags || []).join(', ');
    f.slug.value = w.slug || '';
    f.links.value = (w.links || []).map((l) => `${l.label} | ${l.url}`).join('\n');
    f.body_html.value = w.body_html || '';
    f.sort.value = w.sort || 0;
    let thumbKey = w.thumb_key || '';
    let thumbUrl = w.thumb || '';

    const stageField = $('.stage-field', f);
    const syncStage = () => (stageField.style.visibility = f.status.value === 'wip' ? 'visible' : 'hidden');
    f.status.addEventListener('change', syncStage);
    syncStage();

    const pv = $('.thumb-pv', f);
    $('.thumb-btn input', f).addEventListener('change', (e) =>
      uploadTo(e.target.files[0], {
        button: $('.thumb-btn', f),
        onDone: (r) => {
          thumbKey = r.key;
          thumbUrl = r.url;
          pv.innerHTML = `<img src="${esc(r.url)}" alt="">`;
        },
      })
    );
    $('.thumb-clear', f).addEventListener('click', () => {
      thumbKey = '';
      thumbUrl = '';
      pv.innerHTML = '';
    });
    $('.body-img-btn input', f).addEventListener('change', (e) =>
      uploadTo(e.target.files[0], {
        button: $('.body-img-btn', f),
        onDone: (r) => {
          const ta = f.body_html;
          const tag = `<img src="${r.absolute || r.url}" alt="" style="max-width:100%">`;
          const at = ta.selectionStart ?? ta.value.length;
          ta.value = ta.value.slice(0, at) + tag + ta.value.slice(at);
          toast('본문에 이미지 삽입 완료');
        },
      })
    );
    const frame = $('.preview-frame', f);
    const tp = $('.toggle-preview', f);
    tp.addEventListener('click', () => {
      frame.hidden = !frame.hidden;
      tp.textContent = frame.hidden ? '미리보기 보기' : '미리보기 닫기';
      if (!frame.hidden) {
        if (offPreview) offPreview();
        offPreview = ctx.mountFrame(frame, f.body_html.value);
      }
    });
    let pt;
    f.body_html.addEventListener('input', () => {
      if (frame.hidden) return;
      clearTimeout(pt);
      pt = setTimeout(() => {
        if (offPreview) offPreview();
        offPreview = ctx.mountFrame(frame, f.body_html.value);
      }, 500);
    });

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('.form-error', f);
      err.hidden = true;
      const links = f.links.value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const i = line.lastIndexOf('|');
          return i === -1 ? { label: '바로가기', url: line } : { label: line.slice(0, i).trim(), url: line.slice(i + 1).trim() };
        });
      const data = {
        id: w.id,
        kind: f.kind.value,
        status: f.status.value,
        stage: Number(f.stage.value),
        title: f.title.value,
        subtitle: f.subtitle.value,
        tags: f.tags.value,
        slug: f.slug.value,
        thumb_key: thumbKey,
        thumb: thumbUrl,
        links,
        body_html: f.body_html.value,
        sort: Number(f.sort.value) || 0,
      };
      try {
        const saved = await api.saveWork(data);
        const i = works.findIndex((x) => x.id === saved.id);
        if (i === -1) works.unshift(saved);
        else works[i] = saved;
        toast(w.id ? '저장 완료' : '작품 추가 완료');
        edit(saved);
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
      }
    });
    const del = $('.del', f);
    if (del)
      del.addEventListener('click', async () => {
        if (!confirm(`‘${w.title}’ 삭제 (복구 불가)`)) return;
        await api.deleteWork(w.id);
        works = works.filter((x) => x.id !== w.id);
        currentId = null;
        drawList();
        editor.innerHTML = '';
        toast('삭제 완료');
      });
  }
  drawList();
  if (works.length) edit(works[0]);
  return () => offPreview && offPreview();
}

/* ───────── 질문함 ───────── */

async function tabQuestions(body, ctx, refreshBadge) {
  const qs = await api.questions();
  if (!qs.length) {
    body.innerHTML = '<p class="muted">받은 질문 없음</p>';
    return;
  }
  const open = qs.filter((q) => !q.answer).length;
  body.innerHTML = `<p class="muted" style="margin:0 0 16px">답변 대기 ${open}개 · 전체 ${qs.length}개</p><div class="q-list"></div>`;
  const listEl = $('.q-list', body);
  listEl.innerHTML = qs
    .map(
      (q) => `<article class="q-item ${q.seen ? '' : 'unseen'}" data-id="${q.id}">
      <div class="meta"><span>${fmtDate(q.created_at)} ${new Date(q.created_at).toTimeString().slice(0, 5)}</span><span class="status ${q.answer ? 'ok' : ''}">${q.answer ? '답변함' : '답변 대기'}</span></div>
      <p class="body"></p>
      ${q.images.length ? `<div class="imgs">${q.images.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="첨부 이미지"></a>`).join('')}</div>` : ''}
      <textarea class="textarea" style="min-height:110px" placeholder="답변 입력"></textarea>
      <div class="btns"><button class="btn btn-sm btn-solid save" type="button">답변 저장</button><button class="btn btn-sm block" type="button">이 사람 차단</button><button class="btn btn-sm btn-danger del" type="button">삭제</button></div>
    </article>`
    )
    .join('');
  $$('.q-item', listEl).forEach((el, i) => {
    const q = qs[i];
    $('.body', el).textContent = q.body;
    $('textarea', el).value = q.answer || '';
    if (!q.seen) api.markSeen(q.id).then(refreshBadge).catch(() => {});
    $('.save', el).addEventListener('click', async () => {
      const a = $('textarea', el).value;
      await api.answer(q.id, a);
      q.answer = a.trim();
      const st = $('.status', el);
      st.textContent = q.answer ? '답변함' : '답변 대기';
      st.classList.toggle('ok', !!q.answer);
      el.classList.remove('unseen');
      toast(q.answer ? '답변 저장 완료' : '답변 삭제 완료');
    });
    $('.block', el).addEventListener('click', async () => {
      if (!confirm('이 질문을 보낸 접속지의 질문 차단')) return;
      await api.blockQuestion(q.id);
      toast('차단 완료');
    });
    $('.del', el).addEventListener('click', async () => {
      if (!confirm('이 질문과 첨부 이미지 삭제 (복구 불가)')) return;
      await api.deleteQuestion(q.id);
      el.remove();
      toast('삭제 완료');
    });
  });
}

/* ───────── 링크 ───────── */

async function tabLinks(body, ctx) {
  let links = await api.adminLinks();
  const draw = () => {
    body.innerHTML = `<div class="panel">
      <table class="links-table"><thead><tr class="small muted"><td>사이트 이름</td><td>주소</td><td>한 줄 설명</td><td style="width:80px">순서</td><td></td></tr></thead>
      <tbody>${links
        .map(
          (l, i) => `<tr data-i="${i}">
        <td><input class="input" name="name" value="${esc(l.name)}"></td>
        <td><input class="input" name="url" value="${esc(l.url)}"></td>
        <td><input class="input" name="note" value="${esc(l.note || '')}"></td>
        <td><input class="input" name="sort" type="number" value="${Number(l.sort) || 0}"></td>
        <td><div class="btns"><button class="btn btn-sm save" type="button">저장</button><button class="btn btn-sm btn-danger del" type="button">삭제</button></div></td>
      </tr>`
        )
        .join('')}
      <tr class="new"><td><input class="input" name="name" placeholder="예: CaveDuck"></td><td><input class="input" name="url" placeholder="https://"></td><td><input class="input" name="note" placeholder="주 활동 플랫폼"></td><td><input class="input" name="sort" type="number" value="${links.length}"></td>
      <td><button class="btn btn-sm btn-solid add" type="button">추가</button></td></tr>
      </tbody></table>
      <p class="small muted" style="margin:14px 0 0">순서: 작은 숫자가 위</p></div>`;
  };
  const read = (tr) => ({ name: $('[name=name]', tr).value, url: $('[name=url]', tr).value, note: $('[name=note]', tr).value, sort: Number($('[name=sort]', tr).value) || 0 });
  body.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    try {
      if (e.target.closest('.add')) {
        links.push(await api.saveLink(read(tr)));
        links.sort((a, b) => a.sort - b.sort);
        ctx.invalidateCache();
        draw();
        toast('링크 추가 완료');
      } else if (e.target.closest('.save')) {
        const i = Number(tr.dataset.i);
        links[i] = await api.saveLink({ id: links[i].id, ...read(tr) });
        ctx.invalidateCache();
        toast('저장 완료');
      } else if (e.target.closest('.del')) {
        const i = Number(tr.dataset.i);
        if (!confirm(`‘${links[i].name}’ 링크 삭제`)) return;
        await api.deleteLink(links[i].id);
        links.splice(i, 1);
        ctx.invalidateCache();
        draw();
        toast('삭제 완료');
      }
    } catch (ex) {
      toast(ex.message);
    }
  });
  draw();
}

/* ───────── 사이트 설정 ───────── */

async function tabSite(body, ctx) {
  const s = await api.settings();
  body.innerHTML = `<form class="panel site-form" style="max-width:760px">
    <div class="field"><label>닉네임 (첫 화면 하단에 크게 표시)</label><input class="input" name="nickname" maxlength="24"></div>
    <div class="field"><span class="field-label">첫 화면 큰 이미지 (가로 사진 추천, 2400px 이상 권장)</span>
      <div class="dropzone"><div class="pv wide hero-pv">${s.hero_image_url ? `<img src="${esc(s.hero_image_url)}" alt="">` : ''}</div>
      <div class="btns"><label class="btn btn-sm attach-btn hero-btn">이미지 올리기<input type="file" accept="image/*"></label><button class="btn btn-sm hero-clear" type="button">빼기</button></div></div></div>
    <div class="field"><label>첫 화면 가운데 문구</label><input class="input" name="hero_note" maxlength="60"></div>
    <div class="field"><label>한 줄 소개 (첫 화면 다음에 크게 표시, 비우면 숨김)</label><input class="input" name="about" maxlength="80"></div>
    <button class="btn btn-solid" type="submit">설정 저장</button>
  </form>`;
  const f = $('.site-form', body);
  f.nickname.value = s.nickname || '';
  f.hero_note.value = s.hero_note || '';
  f.about.value = s.about || '';
  let heroKey = s.hero_image || '';
  $('.hero-btn input', f).addEventListener('change', (e) =>
    uploadTo(e.target.files[0], {
      button: $('.hero-btn', f),
      onDone: (r) => {
        heroKey = r.key;
        $('.hero-pv', f).innerHTML = `<img src="${esc(r.url)}" alt="">`;
      },
    })
  );
  $('.hero-clear', f).addEventListener('click', () => {
    heroKey = '';
    $('.hero-pv', f).innerHTML = '';
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.saveSettings({ nickname: f.nickname.value.trim() || 'saccharin', hero_note: f.hero_note.value, about: f.about.value.trim(), hero_image: heroKey });
      ctx.invalidateCache();
      toast('설정 저장 완료');
    } catch (ex) {
      toast(ex.message);
    }
  });
}
