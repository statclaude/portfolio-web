# portfolio-web — 작업 원칙 및 프로젝트 컨텍스트

원본(`hanjungwoo3/portfolio-web`)을 Fork하여 커스텀 기능을 추가한 React/Vite 주식 포트폴리오 PWA.
**라이브**: https://statclaude.github.io/portfolio-web/

## 저장소 구조
- `origin` = https://github.com/statclaude/portfolio-web.git (내 fork, push 대상, GitHub 계정 statclaude)
- `upstream` = https://github.com/hanjungwoo3/portfolio-web.git (원본, **절대 push 금지**, pull/fetch 전용)
- 배포: `npm run deploy` (build → `git push origin main` → `gh-pages -d dist -b gh-pages`)
- `android-app` 브랜치: 개인용 Android APK 전용, `main`과 분리, **병합 계획 없음**
- `extension/`: 크롬 확장(포트폴리오 시세 프록시) 소스, v1.2.0부터 확장 ID 고정(`cmmbglfgocogholdlpihhlghnbkdipni`)
- remote가 둘(`origin`/`upstream`)이라 `gh` 명령은 기본 저장소를 못 정함 — `gh repo set-default statclaude/portfolio-web`으로 **반드시 fork를 기본 지정**

## 최우선 작업 원칙
1. **프로그램을 바꾸는 코드 수정/커밋/배포 실행 전에는 항상 먼저 사용자에게 실행 여부를 물어볼 것** — 확인 없이 바로 진행하지 않는다. (사용자가 특정 작업 건을 명시적으로 전부 위임하면 그 건에 한해 예외.)
2. `upstream`에는 절대 push 금지. push는 항상 `origin`(fork)으로만.
3. 커스텀 기능은 기존 파일 직접 수정보다 **새 파일 추가 방식**을 선호 (향후 upstream 병합 충돌 최소화).
4. 원격 PC는 **C 드라이브만 사용**, D 드라이브 접근 금지.
5. APK는 원저작자처럼 웹사이트를 통해 공개 배포하지 않는다 — 웹 버전은 계속 최신화하되, APK 다운로드/배포 관련 기능·링크·문서는 추가하지 않고 본인만 빌드해서 직접 사용.
6. "자동 동기화" 워크플로는 upstream 새 커밋을 알려주는 것까지만 — **자동 merge는 하지 않는다** (선별적 cherry-pick 원칙 유지).

## 기술적으로 겪었던 함정 (재발 방지)
- **PowerShell + 한글 파일 편집**: `Get-Content`/`Set-Content`에 `-Encoding UTF8`을 반드시 명시하거나 `[System.IO.File]::WriteAllText`로 UTF-8을 직접 지정할 것 — 인코딩 미지정 시 한글 주석/텍스트가 깨진 전례 있음.
- **localStorage는 origin/앱별로 완전히 분리**된다 — `localhost` 개발 서버, 배포된 `statclaude.github.io`, Android WebView(APK)는 전부 별개의 저장소를 쓴다. "한쪽에선 되는데 다른 쪽에선 안 된다" 증상이 나오면 이 가능성부터 의심할 것 (개인 프록시 URL 등 기기별 설정이 대표 사례).
- **Drive 백업/동기화 페이로드에 새 설정 필드를 추가할 때**는 "모든 기기가 공유해야 하는 값"인지 "기기별로 달라야 하는 기술 설정"인지 먼저 판단 — 후자를 실수로 포함하면 한 기기의 "가져오기"가 다른 기기 설정을 조용히 덮어쓴다 (`db.ts`의 `exportAll()`/`applyImportedSettings()`, `syncManager.ts`의 `normalize()` 양쪽 다 확인).
- **`.github/workflows/*.yml` 파일을 push하려면** PAT에 `repo`와 별도로 `workflow` 스코프가 필요하고, 저장소 Settings → Actions → General → Workflow permissions를 "Read and write permissions"로 바꿔야 워크플로가 이슈 생성/커밋 같은 쓰기 작업을 할 수 있다.
- **여러 upstream 커밋을 선별 cherry-pick할 때**: 시간순 의존관계를 먼저 확인(뒤 커밋이 앞 커밋을 전제할 수 있음), `git show --stat`으로 건드리는 파일이 우리 fork에 그대로 있는지 먼저 대조, 충돌 시 `checkout --`/`clean -f` 같은 파괴적 명령은 diff 내용 확인 전 절대 실행 금지.
- **fork가 이전에 특정 upstream 커밋을 의도적으로 건너뛰었다면**, 후속 커밋이 그 건너뛴 커밋을 전제한 patch일 수 있다 — 존재하지 않는 앵커 대신 현재 fork 구조에 맞는 삽입 위치를 찾아 원래 의도를 동일하게 달성할 것.
- **APK는 원격 로드 아키텍처**라 순수 JS/TS 변경은 `npm run deploy`만으로 웹·APK 양쪽에 반영된다(재빌드 불필요). `AndroidManifest.xml` 같은 네이티브 설정 변경만 예외적으로 `gradlew` 재빌드+재설치 필요.
- **토스처럼 외부 서비스가 정책적으로 막아둔 것**(원자재 로그인 요구, 환율 페이지 모바일 UA 데이터 미제공 등)은 코드로 해결 불가 — 브라우저로 직접 재현해 "서비스 쪽 정책/제약"임을 먼저 확인 후 사용자에게 보류 여부 판단받을 것.
- **cherry-pick 직후에는 반드시 `npx tsc -b`** — 충돌이 없어도 커밋이 upstream 전용 심볼(예: `isSyntheticProxyUrl`, `isNativeApp` import)에 기대면 조용히 타입 오류가 난다(batch2 때 `5dfbbdf`가 실제로 그랬다). 커밋마다 확인하지 않으면 어느 커밋이 깬 건지 못 찾는다.
- **upstream이 여러 번 갈아엎은 기능은 커밋 순차 반영 금지** — 최종 진입점(예: `TicsSectorBoard`)에서 import 폐포만 계산해 가져온다(`git show upstream/main:<path>`로 재귀 추적). 중간 단계 파일(ThemeFlow 등)은 최종본에서 import 0개인 죽은 코드였다. upstream 커밋 중 코드만 바꾸고 테스트를 안 고친 것도 있으니 반영 후 `npx vitest run` 필수.
- **`git cherry`는 충돌 해결로 patch-id가 달라진 cherry-pick을 '미반영(+)'으로 잘못 분류**한다 — 제목(subject) 대조를 병행할 것. `git merge-tree --write-tree --name-only main upstream/main`은 작업트리를 건드리지 않는 병합 시뮬레이션이다.
- **프록시 워커는 `npm run deploy` 로 배포되지 않는다** — `workers/*` 의 화이트리스트를 고쳐도 배포된 워커는 옛 코드다(2026-09-19 `stock.naver.com` 을 안 올려 자금동향·매매동향·수급 차트가 전부 403). Cloudflare 는 `cd workers/proxy && npx wrangler deploy`(PowerShell 에선 `;`), Deno 는 `cd workers/deno-proxy; deno run -A jsr:@deno/deploy --prod`(**`--prod` 필수**, 없으면 프리뷰만 갱신). 호스트를 추가하는 커밋을 반영한 뒤엔 **배포된 워커 주소로 실제 요청을 보내 200 인지 확인**할 것(`Origin: https://statclaude.github.io` 헤더 필요, 없으면 "Forbidden origin").
- **네이버 `stock.naver.com/api/domestic/market/trend/time` 은 최신 거래일 하루치만 준다** — `bizdate`(어떤 이름이든)는 무시되고 과거 페이지도 없다. 과거 날짜 시간별 수급은 현재 소스가 없다(옛 finance.naver 는 410). 일별(`trend/daily`)은 약 1년+ 제공. 그래서 요청일≠응답일이면 데이터를 버리고, 시간별 기본 날짜는 '최신 거래일'이다.
- **토스 WTS 점검(HTTP 490 `unavailable.agency`)이 잦다** — 거래대금 카드·한·미 섹터 보드 등 토스 전용 카드는 점검 중 비게 된다(네이버 대체 없음). "데이터 없음"이 보이면 고장 전에 `curl` 로 토스가 490 인지부터 볼 것(점검 시각이 응답 `data.from/until` 에 있다).

## 현재 진행 상태 (2026-09 기준)

### 완료
- GitHub 인증(PAT), 시세 데이터 표시, 하드코딩 링크, EUR/JPY 환율 카드, Google Drive OAuth 프로덕션 게시, 프록시 이중화(Cloudflare+Deno), 광고 배너 일부 제거, Android APK(개인용) 빌드 및 appId 변경, ETF Sector Flow 기능 반영, Upstream 자동 동기화 알림 워크플로(이슈 방식, 현재 실패 상태 — 아래 참고), 크롬 확장 도메인 수정, APK 뒤로가기/종료/토스 외부링크 개선, **upstream-batch1-naver-fix 병합·배포 완료**(2026-09-13/14, 9개 upstream 커밋 반영), 구글 드라이브 인증 안정화(silent-refresh 타임아웃, 크롬 확장 토큰 갱신, 네이티브 Play Services 인증), 구글 드라이브 UI/데이터 정리(화살표 방향, 전용 프록시 Drive 동기화 제외)., **upstream-batch2 반영**(2026-09-19, 브랜치 `upstream-batch2` — main 병합·배포 전): 네이버 정책 변경 대응(자금동향 302→JSON, 투자자 순매수 410→JSON), 기업가치 일봉/등락 수정, 프록시 안정화(호스트·공급자 차단 기억, 공개 폴링 5분), 수급 팝업·KRX/NXT 분해·기업가치 버튼, 시간외/흐림 판정, 지수 순서, 한·미 섹터(토스 TICS), 기업가치 실적추이·가격대별 순매수, 자산추이 총자산 모드, upstream 알림 워크플로 재설계.

### ⚠️ 미해결 — 다음에 착수할 것
0. **batch2 배포 완료(2026-09-19, main `226ac2e`)** + Cloudflare·Deno 워커 재배포로 `stock.naver.com` 허용(자금동향·매매동향·수급 차트 복구, 두 프록시 모두 200 확인). 남은 확인: 한·미 섹터 보드는 토스 WTS 점검(9/20 11:00 종료) 뒤 화면에서 확인.
1. **upstream 알림 워크플로 — 재설계 완료(커밋 코멘트 + Job Summary), 실전 미검증**: 배포(push) 후 Actions 탭에서 `workflow_dispatch`로 1회 수동 실행해 커밋 코멘트가 실제로 달리는지 확인. `.github/workflows/*.yml` push에는 PAT `workflow` 스코프 필요(위 함정 참고). 기준선(`.github/upstream-sync-state.txt`)은 2026-09-19 upstream/main(`9528194`)으로 맞춰 둠.
2. **외국인·기관 매매동향 "1일" 탭 휴장일 폴백 — 재현 불가로 보류**: 토요일(2026-09-19)에 `trendForeignOrg?periodType=DAY`를 직접 호출하면 HTTP 200으로 직전 거래일(9/18) 데이터가 정상 반환된다(주말은 서버가 이미 폴백). upstream에도 폴백 코드는 없다. **평일 휴장일(추석 연휴 등)에 실제 에러가 나는지 재확인**한 뒤에만 구현할 것 — 추측으로 코드를 넣지 않는다. 참고: 반영된 `73013cf`로 컬럼마다 자기 기준일이 표시되므로 옛 날짜는 화면에서 구분된다.
3. **upstream에서 의도적으로 반영 안 한 것** (2026-09-19 기준, 나중에 다시 묻지 말 것):
   - APK/네이티브 앱 커밋 17개 + `android/` + `public/app/portfolio-app.apk`(5MB) — 작업 원칙 5번(APK 배포 금지)
   - 안내 문구 3개(`d0e05ef` `7321e03` `20c49b6`, 확장·앱을 앞세움) · OnboardingDialog
   - KRX 지수 공지 카드 7개(`e5f020a`~`879c83d`) — 보류
   - `de07d47`(심플보기·팝업 카드 통일) — MobileSimpleView 충돌·포크 커스텀과 겹침, 이득 작음
   - `e8537ed` `256cce6`(ThemeFlow 전용), `aba5f7d`(배너, 이미 제거됨), `09d8233`(EUC-KR nativeProxy — JSON 전환으로 해당 없음)
   - `toss.ts`·`nativeProxy.ts`·`googleAuth.ts`·`SettingsDialog.tsx` 일부 — 포크 전용 커스텀(앱 딥링크, EUR 매핑, 우리가 다듬은 자동로그인 진단)이라 우리 쪽 유지
   - 죽은 코드로 남음: `EtfSectorFlow.tsx`·`EtfSectorDialog.tsx`(UsMarketTab에서 더는 안 씀, ETF랭킹 탭 일부는 사용) — 정리는 선택
4. (선택) 사이트 접근 제한(본인/허용된 사람만) — 대안 논의만 하고 아직 결정 안 됨.
5. (선택) 프록시 공급자 3번째 추가 검토 — 현재 Cloudflare+Deno 2개. batch2로 '막힌 (호스트, 공급자) 조합 기억'이 들어와 한 공급자가 막혀도 덜 아프지만, 동시 다운이 잦으면 고려.

## 참고
- 작업 이력과 트러블슈팅 전체 기록은 claude.ai의 "portfolio app modifier" 프로젝트 문서(`portfolio-web-status.md`, `upstream-batch1-naver-fix-handoff.md`, `upstream-batch2-candidates.md`)에 더 상세히 남아있음 — 이 파일은 그 요약본.
