// Google OAuth 2.0 — 첫 로그인은 implicit flow redirect (모바일 안정성),
// 이후 토큰 갱신은 GIS Token Client 의 silent refresh (hidden iframe) 사용.
// — Drive appdata 스코프만 (이메일·프로필 미요청)
// — Token 은 localStorage 에 1시간 캐시
// — 만료 5분 전 자동 silent refresh 시도, 실패하면 다음 API 호출 시 null 반환
//
// 네이티브 앱(APK)은 Google 이 임베디드 WebView 안에서의 OAuth 를 막기 때문에
// (disallowed_useragent) 시스템 브라우저(Chrome Custom Tab)를 열어 로그인시키고,
// 커스텀 스킴 딥링크(pfportfolio://oauth)로 앱에 돌아온다. 시스템 브라우저는
// 앱 WebView 와 localStorage 가 분리돼 있어 토큰을 거기 저장해봐야 앱이 못 보므로,
// 시스템 브라우저에 돌아온 이 페이지는 토큰을 저장하지 않고 그대로 딥링크로 릴레이만 한다.
// (관련: WEB_RELAY_URI, APP_SCHEME_REDIRECT, handleAppAuthUrl)
//
// ⚠️ 위 방식은 "1시간마다 로그아웃"의 원인이기도 하다 — 시스템 브라우저 릴레이는 implicit
//   flow(access_token 만)라 refresh 수단이 없고, 앱 WebView 에서의 GIS silent refresh 는
//   서드파티 쿠키/iframe 제한으로 거의 항상 실패한다(콜백이 영영 안 옴 → 8초 타임아웃).
//   그래서 APK v1.1.0+ 는 Play 서비스 AuthorizationClient 네이티브 플러그인(GoogleAuthPlugin.java)
//   을 우선 시도한다 — 한 번 동의하면 이후 authorize() 재호출은 UI 없이 새 토큰을 준다.
//   플러그인이 없는 구버전 APK(설치돼 있다면)는 위 레거시 릴레이로 그대로 폴백한다.

import { Browser } from "@capacitor/browser";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { isNativeApp } from "./nativeProxy";
import { getInstalledAppVersion } from "./appRelease";
import {
  isExtensionProxyReady, getGoogleTokenViaExtension, clearGoogleTokenViaExtension,
} from "./extensionProxy";

const CLIENT_ID = "103182209420-am9ojjlfnh7m00a06nn84dkhnut2mja8.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const STATE_VALUE = "drive_auth_v1";

// ─── silent refresh 진단 ──────────────────────────────────────
// 왜 필요한가 — GIS 의 실패 사유가 전부 삼켜지고 있어서 1시간마다 로그아웃되는 원인을
//   짐작만 할 수 있었다(서드파티 쿠키 차단? interaction_required? 스크립트 로드 실패?).
//   사유마다 대응이 완전히 달라서, 추측으로 고치면 헛수고다. 마지막 1건만 남긴다.
const DIAG_KEY = "gdrive_auth_diag";

export interface AuthDiag {
  at: number;             // 실패 시각 (ms)
  stage: string;          // 어느 단계에서 실패했나
  error?: string;         // GIS 가 준 error 코드
  detail?: string;        // error_description 등
}

function noteAuthFailure(stage: string, err?: unknown): void {
  let error: string | undefined;
  let detail: string | undefined;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    error = typeof o.type === "string" ? o.type
      : typeof o.error === "string" ? o.error : undefined;
    detail = typeof o.error_description === "string" ? o.error_description
      : typeof o.message === "string" ? o.message : undefined;
  } else if (typeof err === "string") {
    error = err;
  }
  // ★ 확장 없는 웹의 popup_closed 는 '예상된 실패' 다 — 고칠 방법이 없다.
  //   GIS 는 prompt:"none" 이어도 팝업을 띄우는데 만료 타이머엔 사용자 제스처가 없어
  //   브라우저가 즉시 닫는다. 이걸 빨간 박스로 띄우면 사용자가 고장으로 오해한다.
  //   그 사용자에게 필요한 신호는 "로그인 안 됨" 하나면 충분하다(이미 표시된다).
  const expected = error === "popup_closed" && !isNativeApp() && !isExtensionProxyReady();
  const diag: AuthDiag = { at: Date.now(), stage, error, detail };
  console.warn("[googleAuth] silent refresh 실패", diag);
  if (expected) return;
  try { localStorage.setItem(DIAG_KEY, JSON.stringify(diag)); } catch { /* noop */ }
}

// 성공하면 지운다 — 옛 실패 기록이 남아 오해를 부르지 않게.
function clearAuthDiag(): void {
  try { localStorage.removeItem(DIAG_KEY); } catch { /* noop */ }
}

export function getAuthDiag(): AuthDiag | null {
  try {
    const raw = localStorage.getItem(DIAG_KEY);
    return raw ? JSON.parse(raw) as AuthDiag : null;
  } catch { return null; }
}

// 네이티브 앱 전용 — 시스템 브라우저로 로그인시킬 때 쓰는 state/redirect (레거시 릴레이,
//   네이티브 인증 플러그인이 없거나 실패했을 때의 폴백 경로).
//   redirect_uri 는 웹과 동일한(이미 Google Cloud Console 에 등록된) 주소를 그대로 쓴다 —
//   새 URI 를 등록할 필요가 없다. 대신 state 값으로 "네이티브 앱발" 요청임을 구분해서
//   handleAuthRedirect() 가 토큰을 저장하지 않고 앱으로 릴레이하게 만든다.
const APP_STATE_VALUE = "drive_auth_app_v1";
const APP_SCHEME_REDIRECT = "pfportfolio://oauth";
const WEB_RELAY_URI = "https://statclaude.github.io/portfolio-web/";

// localStorage keys
const TOKEN_KEY = "gdrive_token_cache";
const WAS_SIGNED_IN_KEY = "gdrive_was_signed_in";
const PRE_AUTH_PATH_KEY = "gdrive_pre_auth_path";

// silent refresh 를 토큰 만료 N ms 전에 시도
const SILENT_REFRESH_LEAD_MS = 5 * 60 * 1000;
// silent refresh 가 GIS 콜백을 영영 못 받는 경우(일부 Android WebView 에서 서드파티
// 쿠키/iframe 제한으로 callback·error_callback 둘 다 안 불리는 케이스 확인됨) 대비 —
// 이 시간 안에 응답 없으면 강제로 null 반환해 "저장중" 무한 대기를 막는다.
const SILENT_REFRESH_TIMEOUT_MS = 8000;

interface CachedToken { token: string; expiresAt: number; }

interface GisTokenResponse {
  access_token?: string;
  expires_in?: string | number;
  error?: string;
}

interface GisTokenClient {
  requestAccessToken: (overrides?: { prompt?: string; hint?: string }) => void;
}

interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (resp: GisTokenResponse) => void;
    error_callback?: (err: unknown) => void;
    prompt?: string;
  }) => GisTokenClient;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

let accessToken: string | null = null;
let tokenExpiresAt = 0;
let refreshTimer: number | null = null;
let tokenClient: GisTokenClient | null = null;
let pendingSilentResolvers: Array<(t: string | null) => void> = [];

function loadCachedToken(): void {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return;
    const cached = JSON.parse(raw) as CachedToken;
    if (cached.expiresAt > Date.now() + 30_000) {
      accessToken = cached.token;
      tokenExpiresAt = cached.expiresAt;
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch { /* noop */ }
}

function saveToken(token: string, expiresIn: number): void {
  accessToken = token;
  tokenExpiresAt = Date.now() + expiresIn * 1000;
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({
      token, expiresAt: tokenExpiresAt,
    } satisfies CachedToken));
    localStorage.setItem(WAS_SIGNED_IN_KEY, "1");
  } catch { /* noop */ }
  scheduleSilentRefresh();
}

function clearToken(): void {
  accessToken = null;
  tokenExpiresAt = 0;
  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(WAS_SIGNED_IN_KEY);
  } catch { /* noop */ }
}

// GIS 스크립트가 로드될 때까지 대기 후 token client 초기화 (idempotent)
function ensureTokenClient(): Promise<GisTokenClient | null> {
  if (tokenClient) return Promise.resolve(tokenClient);
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const oauth2 = window.google?.accounts?.oauth2;
      if (oauth2) {
        tokenClient = oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPE,
          callback: (resp) => {
            if (resp.error || !resp.access_token) {
              noteAuthFailure("callback", resp);
              resolveSilent(null);
              return;
            }
            clearAuthDiag();
            const exp = typeof resp.expires_in === "string"
              ? parseInt(resp.expires_in, 10)
              : (resp.expires_in ?? 3600);
            saveToken(resp.access_token, exp);
            resolveSilent(resp.access_token);
          },
          error_callback: (err) => {
            // GIS 가 popup/iframe 을 못 띄웠거나 세션이 없을 때 여기로 온다.
            noteAuthFailure("error_callback", err);
            resolveSilent(null);
          },
        });
        resolve(tokenClient);
        return;
      }
      // GIS 가 끝내 로드되지 않으면 (e.g. 네트워크 차단) 10초 후 포기
      if (Date.now() - start > 10_000) {
        noteAuthFailure("gis-load-timeout");
        resolve(null);
        return;
      }
      window.setTimeout(tick, 100);
    };
    tick();
  });
}

function resolveSilent(token: string | null): void {
  const list = pendingSilentResolvers;
  pendingSilentResolvers = [];
  list.forEach((r) => r(token));
}

// ─── 앱: 네이티브 구글 인증 (v1.1.0+, GoogleAuthPlugin.java) ───────
// 앱에서는 브라우저 기반 OAuth 를 쓸 수 없다(위 파일 맨 위 주석). Custom Tab + 커스텀 스킴
//   리다이렉트도 안드로이드에서 폐기됐다("Custom URI schemes are no longer supported on
//   Android"). 남은 정식 경로는 플레이 서비스의 AuthorizationClient 다.
//
// 이게 앱의 1시간 로그아웃을 푸는 방식이다 — refresh token 을 쓰지 않는다. 계정이 기기에
//   있으니 한 번 동의한 뒤로는 authorize() 를 다시 부르면 UI 없이 새 토큰이 나온다
//   (hasResolution()==false 인 경로).
//
// ★ 옛 APK 를 깨뜨리지 않는 게 핵심 — 앱은 웹을 원격 로드하므로 웹만 배포해도 옛 APK 가
//   이 코드를 받는데, 플러그인은 APK 안에 있어서 옛 버전엔 없다. 없는 플러그인을 부르면
//   로그인이 먹통이 되므로 설치된 앱 버전으로 가른다(미만이면 레거시 릴레이 그대로).
const NATIVE_AUTH_MIN_APP_VERSION = "1.1.0";

// "1.2.0" 같은 버전 문자열 비교. 자릿수가 달라도(1.10 vs 1.9) 맞게 판정한다.
function versionGte(a: string, b: string): boolean {
  const pa = a.split(".").map(n => parseInt(n, 10) || 0);
  const pb = b.split(".").map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

// 이 앱이 네이티브 인증을 탈 수 있나 — 플러그인이 들어 있는 버전인가.
let nativeAuthCapable: boolean | null = null;
async function canUseNativeAuth(): Promise<boolean> {
  if (!isNativeApp()) return false;
  if (nativeAuthCapable !== null) return nativeAuthCapable;
  const v = await getInstalledAppVersion();
  nativeAuthCapable = !!v && versionGte(v, NATIVE_AUTH_MIN_APP_VERSION);
  return nativeAuthCapable;
}

interface NativeAuthResult { accessToken?: string; expiresIn?: number; needsConsent?: boolean }

interface GoogleAuthNativePlugin {
  getAccessToken?: (o: unknown) => Promise<NativeAuthResult>;
  clearToken?: (o: { token: string }) => Promise<void>;
}

function nativePlugin(): GoogleAuthNativePlugin | undefined {
  return (Capacitor as unknown as {
    Plugins?: Record<string, GoogleAuthNativePlugin>;
  }).Plugins?.GoogleAuth;
}

// 네이티브 토큰 요청. interactive=false 면 동의가 필요할 때 UI 없이 needsConsent 로 돌아온다.
async function nativeAuthToken(interactive: boolean): Promise<string | null> {
  try {
    const plugin = nativePlugin();
    if (!plugin?.getAccessToken) { noteAuthFailure("native-plugin-missing"); return null; }
    const r = await plugin.getAccessToken({ scope: SCOPE, interactive });
    if (r.needsConsent) {
      // 조용한 갱신에서 동의가 필요하다고 나오면, 사용자가 로그인 버튼을 눌러야 한다.
      if (!interactive) noteAuthFailure("native-needs-consent");
      return null;
    }
    if (!r.accessToken) { noteAuthFailure("native-no-token"); return null; }
    clearAuthDiag();
    saveToken(r.accessToken, r.expiresIn ?? 3600);
    return r.accessToken;
  } catch (e) {
    noteAuthFailure("native-auth-throw", e);
    return null;
  }
}

// 앱 전용 갱신 타이머 — 만료 5분 전에 네이티브로 조용히 새 토큰을 받는다.
function scheduleNativeRefresh(): void {
  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (!accessToken) return;
  const delay = Math.max(0, tokenExpiresAt - Date.now() - SILENT_REFRESH_LEAD_MS);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    void nativeAuthToken(false);
  }, delay);
}

// ─── 웹: 확장 경로 ────────────────────────────────────────────
// GIS 로는 조용한 갱신이 안 된다 — prompt:"none" 이어도 팝업을 띄우는데, 만료 타이머에서
//   부르면 사용자 제스처가 없어 브라우저가 즉시 닫는다(위 noteAuthFailure 주석 참고).
//   확장의 chrome.identity 는 팝업을 안 써서 조용히 재발급된다.
//   확장이 없으면 기존 GIS 경로로 폴백한다 — 그쪽은 여전히 1시간마다 클릭이 필요하다.
async function extensionAuthToken(interactive: boolean): Promise<string | null> {
  if (!isExtensionProxyReady()) return null;
  const r = await getGoogleTokenViaExtension(interactive);
  if (!r) { if (!interactive) noteAuthFailure("ext-no-token"); return null; }
  clearAuthDiag();
  saveToken(r.token, r.expiresIn);
  return r.token;
}

// 확장 갱신 타이머 — 만료 5분 전에 chrome.identity 로 조용히 새 토큰을 받는다.
function scheduleExtensionRefresh(): void {
  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (!accessToken) return;
  const delay = Math.max(0, tokenExpiresAt - Date.now() - SILENT_REFRESH_LEAD_MS);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    void extensionAuthToken(false);
  }, delay);
}

// silent refresh 호출 — 사용자 동의 + Google 세션 있으면 hidden iframe 으로 새 토큰 발급
// 첫 로그인은 redirect 로 처리하므로 여기선 prompt: '' (interactive 없음) 만 사용
function requestSilentRefresh(): Promise<string | null> {
  if (!wasSignedIn()) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId: number | null = null;
    // 이 요청 전용 finish — pendingSilentResolvers 에서 자기 자신만 안전하게 제거.
    //   (resolveSilent() 는 배치로 한꺼번에 드레인하므로, timeout 으로 먼저 끝난 뒤
    //    나중에 GIS 콜백이 resolveSilent() 를 불러도 이미 settled 라 무시됨 — 이중 처리 없음)
    const finish = (token: string | null) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      pendingSilentResolvers = pendingSilentResolvers.filter((r) => r !== finish);
      resolve(token);
    };
    pendingSilentResolvers.push(finish);
    // GIS 가 callback/error_callback 둘 다 영영 안 부르는 경우 대비 — 타임아웃으로 강제 종료.
    timeoutId = window.setTimeout(() => {
      noteAuthFailure("silent-refresh-timeout");
      finish(null);
    }, SILENT_REFRESH_TIMEOUT_MS);
    void ensureTokenClient().then((client) => {
      if (!client) {
        finish(null);
        return;
      }
      try {
        // prompt: "none" — 완전 silent. 사용자 동의 / 계정 선택 등 UI 없음.
        //   필요한 경우 error_callback 으로 실패 (popup 안 뜸).
        // 빈 문자열 "" 은 "처음만 안 묻고 그 외엔 popup 가능" 이라 토큰 만료 시 팝업 노출됨.
        client.requestAccessToken({ prompt: "none" });
      } catch (e) {
        noteAuthFailure("request-throw", e);
        finish(null);
      }
    });
  });
}

function scheduleSilentRefresh(): void {
  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (!accessToken) return;
  // 앱이면 네이티브 인증이 되는 버전인지 확인해 그 경로로 조용히 갱신한다. 안 되는(구버전)
  //   앱은 갱신 타이머를 안 건다 — 어차피 웹뷰의 GIS silent refresh 는 거의 항상 실패해서
  //   8초 타임아웃만 반복하는 헛수고였다(이전 동작). signIn() 재클릭이 필요한 건 그대로.
  if (isNativeApp()) {
    void canUseNativeAuth().then((ok) => { if (ok) scheduleNativeRefresh(); });
    return;
  }
  // 확장이 있으면 팝업 없이 갱신되므로 타이머가 실제로 동작한다.
  if (isExtensionProxyReady()) { scheduleExtensionRefresh(); return; }
  const delay = Math.max(0, tokenExpiresAt - Date.now() - SILENT_REFRESH_LEAD_MS);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    void requestSilentRefresh();
  }, delay);
}

// redirect_uri — Google Cloud Console 에 등록된 값과 정확히 일치해야 함
function getRedirectUri(): string {
  // gh-pages: https://statclaude.github.io/portfolio-web/
  // local:    http://localhost:5173/
  // pathname 끝에 슬래시 강제 (CSC 등록 형식 일치)
  const path = window.location.pathname.endsWith("/")
    ? window.location.pathname
    : window.location.pathname + "/";
  return window.location.origin + path;
}

// 페이지 로드 시 즉시 — 1) 캐시 복원, 2) URL fragment 의 token 처리
loadCachedToken();
handleAuthRedirect();
scheduleSilentRefresh();

// 탭 전환 시 자동 silent refresh 제거 — Google 라이브러리가 prompt:"none" 이어도
// 가끔 hidden iframe UI 가 잠깐 보이는 문제. 토큰 갱신은 SettingsDialog 진입 시
// 또는 명시적 sync 액션(uploadToDrive 등) 시점에만 수행 (일관 정책).

// 로그인 — 앱이고 네이티브 인증이 되는 버전이면 GoogleAuthPlugin 으로, 안 되면(구버전 앱)
//   시스템 브라우저 레거시 릴레이로. 웹은 확장이 있으면 확장의 chrome.identity 로,
//   그 외엔 전체 페이지 redirect 로.
// 네이티브·확장 경로는 Promise 를 실제로 반환한다(페이지 이동이 없어 그 자리에서 끝난다) —
//   레거시 릴레이/웹 redirect 경로는 이 시점 이후 코드가 이어지지 않으므로 호출측은
//   계속 fire-and-forget 로 쓴다.
export async function signIn(): Promise<void> {
  // 로그인 후 돌아갈 path 저장 (예: 모달 다시 열림 등)
  try {
    localStorage.setItem(PRE_AUTH_PATH_KEY, window.location.pathname + window.location.search);
  } catch { /* noop */ }

  if (isNativeApp()) {
    if (await canUseNativeAuth()) {
      // 사용자가 누른 로그인이므로 필요하면 동의 화면을 띄운다(interactive=true).
      const t = await nativeAuthToken(true);
      if (t) return;
      // 플러그인이 없거나 실패하면 아래 레거시 릴레이로 떨어진다 — 로그인이 먹통되면 안 된다.
    }
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: WEB_RELAY_URI,
      response_type: "token",
      scope: SCOPE,
      state: APP_STATE_VALUE,
      prompt: "consent",
      include_granted_scopes: "true",
    });
    void Browser.open({ url: `${AUTH_URL}?${params}` });
    return;
  }

  // 확장이 있으면 먼저 확장의 chrome.identity 로 로그인 시도 — 크롬 네이티브 동의 팝업이
  //   최초 1회만 뜨고(사용자 클릭으로 호출되므로 interactive:true 가능), 동의하면 그 뒤로는
  //   만료 타이머에서도 팝업 없이 조용히 갱신된다(GIS 리다이렉트는 매시간 클릭이 필요해
  //   이 기능을 만든 이유 자체가 없어진다). 거부/실패하면 기존 GIS 리다이렉트로 폴백.
  if (isExtensionProxyReady()) {
    const t = await extensionAuthToken(true);
    if (t) return;
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: "token",
    scope: SCOPE,
    state: STATE_VALUE,
    prompt: "consent",
    include_granted_scopes: "true",
  });
  window.location.href = `${AUTH_URL}?${params}`;
}

// URL fragment 에서 token 추출 — 페이지 로드 시 자동 호출
export function handleAuthRedirect(): boolean {
  if (typeof window === "undefined" || !window.location.hash) return false;
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const state = hash.get("state");

  // 네이티브 앱이 연 시스템 브라우저가 로그인 후 돌아온 경우 — 여기(시스템 브라우저)엔
  // 토큰을 저장하지 않는다(앱 WebView 와 storage 가 분리돼 있어 저장해도 앱이 못 봄).
  // 대신 커스텀 스킴으로 그대로 넘겨 앱이 직접 저장하게 한다.
  if (state === APP_STATE_VALUE) {
    if (!isNativeApp()) {
      window.location.replace(`${APP_SCHEME_REDIRECT}#${window.location.hash.slice(1)}`);
    }
    return false;
  }

  if (state !== STATE_VALUE) return false;

  const token = hash.get("access_token");
  const expiresIn = parseInt(hash.get("expires_in") ?? "3600", 10);
  const error = hash.get("error");

  // 에러 시 hash 제거하고 종료
  if (error || !token) {
    history.replaceState({}, "", window.location.pathname + window.location.search);
    return false;
  }

  saveToken(token, expiresIn);
  // URL hash 청소
  history.replaceState({}, "", window.location.pathname + window.location.search);
  return true;
}

// pfportfolio://oauth#access_token=... 딥링크 처리 — appUrlOpen 리스너에서 호출.
// 시스템 브라우저가 handleAuthRedirect() 에서 릴레이해 준 토큰을 여기서 실제로 저장한다.
// (레거시 릴레이 경로 전용 — 네이티브 인증 경로는 이 딥링크를 쓰지 않는다.)
export function handleAppAuthUrl(url: string): boolean {
  const hashIdx = url.indexOf("#");
  if (hashIdx === -1) return false;
  const hash = new URLSearchParams(url.slice(hashIdx + 1));
  const token = hash.get("access_token");
  const expiresIn = parseInt(hash.get("expires_in") ?? "3600", 10);
  const error = hash.get("error");
  if (error || !token) return false;
  saveToken(token, expiresIn);
  return true;
}

// 네이티브 앱에서만: 딥링크 복귀를 상시 구독하고, 토큰을 받으면 로그인에 썼던
// 시스템 브라우저(Custom Tab)도 정리한다. (레거시 릴레이 폴백 경로용 — 네이티브 인증이
// 성공하는 한 이 리스너는 그냥 아무 일도 안 하고 대기만 한다.)
if (isNativeApp()) {
  void CapApp.addListener("appUrlOpen", ({ url }: { url: string }) => {
    if (handleAppAuthUrl(url)) {
      void Browser.close().catch(() => { /* 이미 닫혀있으면 무시 */ });
    }
  });
}

// 토큰 가져오기 — 캐시 유효 시 즉시 반환, 만료/없음이면 상황에 맞는 조용한 갱신 시도
export async function getAccessToken(): Promise<string | null> {
  if (accessToken && Date.now() < tokenExpiresAt - 30_000) {
    // 쓸 수 있는 토큰이 있다 = 인증이 지금 정상이다. 옛 실패 기록이 남아 있으면 지운다.
    //   안 지우면 "실패" 박스가 계속 떠서, 저장·가져오기가 되는데도 고장난 것처럼 보인다.
    clearAuthDiag();
    return accessToken;
  }
  // 앱이고 네이티브 인증이 되는 버전이면 최우선 — 팝업 없이 새 토큰(1시간 로그아웃 해결 지점).
  if (isNativeApp()) {
    if (await canUseNativeAuth()) {
      const t = await nativeAuthToken(false);
      if (t) return t;
    }
  } else if (isExtensionProxyReady()) {
    // 확장이 있으면 확장으로 조용히 받는다 — 팝업이 없어 타이머에서도 성공한다.
    const t = await extensionAuthToken(false);
    if (t) return t;
  }
  // 이전에 로그인한 적 있으면 silent refresh 시도 (사용자 클릭 불필요) — 앱 웹뷰에서는
  //   거의 항상 실패하지만(위 주석), 네이티브 인증이 안 되는 구버전 앱에는 유일한 시도라 남긴다.
  if (wasSignedIn()) {
    const refreshed = await requestSilentRefresh();
    if (refreshed) return refreshed;
  }
  return null;  // 사용자가 다시 signIn() 호출 필요
}

// 로그아웃 — 웹/확장은 token revoke, 앱(네이티브 인증)은 네이티브 캐시만 비움 + localStorage 삭제
export async function signOut(): Promise<void> {
  const t = accessToken;
  const useNative = isNativeApp() && (await canUseNativeAuth());
  clearToken();
  if (!t) return;

  if (useNative) {
    // ★ 앱에서는 revoke 를 부르지 않는다.
    //   revoke 는 서버 권한만 없애고, 플레이 서비스는 그 토큰을 캐시에서 계속 돌려준다.
    //   그러면 재로그인 때 동의 창 없이 "로그인됨" 이 되고 API 호출만 401 로 죽는다(실측).
    //   대신 네이티브 캐시를 비운다 — 다음 authorize() 가 새 토큰을 발급한다.
    //   (권한 자체를 끊고 싶으면 구글 계정 설정에서 앱 연결을 해제하면 된다)
    try { await nativePlugin()?.clearToken?.({ token: t }); } catch { /* noop */ }
    return;
  }

  // 확장도 토큰을 캐시한다 — 안 비우면 로그아웃 후에도 크롬이 같은(이제 revoke 된) 토큰을
  //   계속 돌려준다(네이티브·확장 갱신 경로와 같은 함정).
  if (!isNativeApp() && isExtensionProxyReady()) {
    await clearGoogleTokenViaExtension(t);
  }
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(t)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch { /* network 실패 무시 */ }
}

// Drive 호출이 401 을 받았을 때 — 토큰이 무효(폐기·만료)라는 뜻이다. 앱(네이티브 인증)에서는
//   플레이 서비스 캐시에 무효 토큰이 남아 있을 수 있어, 비우고 새로 받아야 한다. 비우지
//   않으면 같은 죽은 토큰을 계속 돌려받아 "로그인됐는데 호출만 실패" 가 반복된다.
//   (googleDrive.ts 의 driveFetch() 래퍼가 401 시 이 함수를 부른다.)
export async function recoverFromUnauthorized(): Promise<string | null> {
  const dead = accessToken;
  clearToken();
  if (!isNativeApp() || !(await canUseNativeAuth())) return null;
  if (dead) { try { await nativePlugin()?.clearToken?.({ token: dead }); } catch { /* noop */ } }
  return await nativeAuthToken(false);
}

// 이전 로그인 흔적 — UI 에서 "재로그인 가능" 힌트용
export function wasSignedIn(): boolean {
  try { return localStorage.getItem(WAS_SIGNED_IN_KEY) === "1"; } catch { return false; }
}

// 현재 토큰 유효 여부
export function isSignedIn(): boolean {
  return !!accessToken && Date.now() < tokenExpiresAt - 30_000;
}
