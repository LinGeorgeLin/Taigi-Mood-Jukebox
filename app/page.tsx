"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import type { Mood } from "./components/types";
import Step1MoodSelect from "./components/Step1MoodSelect";
import { IGShareCard } from "./IGShareCard";

// ============================================================================
// 動態載入階段二、三：這是這次重構的核心。
//
// - `ssr: false` 讓這兩個元件完全不參與伺服器端渲染，也不會被打包進首頁
//   一開始下載的 JS bundle 裡（因為它們用到 MediaRecorder、Canvas 這些
//   只能在瀏覽器執行的 API，本來就不能、也不需要 SSR）。
// - Next.js 會自動把 Step2Recording / Step3Result 拆成獨立的 chunk 檔案，
//   使用者一開始打開網站只會下載階段一（Step1MoodSelect + 這個檔案本身）的
//   程式碼，體積小很多；等使用者實際點「開始體驗」進入階段二時，
//   瀏覽器才會在背景默默下載 Step2 的 chunk，階段三同理。
// - `loading` 選項是 chunk 還在下載時顯示的畫面，避免使用者點擊後畫面空白。
// ============================================================================
const Step2Recording = dynamic(() => import("./components/Step2Recording"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
    </div>
  ),
});

const Step3Result = dynamic(() => import("./components/Step3Result"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
    </div>
  ),
});

export default function Page() {
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null);
  const [spotifyEmbedUrl, setSpotifyEmbedUrl] = useState<string | null>(null);
  const [spotifyUrl, setSpotifyUrl] = useState<string | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --------------------------------------------------------------------------
  // 簡易 Toast 提示：階段一（投稿成功）跟階段三（分享成功）共用，
  // 所以留在最上層的 Page 元件，透過 props 往下傳。
  // --------------------------------------------------------------------------
  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    setToastVisible(true);
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
      setTimeout(() => setToastMessage(null), 300);
    }, 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // --------------------------------------------------------------------------
  // 階段切換
  // --------------------------------------------------------------------------
  const handleSelectMood = useCallback((mood: Mood) => {
    setSelectedMood(mood);
  }, []);

  const handleStart = useCallback(() => {
    if (!selectedMood) return;
    setStage(2);
  }, [selectedMood]);

  const handleBackToStage1 = useCallback(() => {
    setStage(1);
  }, []);

  const handleUnlock = useCallback(
    (embedUrl: string, shareableUrl: string | null) => {
      setSpotifyEmbedUrl(embedUrl);
      setSpotifyUrl(shareableUrl);
      setStage(3);
    },
    [],
  );

  const handleRestart = useCallback(() => {
    setSelectedMood(null);
    setSpotifyEmbedUrl(null);
    setSpotifyUrl(null);
    setStage(1);
  }, []);

  return (
    <div className="relative h-screen h-[100dvh] w-full overflow-hidden bg-black text-white">
      {/* Toast 提示 */}
      {toastMessage && (
        <div
          className={`fixed inset-x-4 bottom-6 z-[60] mx-auto max-w-sm rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-center text-xs leading-relaxed text-white backdrop-blur-md transition-all duration-300 sm:text-sm ${
            toastVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-3 opacity-0"
          }`}
          role="status"
        >
          {toastMessage}
        </div>
      )}

      {/* ============================================================
          嚴格條件渲染：每次只會有一個階段的元件真正存在於 DOM 裡，
          不是用 CSS 的 hidden / display:none 把其他階段藏起來。
          階段一是一般 import（首頁必要內容，直接打包進首頁 bundle）；
          階段二、三是上面用 next/dynamic 動態載入的元件，
          只有真的切換過去時，瀏覽器才會下載對應的 JS chunk。
         ============================================================ */}
      {stage === 1 && (
        <Step1MoodSelect
          selectedMood={selectedMood}
          onSelectMood={handleSelectMood}
          onStart={handleStart}
          showToast={showToast}
        />
      )}

      {stage === 2 && selectedMood && (
        <Step2Recording
          mood={selectedMood}
          onBack={handleBackToStage1}
          onUnlock={handleUnlock}
        />
      )}

      {stage === 3 && selectedMood && spotifyEmbedUrl && (
        <Step3Result
          mood={selectedMood}
          spotifyEmbedUrl={spotifyEmbedUrl}
          spotifyUrl={spotifyUrl}
          onRestart={handleRestart}
          showToast={showToast}
        />
      )}
      {selectedMood && (
        <div
          className="pointer-events-none fixed left-[-9999px] top-[-9999px]"
          aria-hidden="true"
        >
          <IGShareCard
            title={selectedMood.label}
            content={selectedMood.hanji}
            romaji={selectedMood.tailo}
            score={98}
            moodTag={selectedMood.label}
            illustrationType={selectedMood.illustration_type}
            accentColor={selectedMood.accent_color}
          />
        </div>
      )}
    </div>
  );
}
