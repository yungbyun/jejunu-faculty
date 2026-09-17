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

### 시트 공개 설정 (앱이 읽을 수 있게)

1. 스프레드시트 우측 상단 **공유** → **일반 액세스**를 **링크가 있는 모든 사용자 – 뷰어**로 변경
2. `app.js`의 `CONFIG.SHEET_ID`가 시트 URL의 `/d/…/edit` 사이 값과 같은지 확인

앱은 30분 동안 브라우저에 데이터를 캐시합니다. 시트를 고친 뒤 즉시 확인하려면 주소 뒤에 `?nocache=1`을 붙여 여세요.

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
