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

## 현재 진행 상태 (2026-09 기준)

### 완료
- GitHub 인증(PAT), 시세 데이터 표시, 하드코딩 링크, EUR/JPY 환율 카드, Google Drive OAuth 프로덕션 게시, 프록시 이중화(Cloudflare+Deno), 광고 배너 일부 제거, Android APK(개인용) 빌드 및 appId 변경, ETF Sector Flow 기능 반영, Upstream 자동 동기화 알림 워크플로(이슈 방식, 현재 실패 상태 — 아래 참고), 크롬 확장 도메인 수정, APK 뒤로가기/종료/토스 외부링크 개선, **upstream-batch1-naver-fix 병합·배포 완료**(2026-09-13/14, 9개 upstream 커밋 반영), 구글 드라이브 인증 안정화(silent-refresh 타임아웃, 크롬 확장 토큰 갱신, 네이티브 Play Services 인증), 구글 드라이브 UI/데이터 정리(화살표 방향, 전용 프록시 Drive 동기화 제외).

### ⚠️ 미해결 — 다음에 착수할 것
1. **Upstream 자동 동기화 알림 워크플로 고장 상태**: `.github/workflows/upstream-sync.yml`이 저장소 Issues 비활성화로 인해 매 실행마다 실패 중(`Issues has been disabled in this repository`). 사용자가 Issues는 계속 꺼두기로 결정했으므로, **이슈 생성이 아닌 다른 알림 방식**(커밋 코멘트, 상태 파일 diff 등)으로 재설계 필요.
2. **외국인·기관 매매동향 "1일" 탭 — 휴장일 자동 폴백 미구현**: `InvestorFlowTab.tsx`/`api.ts`의 `fetchInvestorRankingsByMarket()`가 부르는 네이버 `trendForeignOrg` API는 날짜 파라미터가 없어 휴장일에 "1일"만 에러. 최종 목표는 다른 날짜-지정 차트들처럼 "휴장일 → 최근 거래일 자동 폴백"을 구현하는 것. **batch2의 `73013cf`("장중 외국인이 전부 0억") 등과 연관 가능성 높음 — batch2 착수 시 최우선 확인.**
3. **upstream batch2 — 13개 신규 커밋 대기 중** (batch1과 무관, `git fetch upstream`으로 발견): ① 시간외/애프터마켓 흐름 판정 로직 4개(연속 수정, 최신본 `d3853e4` 채택 가능성 높음), ② 지수 표시 순서/위치 2개, ③ **수급(매매동향) 4개 — 위 2번 이슈와 직접 관련 가능성 높아 최우선 확인**, ④ 기업가치 차트 2개, ⑤ UI 통합 1개. 착수 전 작업폴더가 깨끗한 상태(커밋 안 된 변경사항 없음)인지 먼저 확인할 것.
4. (보류, 사용자가 "지금 구현하지 않아도 좋음") KRX 지수 공지 카드 신규 기능 7개 커밋(`e5f020a`~`879c83d`) — 필요해지면 재검토.
5. (선택) 사이트 접근 제한(본인/허용된 사람만) — 대안 논의만 하고 아직 결정 안 됨.
6. (선택) 프록시 공급자 3번째 추가 검토 — 현재 Cloudflare+Deno 2개, 자주 동시 다운되면 고려.

## 참고
- 작업 이력과 트러블슈팅 전체 기록은 claude.ai의 "portfolio app modifier" 프로젝트 문서(`portfolio-web-status.md`, `upstream-batch1-naver-fix-handoff.md`, `upstream-batch2-candidates.md`)에 더 상세히 남아있음 — 이 파일은 그 요약본.
