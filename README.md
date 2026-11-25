# sccharinfever.com 설치 안내

이 폴더가 홈페이지 전체예요. 코드는 깃허브에 올리고, Cloudflare(클플)가 깃허브에서 가져가 자동으로 사이트를 띄워요.
아래 순서대로 한 번만 설정하면, 그 뒤로는 사이트의 **관리 페이지(sccharinfever.com/admin)** 에서 작품·질문·링크를 다 관리할 수 있어요.

걸리는 시간: 30분 정도 · 비용: 도메인 말고는 무료 (개인 사이트 사용량 기준)

---

## 0. 폴더 구성

```
saccharinfever/
├─ wrangler.jsonc   ← 클플 설정 (2·4단계에서 값 2개만 바꿈)
├─ package.json
├─ src/worker.js    ← 서버 (API·로그인·질문·이미지·디스코드 알림)
└─ public/          ← 화면 (HTML·CSS·JS·폰트)
```

---

## 1. 깃허브에 올리기

1. github.com → 오른쪽 위 **+** → **New repository**
2. 이름: `saccharinfever` / **Private(비공개)** 선택 → **Create repository**
3. 만들어진 저장소 화면에서 **uploading an existing file** 클릭
4. 압축을 푼 `saccharinfever` 폴더 **안의 내용물**(wrangler.jsonc, package.json, src, public 등)을 끌어다 놓기
   - 깃허브 웹은 한 번에 100개 파일까지만 올라가요. 폰트 파일이 많아서 넘치면 두 번에 나눠 올리세요.
     (1차: `public/fonts` 빼고 전부 → 2차: `public/fonts` 폴더)
5. 아래 **Commit changes** 클릭

> `.dev.vars` 파일은 내 컴퓨터 테스트용이라 올리지 않아도 돼요(들어 있지도 않아요).

---

## 2. 데이터베이스(D1) 만들기

1. 클플 대시보드 → 왼쪽 메뉴 **Storage & databases → D1 SQL database** → **Create**
2. 이름: `saccharinfever-db` → 만들기
3. 만들어진 화면의 **Database ID**(긴 영문·숫자)를 복사
4. 깃허브 저장소에서 `wrangler.jsonc` 열기 → 연필(✏️) 아이콘 → 
   `REPLACE_WITH_D1_DATABASE_ID` 를 복사한 ID로 바꾸기 → **Commit changes**

표(테이블)는 사이트가 처음 켜질 때 자동으로 만들어져요. 따로 할 일 없어요.

---

## 3. 이미지 저장소(R2) 만들기

1. 대시보드 → **Storage & databases → R2 object storage**
2. 처음이면 R2 사용 신청 화면이 나오고 **결제수단 등록**을 요구할 수 있어요.
   무료 한도(저장 10GB, 다운로드 비용 없음) 안에서는 청구되지 않아요.
3. **Create bucket** → 이름: `saccharinfever-media` → 만들기 (나머지 설정은 기본값)

버킷을 '공개'로 바꿀 필요 없어요. 이미지는 사이트가 직접 꺼내서 보여주고, 익명 질문 이미지는 질문자와 관리자에게만 보여줘요.

---

## 4. 스팸 방지 캡챠(Turnstile) 만들기

1. 대시보드 → **Turnstile**(Application security 아래) → **Add widget**
2. 이름: `saccharinfever` / **Hostname**에 `sccharinfever.com` 추가 / 모드: **Managed** → 만들기
3. 두 개의 키가 나와요
   - **Site Key** → 깃허브의 `wrangler.jsonc`에서 `REPLACE_WITH_TURNSTILE_SITE_KEY` 자리에 붙여넣고 Commit
   - **Secret Key** → 메모장에 잠깐 복사해두기 (6단계에서 씀, 깃허브에는 절대 넣지 마세요)

---

## 5. 사이트 띄우기 (깃허브 연결)

1. 대시보드 → **Workers & Pages** → **Create application**
2. **Import a repository** 옆 **Get started** → 깃허브 계정 연결 → `saccharinfever` 저장소 선택
3. 설정 화면에서
   - Project name: `saccharinfever`
   - Build command: 비워두기
   - Deploy command: `npx wrangler deploy` (기본값 그대로)
4. **Save and Deploy**

1~2분 뒤 배포가 끝나면 `wrangler.jsonc`에 적힌 대로 `sccharinfever.com` 도메인이 자동으로 연결돼요.
이제부터는 깃허브에 파일을 고쳐 올릴 때마다 자동으로 다시 배포돼요.

---

## 6. 비밀값 넣기 (비밀번호·키·디스코드)

**Workers & Pages → saccharinfever → Settings → Variables and Secrets → Add**
아래 4개를 하나씩 추가해요. Type은 전부 **Secret**으로 고르세요.

| 이름 (그대로 입력) | 넣을 값 |
|---|---|
| `ADMIN_PASSWORD` | 관리 페이지 비밀번호. 다른 사이트와 다른, 길고 어려운 걸로 |
| `SESSION_SECRET` | 아무 영문·숫자 40자 이상 (로그인 유지용 열쇠. 외울 필요 없음, 비밀번호 생성기로 만들어 붙여넣기) |
| `TURNSTILE_SECRET` | 4단계의 **Secret Key** |
| `DISCORD_WEBHOOK_URL` | 디스코드 웹훅 주소 (아래 참고) |

**디스코드 웹훅 주소 만들기:** 알림 받을 채널 ⚙️ **채널 편집 → 연동 → 웹후크 → 새 웹후크** → **웹후크 URL 복사**

저장하면 바로 적용돼요.

---

## 7. 확인하기

1. `https://sccharinfever.com` 접속 → 첫 화면이 보이면 성공
   - 안 열리면: **Workers & Pages → saccharinfever → Settings → Domains & Routes → Add → Custom domain** 에서 `sccharinfever.com` 직접 추가
2. `https://sccharinfever.com/admin` → 6단계 비밀번호로 로그인
3. **사이트 설정** 탭 → 첫 화면 큰 이미지, 닉네임, 문구 넣기
4. **링크** 탭 → 활동 사이트 추가
5. **작품** 탭 → 새 작품 올리기
6. 다른 브라우저(또는 시크릿 창)로 `/ask`에서 질문 하나 보내기 → 디스코드 알림 오는지 확인

---

## 관리 페이지 사용법

### 작품 올리기
- **분류**: 캐릭터 / 세계관
- **상태**
  - 공개 → Works 목록에 보임
  - 제작중 → In progress 목록에 보임 (제작 단계: 기획 → 작업 → 테스트)
  - 비공개 → 나만 보임 (올려두고 다듬을 때)
  - 제작중이던 걸 **공개로 바꾸기만 하면** Works로 옮겨져요.
- **썸네일**: 세로 4:5 비율이 가장 예쁘게 나와요.
- **소개 HTML**: 다른 사이트에 올린 HTML을 그대로 붙여넣으면 돼요. '미리보기 보기'로 바로 확인할 수 있어요.
  - 붙여넣은 HTML은 사이트와 분리된 틀 안에서 보여서, 그 안의 스타일이 메뉴나 레이아웃을 망가뜨리지 않아요.
  - 본문에 이미지를 넣고 싶으면 **'본문용 이미지 올리고 주소 넣기'** → 커서 위치에 `<img>` 태그가 들어가요.
- **외부 링크**: 한 줄에 하나씩 `버튼 이름 | 주소`  예) `대화하러 가기 | https://caveduck.io/...`
- **주소에 쓰일 이름**: 비워두면 제목으로 만들어져요. 영어로 적으면(예: `kang-taeju`) 공유 주소가 깔끔해요.
- **정렬 순서**: 숫자가 클수록 앞에 나와요. 같으면 최근에 올린 게 앞.

### 질문함
- 새 질문은 파란 선으로 표시되고, 탭 옆에 개수가 떠요.
- 답변을 저장하면 질문자가 자기 링크에서 바로 볼 수 있어요. 답변은 언제든 고칠 수 있어요.
- **이 사람 차단**: 그 질문을 보낸 접속지에서 더 이상 질문을 못 보내요.
- **삭제**: 질문과 첨부 이미지가 함께 지워져요.

### 익명 질문은 어떻게 지켜지나요
- 가입 없이 질문 → 질문자에게 **비밀 링크**가 발급돼요. 그 링크로만 질문·답변을 볼 수 있어요.
- 질문자의 접속 주소(IP)는 원문으로 저장하지 않아요. 차단·도배 방지용으로 되돌릴 수 없는 암호화 값만 남겨요.
- 질문자가 올린 사진의 위치정보는 올리기 전에 브라우저에서 지워져요.
- 같은 접속지에서 10분에 5개 넘게 보내면 잠시 막혀요.
- 디스코드 알림에는 질문 앞부분만 가요. 질문에 `@everyone`이 있어도 멘션이 울리지 않아요.

---

## 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 배포 실패, `database_id` 관련 오류 | 2단계 Database ID를 `wrangler.jsonc`에 넣었는지 |
| 배포 실패, R2 관련 오류 | 3단계 버킷 이름이 `saccharinfever-media`인지 |
| 질문 보낼 때 "스팸 확인을 통과하지 못했어요" | Turnstile Hostname에 `sccharinfever.com`이 있는지, Site Key / Secret Key가 같은 위젯 것인지 |
| 관리자 로그인 "비밀번호가 아직 설정되지 않았어요" | 6단계 `ADMIN_PASSWORD`, `SESSION_SECRET` |
| 로그인 5번 틀려서 잠김 | 15분 기다리면 풀려요 |
| 디스코드 알림이 안 옴 | `DISCORD_WEBHOOK_URL` 값, 웹후크를 지우지 않았는지 |
| 비밀번호 바꾸고 싶음 | 6단계에서 `ADMIN_PASSWORD` 값만 수정 |

작품을 지워도 올렸던 이미지는 R2에 남아 있어요. 정리하고 싶으면 R2 → `saccharinfever-media` → `pub/` 폴더에서 지우면 돼요.

---

## (선택) 내 컴퓨터에서 미리 돌려보기

Node.js가 설치돼 있다면:

```bash
npm install
# .dev.vars 파일을 만들고 아래 3줄 넣기
#   ADMIN_PASSWORD=아무거나
#   SESSION_SECRET=아무거나-길게-40자이상
#   ALLOW_NO_CAPTCHA=true
npx wrangler dev
```

`http://localhost:8787` 에서 확인할 수 있어요. (`ALLOW_NO_CAPTCHA`는 테스트용이라 실제 사이트에는 넣지 마세요.)

---

폰트: Archivo (SIL Open Font License), Pretendard (SIL Open Font License) — `public/fonts`에 포함
