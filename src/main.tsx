import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isNativeApp } from './lib/nativeProxy'

// 안드로이드 뒤로가기 — 기본은 아무 반응도 없어서(Capacitor 기본 동작) 앱을 끝낼 방법이
// 없었다. 열려 있는 다이얼로그/모달이 있으면(모든 다이얼로그가 공통으로 쓰는
// "fixed inset-0" 오버레이로 감지) 먼저 그것만 닫고(다이얼로그들은 이미 useEscClose 로
// Escape 키를 구독하고 있어 그대로 재사용), 아무것도 열려 있지 않으면 앱을 종료한다.
if (isNativeApp()) {
  void import('@capacitor/app').then(({ App: CapApp }) => {
    void CapApp.addListener('backButton', () => {
      const hasOpenDialog = document.querySelector('.fixed.inset-0') !== null;
      if (hasOpenDialog) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        return;
      }
      void CapApp.exitApp();
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
