# saccharin 홈페이지 — 작업 안내

AI 채팅 캐릭터 제작자 saccharin의 개인 홈페이지. 운영자는 개발자가 아님 → 설명은 쉬운 한국어로, 변경 후 무엇이 바뀌었는지 짧게 보고.

## 기본 정보
- 사이트: https://sccharinfever.com  ← **도메인 철자 a 빠진 게 맞음. 절대 고치지 말 것**
- 배포: `main`에 push → Cloudflare Workers Builds가 `npx wrangler deploy`로 자동 배포 (1~2분)
- 빌드 단계 없음. 바닐라 JS(ES 모듈) + CSS. 프레임워크·번들러 추가 금지(요청 시 제외)
- Worker 이름 `saccharinfever` (wrangler.jsonc `name`과 대시보드 이름이 같아야 배포됨)

## 파일 구조
```
wrangler.jsonc        바인딩·공개 변수·도메인
src/worker.js         서버 전부: API, 관리자 로그인, 익명 질문, 이미지(R2), 디스코드 알림, D1 스키마(자동 생성)
public/index.html     뼈대(상단 고정 메뉴, 모바일 메뉴, 페이지 전환 커튼)
public/css/style.css  디자인 전부 (토큰은 :root)
public/js/app.js      라우터 + 공개 페이지(home/works/work/wip/ask/askView/links/404) + 스크롤 효과
public/js/admin.js    관리 페이지(/admin): 작품·질문함·링크·사이트 설정
public/js/util.js     esc(), href(), cardHTML(), stageHTML(), toast() 등 공용
public/js/api.js      fetch 래퍼. window.SF_DEMO면 demo.js 가짜 데이터 사용
public/js/demo.js     미리보기 전용 가짜 데이터 (실사이트에선 안 쓰임)
public/fonts/         Archivo(가변, wdth 62–125) + Pretendard 자체 호스팅
```

## 바인딩 / 비밀값 (값은 대시보드에만 있음, 코드·커밋에 절대 넣지 말 것)
- `DB`(D1 saccharinfever-db), `MEDIA`(R2 saccharinfever-media), `ASSETS`
- vars: `SITE_URL`, `TURNSTILE_SITEKEY`
- secrets: `ADMIN_PASSWORD`, `SESSION_SECRET`, `TURNSTILE_SECRET`, `DISCORD_WEBHOOK_URL`

## 데이터
- works: kind(character|world), status(published|wip|hidden), stage(0기획/1작업/2테스트), title, subtitle(한 줄 소개), description(설명, 상세·제작중 목록에 표시), thumb(R2 key), body_html, links(JSON), sort
  - `tags` 칸은 옛 데이터용으로만 남아 있음(사용 안 함, 태그 기능 없음)
- questions: token_hash(비밀 링크 해시), body, images(R2 key 배열), answer, seen, ip_hash
- links, settings(nickname, hero_note, about, hero_image), blocks, login_attempts
- visits(day, vid): 일일 순 방문자. 한국 시간 기준, vid = IP+UA+날짜 해시. 관리자·봇 제외, 90일 지난 건 자동 삭제. 관리 페이지 '방문자' 탭에서만 보임
- 이미지: `pub/…` 공개(/media/pub/…), `q/…` 질문 첨부 → 관리자 또는 질문자 토큰으로만 열람
- 스키마 변경 시 `SCHEMA` 배열에 `ALTER`/`CREATE IF NOT EXISTS`로 추가 (기존 데이터 보존)

## 디자인 규칙
- 색: paper `#f3f4f4` / ink `#2a2c2f` 두 톤. 포인트 `#00c6ff`는 **현재 상태 표시에만**(활성 메뉴 점, 제작 단계, 답변 도착, 포커스)
- 대형 타이포: Archivo 800, 좁은 폭(font-stretch 62~72%), 소문자 영문 제목. 본문 한글 Pretendard
- 첫 화면: 큰 이미지 + 하단 닉네임. 스크롤 시 닉네임 폭이 좁아지며 커짐(setupHeroName). 상단 가운데 문구 하나
- 레퍼런스 톤: 해외 디자인 어워드 디자이너 포트폴리오. 템플릿 느낌·카드 그림자·그라데이션 장식 지양
- 모션은 스크롤 연동 위주, `prefers-reduced-motion` 존중
- **사이트 고정 문구는 명사형/개조식** ("최근에 공개한 캐릭터 및 세계관", "저장 완료"). "~해요/~에요" 금지. 길게 쓰지 않기

## 구현 주의
- 작품 소개 HTML은 `mountFrame()`으로 sandbox iframe(srcdoc)에 렌더 → 사이트 스타일과 격리, 높이는 postMessage로 자동
- 이미지 공개 효과 `.rv-img`: clip-path는 **자식에** 걸 것(관찰 대상에 걸면 IntersectionObserver가 감지 못함)
- 사용자 입력(질문·답변)은 반드시 textContent 또는 esc()로 출력
- SPA: 확장자 없는 경로는 worker가 index.html로 돌려줌. 사이트 내부 링크는 `href()` + `data-link`
- 질문: Turnstile 검증 → 차단/10분 5회 제한 → R2 저장 → 디스코드 웹훅(allowed_mentions 비움)

## 로컬 테스트
`.dev.vars`에 `ADMIN_PASSWORD`, `SESSION_SECRET`, `ALLOW_NO_CAPTCHA=true` 넣고 `npx wrangler dev`.
`ALLOW_NO_CAPTCHA`는 테스트 전용 — 실서버에 절대 설정 금지.
