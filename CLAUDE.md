# CLAUDE.md — 제주대 공과대학 교수진 안내 앱

이 파일은 이 저장소에서 작업하는 Claude를 위한 안내서입니다. 작업을 시작하기 전에 전체를 읽으십시오.

## 1. 이 프로젝트가 무엇인가

제주대학교 공과대학 12개 학과 70명 교수진을 정리한 단일 페이지 웹 앱입니다.

- 배포: https://yungbyun.github.io/jejunu-faculty/ (GitHub Pages, `main` 브랜치 루트)
- 로컬: `C:\Users\Yung\Dropbox\incomming\MyAI\Claude\학장선거\jejunu-faculty`

**중요한 맥락:** 사용자(변영철 교수, 컴퓨터공학전공)는 **공과대학 학장 선거**를 준비하고 있습니다.
앱의 "선호도"(확·중·모·부·비)는 각 동료 교수가 자신을 지지할 가능성을 기록한 것입니다.
즉 이 자료는 선거 준비용 개인 자료이며, **정확성이 분량보다 훨씬 중요합니다.**
사실을 모르면 추측해서 채우지 말고 비워 두고 솔직히 보고하십시오. 임용 연도를 박사학위 연도나
첫 논문 연도로 추정하는 식의 채움은 과거에 명시적으로 거부된 방식입니다.

## 2. 구조

```
index.html          버전 확인 후 app.js / styles.css 를 캐시버스팅해서 로드
app.js              라우팅·렌더링·로그인·선호도·AI 재작성 등 모든 로직 (약 110KB, 단일 파일)
styles.css          전체 스타일 (단일 파일)
version.json        {"v":"20260919t"} — 배포 때마다 값을 올린다
data/professors.json    교수 기본 데이터(시트 폴백)
data/insights/<dept>.json   학과별 상세 데이터 12개
data/photos/            사진 + manifest.json
apps-script/Code.gs     Google Apps Script 웹 앱 소스 (저장소에는 사본만, 실제 배포는 수동)
a.bat                   git add -A / commit / push 한 번에
```

라우팅은 해시 기반입니다: `#/`, `#/dept/<id>`, `#/dept/<id>/prof/<slug>`, `#/stats`, `#/quiz`.

학과 id: `foodse, chemeng, archieng, elec, telecom, comdol, ai, ce, mse, nuclear, archidesign, civil`

## 3. 데이터 흐름

1. 앱은 Google 스프레드시트(ID `1YhXtXKg0SufowUr28Vx3y2bwSA5hP2FHIYg1ZPeJu6U`)를 gviz CSV로 읽으려 시도합니다.
2. **현재 이 시트는 비공개이므로 401이 납니다.** 그래서 앱은 `data/professors.json` 폴백을 씁니다.
   화면 하단에 "시트를 읽지 못해 백업 데이터를 표시합니다"가 뜨는 것은 **정상이며 고장이 아닙니다.**
3. 교수별 상세 내용은 `data/insights/<dept>.json` 에서 읽습니다.

> **시트를 절대 공개로 바꾸지 마십시오.** 같은 스프레드시트의 `ratings` 탭에 동료 교수 평가가 들어 있습니다.

### insights JSON 스키마

```jsonc
{
  "updated": "…",
  "profs": {
    "<slug>": {
      "highlights": [...],
      "items":  [...],            // 검색 결과 항목
      "note":   "...",
      "joined": {                 // 제주대 임용 시기 (검색 결과 맨 위에 표시)
        "year": 1986,
        "text": "1986년부터 제주대 재직",
        "src": "https://…professorinfo.htm",
        "src_name": "학과 홈페이지 교수 약력",
        "memo": "조교 시작"       // 정식 전임 임용이 아닌 경우에만
      },
      "ai": {                     // AI 융합 방향
        "sum": "...",
        "items": [ { "t": "제목", "term": "용어 풀이", "concl": "결론" } ]
      },
      "kw": ["키워드", ...]        // 강조할 키워드, 긴 것부터 정렬
    }
  }
}
```

## 4. 서버 (Apps Script)

`apps-script/Code.gs` 는 사본입니다. 실제 서버는 Apps Script 웹 앱이며 URL은 `app.js` 의
`CONFIG.RATINGS.API_URL` 에 있습니다. 액션: `session`, `list`, `setting`, `set`,
`airewrite`, `airewrite_reset`.

**고쳤을 때 배포 방법 (사용자가 직접 해야 함):** Apps Script 편집기에 붙여넣고 저장만 하면 아무 일도
일어나지 않습니다. 반드시 **배포 → 배포 관리 → 새 버전**으로 다시 배포해야 반영됩니다.
반영이 안 되면 앱에서 `bad action` 오류가 납니다.

### 절대 깨뜨리면 안 되는 제약

- **`apiPost` 는 헤더를 하나도 보내지 않습니다.** 이것이 요청을 CORS "simple request"로 유지시킵니다.
  `Content-Type: application/json` 등을 추가하면 preflight(OPTIONS)가 발생하고 Apps Script는
  이에 응답할 수 없어 **저장 기능 전체가 죽습니다.**
- Anthropic API 키(`ANTHROPIC_KEY`)는 Apps Script의 스크립트 속성에만 존재합니다.
  **Claude는 이 키를 절대 받거나 다루지 않습니다.** 대화나 파일에 노출되면 즉시 폐기해야 합니다.
  APP_SECRET(앱 토큰 HMAC 키)도 같습니다.

## 5. 배포 절차

1. 파일을 수정한다.
2. **`version.json` 의 값을 반드시 올린다** (`20260919t` → `20260919u` 식). 안 올리면 사용자
   브라우저가 옛 `app.js`/`styles.css`를 계속 씁니다.
3. `a.bat` 실행 또는 `git add -A && git commit -m "..." && git push`.
4. 확인은 캐시를 우회해서: `https://yungbyun.github.io/jejunu-faculty/version.json?cb=<아무값>`
   GitHub Pages 반영에는 보통 1~2분 걸립니다. 브라우저에서는 `?r=1` 을 붙이거나 `Ctrl+Shift+R`.

## 6. 글쓰기 규칙 (사용자가 직접 정한 것 — 반드시 지킬 것)

### AI 융합 방향 (`ai.items`)

전문용어를 **먼저 풀어서 설명하고**, 왜 그것이 어려운 문제인지 말한 다음, 마지막에 결론을 냅니다.
비전문가(다른 학과 교수, 직원)가 읽는다고 가정하고 실생활 비유를 씁니다.

- `term` — 용어 풀이 + 왜 어려운 문제인지 (접었다 펼 수 있는 부분)
- `concl` — 결론 한 문장 (항상 보이는 부분)

사용자가 직접 제시한 모범 예시의 뼈대: "CoFe·NiFe는 코발트-철, 니켈-철 합금계 촉매를 가리킵니다.
조성은 그 합금의 배합 비율입니다. … 따라서 금속 배합을 수백 가지 다 만들어 보는 대신, 지금까지 만들어 본
결과를 근거로 다음에 시도할 배합을 몇 개만 골라 줍니다."

화면 표시는 **번호 배지 + 결론 먼저** 방식입니다. (초록색 왼쪽 바 디자인은 거부되었습니다.)

### 강조

- 모델 출력의 `**굵게**` 는 항목당 **2~3곳까지만**. 그 외 마크다운 문법은 금지.
- 렌더링은 `aiRich()` 가 담당합니다: **HTML을 먼저 이스케이프한 뒤** 강조 표시를 `<strong>`으로 바꿉니다.
  순서를 뒤집으면 XSS가 열립니다.
- `kw` 키워드는 원문에 **글자 그대로 존재해야** 합니다. 합치기 전에 검증하십시오.

## 7. 사용자와 일하는 방식

- 한국어로 답합니다.
- 파일을 **삭제하기 전에는 반드시 확인**을 받습니다.
- 모르는 사실은 채우지 말고 보고합니다. 임용 시기는 현재 70명 중 약 31명만 확인되었습니다.
  나머지는 교무처 명부가 있어야 채울 수 있습니다.
- 제주대 학과 홈페이지는 외부에서 직접 가져오지 못하는 경우가 많습니다(robots/SSL).
  각 학과 `professorinfo.htm` 의 교수 상세(+ 버튼) 약력에 임용 연도가 들어 있습니다.

## 8. 알려진 함정

- 시트 401 폴백 메시지는 정상입니다.
- `WebFetch` 는 URL별로 15분간 응답을 캐시합니다. 배포 확인은 반드시 쿼리스트링을 바꿔서 하십시오.
- 예전에 원격 셸이 `.git/index.lock` 을 남겨 커밋이 막힌 적이 있습니다. Claude Code는 사용자
  컴퓨터에서 직접 돌므로 이 문제가 없습니다. 그래도 lock 파일이 보이면 삭제 후 진행하십시오.
