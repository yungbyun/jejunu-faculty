# 제주대학교 교수진 안내 (jejunu-faculty)

학과를 선택하면 해당 학과의 전임교원(교수·부교수·조교수) 목록과 세부 전공, 연락처, 대표 논문을 보여주는 정적 웹 앱입니다.
프레임워크 없이 순수 HTML / CSS / JavaScript로 작성되었고, 데이터는 Google 스프레드시트에서 읽어옵니다.

## 구조

```
index.html          화면 뼈대
styles.css          디자인 토큰(색·타이포·간격), 라이트/다크 테마, 반응형
app.js              데이터 로딩(Google Sheet → CSV 파싱), 해시 라우팅, 렌더링
data/professors.json  시트를 읽지 못할 때 쓰는 백업 데이터
data/professors.csv   같은 내용의 CSV (시트 초기 입력용)
data/photos/          리포지토리에 저장한 교수 사진 (<dept_id>/<영문이름-slug>.jpg) + manifest.json
```

## 데이터 관리 (Google 스프레드시트)

시트 한 장에 교수 한 명이 한 행입니다. 열 이름은 아래와 같고, 첫 행(헤더)은 그대로 두어야 합니다.

| 열 | 설명 |
|---|---|
| `dept_id` | 학과 식별자 (영문, 예: `foodse`, `chemeng`). 같은 학과는 같은 값 |
| `dept_name`, `dept_name_en`, `dept_url`, `dept_color` | 학과명, 영문명, 학과 홈페이지, 학과 대표색(hex) |
| `name`, `name_en`, `rank`, `order` | 이름, 영문명, 직위(교수/부교수/조교수), 학과 내 표시 순서 |
| `photo` | 사진 URL |
| `office`, `phone`, `email`, `homepage`, `scholar` | 연구실, 전화, 이메일, 개인/연구실 홈페이지, Google Scholar 프로필 |
| `tags` | 전공 키워드. 세미콜론(`;`)으로 구분 |
| `summary` | 세부 전공 요약 (50단어 내외) |
| `paper1` … `paper5` | 대표 논문. `제목 | 저널 | 연도` 형식 |

새 학과를 추가하려면 `dept_id`가 새로운 행을 넣기만 하면 첫 화면에 학과 카드가 자동으로 생깁니다.

### 사진

`data/photos/manifest.json`에 적힌 사진(`<dept_id>/<slug>.jpg`, slug는 `name_en`을 소문자·하이픈으로 바꾼 값)이 있으면 시트의 `photo` URL보다 먼저 사용하고, 로컬 사진 로딩에 실패하면 시트 URL로 대체합니다. 학과 홈페이지 사진 링크가 바뀌거나 막혀도 앱이 계속 사진을 보여주도록 하기 위한 장치입니다. 새 교수 사진을 추가하면 `manifest.json`에 `"<dept_id>/<slug>"`를 한 줄 추가하세요.

### 시트 공개 설정 (앱이 읽을 수 있게)

1. 스프레드시트 우측 상단 **공유** → **일반 액세스**를 **링크가 있는 모든 사용자 – 뷰어**로 변경
2. `app.js`의 `CONFIG.SHEET_ID`가 시트 URL의 `/d/…/edit` 사이 값과 같은지 확인

앱은 30분 동안 브라우저에 데이터를 캐시합니다. 시트를 고친 뒤 즉시 확인하려면 주소 뒤에 `?nocache=1`을 붙여 여세요.

## Google 로그인 (선택)

`app.js`의 `CONFIG.AUTH.CLIENT_ID`에 OAuth 클라이언트 ID를 넣으면 첫 화면에 Google 로그인 게이트가 생깁니다. 비워 두면 로그인 없이 동작합니다.

1. [Google Cloud 콘솔](https://console.cloud.google.com/) → 프로젝트 선택(또는 새로 만들기)
2. **API 및 서비스 → OAuth 동의 화면**: 사용자 유형 *외부*, 앱 이름·지원 이메일 입력 후 저장. (테스트 상태로 두면 *테스트 사용자*에 등록한 계정만 로그인 가능하니, 여러 사람이 쓰려면 **앱 게시**를 누릅니다.)
3. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: *웹 애플리케이션*
   - 승인된 JavaScript 원본: `https://yungbyun.github.io` (로컬 테스트용으로 `http://localhost:8080` 추가 가능)
   - 리디렉션 URI는 비워 둠
4. 만들어진 **클라이언트 ID**(`xxxx.apps.googleusercontent.com`)를 `app.js`의 `CONFIG.AUTH.CLIENT_ID`에 붙여 넣습니다.
5. 허용 범위를 정합니다.
   - `ALLOWED_DOMAINS: ['jejunu.ac.kr']` → 해당 도메인 메일은 모두 통과
   - `ALLOWED_EMAILS: ['someone@gmail.com']` → 특정 계정만 추가 허용
   - 둘 다 비우면 Google 로그인만 하면 누구나 통과
6. 로그인 상태는 브라우저에 `SESSION_HOURS`(기본 7일) 동안 유지되며, 우측 상단 **로그아웃**으로 해제합니다.

> 정적 사이트이므로 이 로그인은 *화면 접근*만 막습니다. 데이터(Google 시트, `data/` 폴더)는 URL을 알면 여전히 내려받을 수 있으니, 데이터 자체를 보호해야 하면 백엔드가 필요합니다.

## GitHub Pages 배포

1. GitHub에서 `jejunu-faculty` 리포지토리를 만들고 이 폴더를 push
2. 리포지토리 **Settings → Pages → Build and deployment → Source: Deploy from a branch**, Branch: `main` / `(root)` 저장
3. 1~2분 뒤 `https://<사용자명>.github.io/jejunu-faculty/` 에서 확인

## 로컬에서 보기

`fetch`를 쓰므로 파일을 직접 열지 말고 간단한 서버로 띄웁니다.

```
python3 -m http.server 8080
# http://localhost:8080
```
