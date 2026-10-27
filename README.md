# Classroom · 2학년 1반

접속 주소: https://classroom-21-api.ssyyjeong2012.workers.dev

## 사용

학생: 이름 선택 → 학번(2101~2128) 입력 → 기록 조회. 개인 조회 코드는 사용하지 않습니다. 학번은 공개된 정보이므로 이 과정은 본인 인증이 아니며, 다른 학생도 학번을 입력해 기록을 볼 수 있습니다.

관리자: 처음 요청한 관리자 비밀번호로 로그인 → 학생 선택 → 기록 추가/최근 기록 취소. 수정 권한은 서버에서 관리자 세션을 확인합니다. 비밀번호는 Cloudflare Secret에 보관합니다.

바탕화면의 `2학년 1반 기록.webloc`을 열면 접속합니다. 과거에 만든 학생 코드표와 STUDENT_CODES Secret은 더 이상 사용하지 않습니다. 기존 D1 기록은 유지됩니다.

## 화면과 서버

- index.html: 화면 구성
- style.css: 디자인
- app.js: 명단, 조회, 그래프, 버튼 동작
- config.js: API 서버 주소
- server/worker.mjs: 서버 인증, 조회/추가/취소 API
- server/migrations/0001_initial.sql: D1 테이블·인덱스·집계 트리거 (이미 적용됨)

현재 화면은 Cloudflare Static Assets로 제공됩니다. 정적 파일은 Worker 코드를 실행하지 않고 제공하며 `/api/*`에서만 서버 처리를 합니다.

GitHub Pages를 사용할 경우 저장소에는 index.html, style.css, app.js, config.js, favicon.svg만 올리면 됩니다. config.js는 현재 Cloudflare 서버로 연결되어 있습니다. Pages URL이 정해지면 server/wrangler.jsonc의 ALLOWED_ORIGIN을 해당 origin(예: https://username.github.io)으로 설정하고 서버를 한 번 배포해야 합니다. 그 뒤 화면 변경은 GitHub에 푸시하면 됩니다. server 폴더와 과거 학생 코드 CSV·비밀 설정은 공개 저장소에 올리지 마세요.

## 서버 사용 최소화

- 첫 화면·명단·검색: API/D1 요청 0회
- 관리자 로그인: API 1회, D1 접근 없음
- 학생 학번 확인+조회: API 1회, SELECT 3개를 D1 batch 1회로 처리
- 조회 결과: 메모리에 60초 캐시. 같은 학생의 동시 조회는 하나로 병합
- 자동 주기 조회 없음. 캐시 만료만으로 자동 요청하지 않음
- 추가/취소: 변경과 최신 결과를 하나의 batch로 반환하여 별도 조회 없음
- 누적/월별 합계를 미리 집계. 최근 내역은 최대 50개, 누적 합계는 전체 반영
- UUID로 중복 추가 방지, 자동 재시도 없음
- Cloudflare 위치별 IP당 약 120회/분, 로그인 약 30회/분 제한. 학교 Wi-Fi에서는 공인 IP를 공유하므로 합산됨

다른 기기 변경은 캐시가 만료된 후 다시 열거나 ‘최신 기록 조회’를 눌러 확인합니다. API 요청 수와 D1 SQL/행 처리 수는 다릅니다. 브라우저 CORS 사전 요청은 추가될 수 있으나 D1을 사용하지 않습니다. 요청 제한은 근사 제한이며 무장애를 보장하지 않습니다.

## Cloudflare 재배포

```sh
cd ~/Desktop/Classroom-21/server
npm run deploy
```

화면 파일만 public/에 복사한 뒤 Worker와 함께 배포합니다. 배포해도 D1 기록은 유지됩니다. 이미 적용된 migrations를 다시 직접 실행하지 마세요.

새 계정 설치 시 npm install → wrangler login → D1 생성 후 ID 입력 → migrations apply --remote → ADMIN_PASSWORD와 SESSION_SECRET(무작위 32자 이상)을 wrangler secret put으로 설정 → npm run deploy 순서입니다. 학생 코드 Secret은 필요 없습니다.

## 인증·저장 특성

관리자 세션은 1시간, 학생의 읽기 전용 세션은 15분이며 HMAC 서명합니다. 세션 검증에는 D1이 필요 없습니다. 학생 학번 확인은 신원 검증이 아닙니다. 로그아웃은 해당 브라우저 메모리에서 세션을 지우며, 개별 서버 토큰 폐기는 구현하지 않았습니다. SESSION_SECRET을 교체하면 전체 세션이 만료됩니다.

D1의 기록 취소는 soft delete입니다. 취소된 기록과 메모는 DB에 남고 화면/합계에서 제외됩니다. DB를 직접 수정하면 집계와 불일치할 수 있으므로 제공된 API로 추가·취소하세요.

## 검증

server 폴더에서 npm test. Node.js 및 Python 3 필요. SQLite로 SQL·집계·중복 방지·인덱스를 검증하고, 프런트엔드 요청 캐시를 VM에서 검사합니다. Cloudflare 바인딩의 로컬 테스트는 테스트 대역을 사용합니다. 실제 서버에서 학번만으로 조회되고 학생 수정은 거부되는지도 확인합니다. 대규모 부하 테스트는 수행하지 않았습니다.
