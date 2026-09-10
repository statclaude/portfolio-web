// 네이티브 앱(Capacitor, APK) 여부 판별.
//   웹 배포본과 APK 가 완전히 같은 코드를 공유하므로(원격 로드), 이 값으로
//   네이티브 전용 동작(뒤로가기 종료, 구글 로그인 시스템 브라우저 분기 등)을 분기한다.
//   웹(일반 브라우저)에서는 항상 false.
import { Capacitor } from "@capacitor/core";

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
