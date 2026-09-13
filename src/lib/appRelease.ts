// 설치된 APK 버전 확인 — 네이티브 구글 인증(GoogleAuthPlugin, android/app/src/main/java/.../GoogleAuthPlugin.java)이
//   들어있는 버전인지 가르는 데 쓴다. 플러그인은 APK 안에 있어서, 이 코드를 원격 로드로 먼저
//   받아도 구버전 APK 에는 플러그인이 없다 — 버전으로 갈라야 없는 플러그인을 불러 로그인이
//   먹통되는 사고를 막는다(googleAuth.ts 의 canUseNativeAuth() 참고).
//
// 원저작자 upstream 의 appRelease.ts 에는 GitHub Release 자동 업데이트 안내 기능도 있지만,
//   우리는 APK 를 공개 배포하지 않으므로(작업 원칙) 그 부분은 가져오지 않고 이 함수만 이식.
//
// 웹(일반 브라우저)에서는 항상 null.
import { App } from "@capacitor/app";
import { isNativeApp } from "./nativeProxy";

export async function getInstalledAppVersion(): Promise<string | null> {
  if (!isNativeApp()) return null;
  try {
    const info = await App.getInfo();
    return info.version || null;
  } catch {
    return null;
  }
}
