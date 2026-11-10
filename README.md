# Palate Lab — Beli 행동 기반 독립 MVP

> 사용자 제공 Beli 10.5.0 XAPK의 **클라이언트 코드에서 관찰한 원리**를 독립적으로 구현한 토이 프로젝트입니다. Beli의 실제 소스코드·서버 API·저작물·브랜드를 복제하지 않고, 자체 UI와 오프라인 샘플 데이터를 사용합니다.

## 구현 상태

| 기능 | 구현 | 근거 / 한계 |
|---|---|---|
| 탐색, 카테고리, 검색 | ✅ | 오프라인 시연용 데이터 16곳 |
| 긍정·중립·부정 평가 | ✅ | 클라이언트 그룹 분리 원리 기반 |
| 1:1 비교 삽입 | ✅ | 유사도 기반 후보 선택, 비교 범위 축소 기반 **단순화 구현** |
| Undo / Skip | ✅ | 클라이언트 UX 기반. 건너뛰기 후 추정 삽입은 실험용 대체 정책 |
| 개인 점수 | ✅ | `10.0/6.7/3.4 − (3.3/n)×(position−1)` |
| 전체 순위 | ✅ | 카테고리별 점수 우선 k-way merge |
| 북마크 | ✅ | 로컬 SQLite 저장 |
| 추천 목록/점수 | ✅ | **독립적으로 개발한 설명 가능한 휴리스틱**; Beli 추천 모델 아님 |
| 10개 평가 마일스톤 | ✅ | 실험에서 관찰한 자동 노출 UX 재현 |
| 지도·소셜·외부 로그인 | ❌ | 이번 MVP 범위에서 제외 |
| 운영 서버와 데이터 연동 | ❌ | 실제 Beli 서버 호출 없음 |

## 가장 빠른 실행: Python만으로 동작하는 간편 데모

Next.js 설치 없이도 FastAPI 서버만 실행하면 **<http://localhost:8000/>** 에서 탐색·평가·쌍대비교·랭킹·추천·10개 마일스톤을 직접 테스트할 수 있습니다. 아래 API 서버 실행 방법을 먼저 따라 해주세요. 이 단일 HTML UI는 프런트엔드 의존성이 없는 간편 시연 버전입니다.

Next.js UI는 더 풍부한 디자인을 제공하는 별도 구현으로, **npm 설치 및 실제 빌드는 분석 환경의 패키지 레지스트리 연결 문제로 검증하지 못했습니다.** TypeScript/TSX 구문 파싱에는 오류가 없었습니다.

## 로컬 실행 (Windows PowerShell 기준)

### 1) API 서버

Python 3.11 이상. `backend` 폴더에서:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

PowerShell 실행 정책 때문에 `Activate.ps1`이 차단된다면 활성화 대신 `backend\.venv\Scripts\python.exe -m uvicorn ...`을 사용해도 됩니다.

- 간편 시연 화면: <http://localhost:8000/>
- OpenAPI API 설명서: <http://localhost:8000/docs>
- 헬스 체크: <http://localhost:8000/api/health>
- 데이터는 `backend/palate.sqlite3`에 저장됩니다.

### 2) Next.js 프런트엔드

새 터미널을 열고 `frontend` 폴더에서:

```powershell
cd frontend
npm install
Copy-Item .env.local.example .env.local
npm run dev
```

- 접속: <http://localhost:3000>
- 기본 데이터: **9개 장소 이미 평가**, 그 외 장소는 미평가.
- `Bakery Cafe Aoitori`를 `Bakeries / 좋았어요`로 평가하면 기존 `Salt24`와 비교합니다.
- `Salt24`가 더 좋다고 선택하면 **10번째 평가가 완료되며 마일스톤이 자동 등장**합니다.

### 3) 테스트

```powershell
cd backend
pip install pytest httpx
python -m pytest -q
```

`GET /api/lists`는 점수 기반 전체 통합 결과, `GET /api/recommendations`는 원본 서비스와 **무관한 독립 추천 결과**를 보여줍니다.

### Mac / Linux

`python3 -m venv .venv`, `source .venv/bin/activate`, `python3 -m uvicorn ...`, `.env` 파일 복사 시 `cp .env.local.example .env.local`을 사용하면 됩니다.

## 주요 폴더

```text
palate-lab-mvp/
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI 라우트 / 순위 상태 전이
│   │   ├── engine.py       # 클라이언트 기반 점수·후보선택·병합
│   │   ├── recommend.py    # 자체 추천 휴리스틱 (원본과 다름)
│   │   └── db.py           # SQLite/예시 시드
│   ├── tests/test_api.py
│   └── requirements.txt
├── frontend/
│   ├── app/page.tsx        # 화면 및 평가/비교 플로우
│   ├── app/globals.css     # 원본과 별개 디자인 시스템
│   ├── lib/api.ts          # 로컬 API 호출/타입
│   └── package.json
└── docs/
    └── ARCHITECTURE.md
```

## 분석 근거와 불확실성

- 클라이언트 코드 확인: Beli 10.5.0 내부의 `getLikeGroup`, `getSimilarity`, `calculateScoreLocal`, `mergeRankListForAllMode`, 추천 API 호출 구성.
- 개인 점수 공식은 **클라이언트의 로컬 계산**에서 확인된 것이며 원격 서버 확정 점수와 반드시 같다고 주장하지 않습니다.
- 비교 범위 축소는 클라이언트 동작에 기반한 **삽입 슬롯 이진 탐색 형태의 단순화**입니다. 유사도 동점 처리와 Beli의 feature flag·특수 조건을 100% 재현하지 않습니다.
- 전체 병합은 클라이언트가 사용하는 점수 기반 k-way merge의 독립 구현입니다.
- 추천 엔진은 **독립 구현**입니다. Beli의 서버 모델, 학습 데이터와 가중치는 획득하지 않았습니다.
- 데모 장소 이름은 UX 실험을 연결하기 위한 예시이며 `average_score`는 임의 시연 값으로 **실제 영업점의 현재 평점이 아닙니다.**

### 보안 및 외부 통신

- API와 DB는 모두 사용자 로컬 머신에만 있고 Beli 운영 API에 접근하지 않습니다.
- 프런트엔드는 Google Fonts를 사용하므로 인터넷이 없으면 시스템 폰트로 대체됩니다. 외부 이미지나 트래킹 SDK는 없습니다.
- 시연 목적이며 인증/멀티유저·배포 보안·요청 제한·동시성 제어는 구현 범위 밖입니다. 공개 서버에 그대로 배포하지 마세요.
