# Portfolio Deno Deploy Proxy

Cloudflare Worker / Vercel Edge Function 동등 로직.
무료: **100k req/일** · 100GB transfer/월.
Cloudflare(100k) + Vercel(100k) + Deno(100k) = **합산 300k req/일**.

## 배포 (새 Deno Deploy 콘솔 — `*.deno.net`)

`deno.json` 의 `deploy.org/app` 에 이 앱(`statclaude/portfolio-deno-proxy`)이 지정돼 있다. **최초 1회** 브라우저 로그인이 필요하다.

```powershell
cd workers/deno-proxy
deno run -A jsr:@deno/deploy --prod        # = deno task deploy
```

- ⚠️ **`--prod` 를 빼면 프리뷰 주소로만 올라가고 실제 주소는 그대로다**(옛 코드). 화이트리스트를 고쳤는데 403 이 계속되면 이걸 의심할 것.
- `npx deno deploy --prod` 는 npm 래퍼가 옵션을 두 번 넘겨 "Option ... can only occur once" 로 실패한다. `deno` 를 직접 쓰거나 위처럼 `jsr:@deno/deploy` 를 호출한다.
- 배포 후 확인: 앱이 쓰는 주소로 실제 요청을 보내 200 인지 본다(Origin 헤더 필요).

## (구) 배포 — 옛 dash.deno.com 기준. 새 콘솔에서는 화면이 다르다

### A. 웹 (가장 빠름, 1-2분)

1. https://deno.com → **Sign in with GitHub** (1클릭 가입)
2. https://dash.deno.com → **New Playground**
3. Playground 에디터에 `main.ts` 내용 전체 복사·붙여넣기
4. 우측 상단 **Save & Deploy** 클릭
5. 발급된 URL 확인 (예: `https://<random-name>.deno.dev`)
6. 프로젝트 이름 변경: 좌측 메뉴 → **Settings** → 원하는 이름 (예: `portfolio-deno-proxy`)

### B. CLI (반복 배포 자동화)

```bash
# deployctl 설치
deno install -gArf jsr:@deno/deployctl

cd workers/deno-proxy
deployctl deploy --project=portfolio-deno-proxy main.ts
```

## 로컬 실행

```bash
deno task dev
# 또는
deno run --allow-net main.ts
```

## 사용

```
GET https://<your-project>.deno.dev/?url=<encoded_target>
```
