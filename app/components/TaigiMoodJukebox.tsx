"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { getApiUrl } from "../lib/api";
import { IGShareCard } from "../IGShareCard";
import * as htmlToImage from "html-to-image";
import { Client } from "@gradio/client";

// ============================================================================
// 型別定義
// ============================================================================
type IllustrationType = "heart_wave" | "storm_cloud" | "beer_stars";

interface Mood {
  id: string;
  label: string;
  emoji: string;
  hanji: string;
  tailo: string;
  accent_color: string;
  illustration_type: IllustrationType;
}

interface MoodsResponse {
  moods?: Mood[];
  error?: string;
}

interface MoodAsrResponse {
  text?: string;
  is_match?: boolean;
  reason?: string;
  spotify_embed_url?: string;
  spotify_url?: string;
  error?: string;
}

const GOOGLE_SHEET_WEBHOOK_URL =
  process.env.NEXT_PUBLIC_GOOGLE_SHEET_WEBHOOK_URL || "";

// ============================================================================
// 粒子煙火特效（純 Canvas，不依賴套件，鋪在整頁最上層）
// ============================================================================
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

const PARTICLE_COLORS = ["#f472b6", "#818cf8", "#22d3ee", "#facc15", "#4ade80"];

function useFireworks() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const frameRef = useRef<number | null>(null);

  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particlesRef.current = particlesRef.current.filter(
      (p) => p.life < p.maxLife,
    );

    particlesRef.current.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.life += 1;
      const alpha = Math.max(1 - p.life / p.maxLife, 0);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1;

    if (particlesRef.current.length > 0) {
      frameRef.current = requestAnimationFrame(loop);
    } else {
      frameRef.current = null;
    }
  }, []);

  const trigger = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    for (let burst = 0; burst < 6; burst++) {
      const originX = canvas.width * (0.15 + Math.random() * 0.7);
      const originY = canvas.height * (0.15 + Math.random() * 0.35);
      for (let i = 0; i < 40; i++) {
        const angle = (Math.PI * 2 * i) / 40 + Math.random() * 0.3;
        const speed = 3 + Math.random() * 5;
        particlesRef.current.push({
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 60 + Math.random() * 30,
          color:
            PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
          size: 2 + Math.random() * 3,
        });
      }
    }

    if (frameRef.current === null)
      frameRef.current = requestAnimationFrame(loop);
  }, [loop]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return { canvasRef, trigger };
}

async function captureIGShareCardBlob(): Promise<Blob | null> {
  const cardNode = document.getElementById("ig-share-card");
  if (!cardNode) return null;

  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  return htmlToImage.toBlob(cardNode, {
    pixelRatio: 2,
    backgroundColor: "#000000",
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================================
// 主頁面：三階段留聲機
// ============================================================================
export default function Page() {
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [visible, setVisible] = useState(true);

  const [moods, setMoods] = useState<Mood[]>([]);
  const [isMoodsLoading, setIsMoodsLoading] = useState(true);
  const [moodsError, setMoodsError] = useState<string | null>(null);
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showFailHint, setShowFailHint] = useState(false);
  const [matchReason, setMatchReason] = useState("");
  const [spotifyEmbedUrl, setSpotifyEmbedUrl] = useState<string | null>(null);
  const [spotifyUrl, setSpotifyUrl] = useState<string | null>(null);

  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null);
  const [shareBlob, setShareBlob] = useState<Blob | null>(null);
  const [isGeneratingShareImage, setIsGeneratingShareImage] = useState(false);
  const [shareErrorMessage, setShareErrorMessage] = useState<string | null>(
    null,
  );

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------- 社群投稿表單（階段一底部的折疊區塊） ----------------
  const [isSubmitFormOpen, setIsSubmitFormOpen] = useState(false);
  const [submitMoodId, setSubmitMoodId] = useState("");
  const [submitSuggestedText, setSubmitSuggestedText] = useState("");
  const [submitSpotifyUrl, setSubmitSpotifyUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const { canvasRef, trigger: triggerFireworks } = useFireworks();

  // --------------------------------------------------------------------------
  // 階段切換：先淡出，等 300ms 動畫跑完才真正換內容，再淡入
  // --------------------------------------------------------------------------
  const goToStage = useCallback((next: 1 | 2 | 3) => {
    setVisible(false);
    setTimeout(() => {
      setStage(next);
      setVisible(true);
    }, 300);
  }, []);

  // --------------------------------------------------------------------------
  // 簡易 Toast 提示：顯示訊息，4 秒後自動淡出消失。
  // 沒有引入任何 UI 套件，純粹用 state + CSS transition 做出來。
  // --------------------------------------------------------------------------
  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(message);
    setToastVisible(true);
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
      // 等淡出動畫跑完再清掉文字內容，避免文字消失得比動畫還快
      setTimeout(() => setToastMessage(null), 300);
    }, 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // ==========================================================================
  // 載入心情題庫 (使用 Gradio Client 讀取 Hugging Face Space)
  // ==========================================================================
  useEffect(() => {
    async function loadMoods() {
      setIsMoodsLoading(true);
      setMoodsError(null);
      try {
        // 1. 連接你的 Hugging Face Space 後端
        const app = await Client.connect("georgelin29/taigi-mood-backend", {
          token: process.env.NEXT_PUBLIC_HF_TOKEN as `hf_${string}`,
        });

        // 2. 呼叫後端定義好的 "/get_moods" 接口
        const result = await app.predict("/get_moods", []);

        // 3. 解決 TS unknown 型別，將 result 強制轉 any 後轉為 JSON
        const data: MoodsResponse = JSON.parse((result as any).data[0] as string);

        if (data.error || !data.moods) {
          setMoodsError(data.error || "無法載入心情題庫，請稍後再試。");
          return;
        }
        
        // 4. 更新心情 State
        setMoods(data.moods);
      } catch (err) {
        console.error("載入心情題庫時發生錯誤：", err);
        setMoodsError("無法連接後端伺服器，請確認服務是否啟動。");
      } finally {
        setIsMoodsLoading(false);
      }
    }
    void loadMoods();
  }, []);;

  // 進入階段 3 時自動產生分享卡片 + 放煙火
  useEffect(() => {
    if (stage !== 3 || !selectedMood) return;

    triggerFireworks();

    let cancelled = false;
    setIsGeneratingShareImage(true);
    captureIGShareCardBlob().then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setIsGeneratingShareImage(false);
        return;
      }
      setShareBlob(blob);
      setShareImageUrl(URL.createObjectURL(blob));
      setIsGeneratingShareImage(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // --------------------------------------------------------------------------
  // 階段 1：選心情 → 開始體驗
  // --------------------------------------------------------------------------
  const handleSelectMood = useCallback((mood: Mood) => {
    setSelectedMood(mood);
  }, []);

  const handleStart = useCallback(() => {
    if (!selectedMood) return;
    setErrorMessage(null);
    setShowFailHint(false);
    goToStage(2);
  }, [selectedMood, goToStage]);

// ==========================================================================
  // 送出音訊至 Hugging Face 後端進行辨識 (使用 Gradio Client)
  // ==========================================================================
  const sendAudioToServer = useCallback(
    async (audioBlob: Blob) => {
      if (!selectedMood) return;

      setIsLoading(true);
      setErrorMessage(null);
      setShowFailHint(false);

      try {
        // 1. 連接你的 Hugging Face Space 後端
        const app = await Client.connect("georgelin29/taigi-mood-backend", {
          token: process.env.NEXT_PUBLIC_HF_TOKEN as `hf_${string}`,
        });

        // 2. 呼叫後端的 "/analyze" 接口
        // 依序傳入：[錄音 Blob 檔案, 當前選擇的心情 ID]
        const result = await app.predict("/analyze", [
          audioBlob,
          selectedMood.id,
        ]);

        // 3. 解析 JSON
        const data: MoodAsrResponse = JSON.parse((result as any).data[0] as string);

        if (data.error) {
          setErrorMessage(data.error || "辨識服務發生未知錯誤，請稍後再試。");
          return;
        }

        setMatchReason(data.reason ?? "");

        if (data.is_match && data.spotify_embed_url) {
          setSpotifyEmbedUrl(data.spotify_embed_url);
          setSpotifyUrl(data.spotify_url ?? null);
          goToStage(3);
        } else {
          setShowFailHint(true);
        }
      } catch (err) {
        console.error("送出音訊時發生錯誤：", err);
        setErrorMessage("無法連接語音辨識服務，請確認後端伺服器是否啟動。");
      } finally {
        setIsLoading(false);
      }
    },
    [selectedMood, goToStage],
  );

  const startRecording = useCallback(async () => {
    setErrorMessage(null);
    setShowFailHint(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        void sendAudioToServer(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("無法啟動麥克風：", err);
      setErrorMessage("無法取得麥克風權限，請檢查瀏覽器設定。");
      setIsRecording(false);
    }
  }, [sendAudioToServer]);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const handleMicClick = useCallback(() => {
    if (isLoading) return;
    if (isRecording) stopRecording();
    else void startRecording();
  }, [isRecording, isLoading, startRecording, stopRecording]);

  // --------------------------------------------------------------------------
  // 階段 3：分享 / 重新開始
  // --------------------------------------------------------------------------
  const handleShare = useCallback(async () => {
    setShareErrorMessage(null);

    let blob = shareBlob;
    if (!blob) {
      setIsGeneratingShareImage(true);
      blob = await captureIGShareCardBlob();
      setIsGeneratingShareImage(false);
    }

    if (!blob) {
      setShareErrorMessage("找不到分享卡片節點，請確認 IGShareCard 有正確掛載在頁面上。");
      return;
    }

    // ---------------- Viral Loop：複製 Spotify 連結到剪貼簿（沿用先前邏輯） ----------------
    let clipboardSucceeded = false;
    if (
      spotifyUrl &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      try {
        await navigator.clipboard.writeText(spotifyUrl);
        clipboardSucceeded = true;
      } catch (clipboardErr) {
        console.warn("複製到剪貼簿失敗：", clipboardErr);
      }
    }

    // ---------------- 優先走原生分享（手機瀏覽器會跳出分享選單，Threads 會是選項之一） ----------------
    let sharedNatively = false;
    if (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function"
    ) {
      try {
        const file = new File([blob], "taigi-mood-jukebox.png", {
          type: "image/png",
        });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "情懷留聲機",
            text: "我用台語解鎖了我的專屬 BGM！",
          });
          sharedNatively = true;
        }
      } catch (shareErr) {
        if ((shareErr as Error)?.name !== "AbortError") {
          console.warn("原生分享失敗，改用下載：", shareErr);
        } else {
          // 使用者自己按取消，不算錯誤
        }
      }
    }

    // ---------------- 桌面瀏覽器或原生分享不支援時，直接觸發下載 ----------------
    if (!sharedNatively) {
      downloadBlob(blob, "taigi-mood-jukebox.png");
    }

    if (clipboardSucceeded) {
      showToast(
        "✨ 分享卡片已儲存！專屬歌曲連結已自動複製到您的剪貼簿。在 IG 限動貼上『連結貼紙』，朋友就能一鍵收聽囉！",
      );
    } else {
      showToast("✨ 分享卡片已儲存！");
    }
  }, [shareBlob, spotifyUrl, showToast]);

  const handleRestart = useCallback(() => {
    setSelectedMood(null);
    setErrorMessage(null);
    setShowFailHint(false);
    setMatchReason("");
    setSpotifyEmbedUrl(null);
    setSpotifyUrl(null);
    setShareImageUrl(null);
    setShareBlob(null);
    goToStage(1);
  }, [goToStage]);

// ==========================================================================
  // 投稿心情歌曲 (維持使用原本 fetch Google Webhook 機制，不受影響)
  // ==========================================================================
  const handleSubmitMoodSong = useCallback(
    async (event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
      event.preventDefault();
      setSubmitError(null);

      if (!GOOGLE_SHEET_WEBHOOK_URL) {
        setSubmitError("尚未設定投稿服務網址，請聯絡網站管理員。");
        return;
      }
      if (!submitMoodId) {
        setSubmitError("請選擇心情分類。");
        return;
      }
      if (!submitSuggestedText.trim()) {
        setSubmitError("請填寫你想推薦的題目。");
        return;
      }
      if (!submitSpotifyUrl.trim().includes("open.spotify.com")) {
        setSubmitError("請貼上正確的 Spotify 歌曲網址。");
        return;
      }

      setIsSubmitting(true);

      try {
        // 繼續使用 text/plain 的方式繞過 Apps Script 的 CORS 限制
        const response = await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            mood_id: submitMoodId,
            suggested_text: submitSuggestedText.trim(),
            spotify_url: submitSpotifyUrl.trim(),
          }),
        });

        const data: { success?: boolean; error?: string } =
          await response.json();

        if (!data.success) {
          setSubmitError(data.error || "投稿失敗，請稍後再試。");
          return;
        }

        setSubmitMoodId("");
        setSubmitSuggestedText("");
        setSubmitSpotifyUrl("");
        setIsSubmitFormOpen(false);
        showToast("感謝投稿！審核通過後將即時上線 🎵");
      } catch (err) {
        console.error("送出投稿時發生錯誤：", err);
        setSubmitError("無法連接投稿服務，請稍後再試。");
      } finally {
        setIsSubmitting(false);
      }
    },
    [submitMoodId, submitSuggestedText, submitSpotifyUrl, showToast],
  );

  // 階段 2 左上角「返回」按鈕：使用者要求要能立即秒切回階段 1，不走 300ms 淡出動畫。
  // 如果當下正在錄音，先停止錄音、釋放麥克風權限，避免背景留著一個沒關閉的錄音連線。
  const handleQuickBackToStage1 = useCallback(() => {
    if (
      isRecording &&
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    setIsLoading(false);
    setErrorMessage(null);
    setShowFailHint(false);
    setMatchReason("");
    setVisible(true);
    setStage(1);
  }, [isRecording]);

  // --------------------------------------------------------------------------
  // 畫面渲染
  // --------------------------------------------------------------------------
  const fadeClass = `transition-opacity duration-300 ease-out ${
    visible ? "opacity-100" : "opacity-0"
  }`;

  return (
    <div className="relative h-screen h-[100dvh] w-full overflow-hidden bg-black text-white">
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-50"
      />

      {/* Toast 提示：固定貼在畫面底部，z-index 蓋過煙火特效層，淡入淡出不打斷操作 */}
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

      {/* ============================== 階段 1 ============================== */}
      {stage === 1 && (
        <div
          className={`flex h-full w-full flex-col items-center justify-between overflow-y-auto p-4 md:p-8 ${fadeClass}`}
        >
          <div className="flex-1" />

          <div className="flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4">
            <h1 className="mb-8 text-center font-serif text-2xl font-light tracking-[0.5em] text-white sm:mb-12 sm:text-3xl md:text-4xl md:tracking-[0.6em]">
              情 懷 留 聲 機
            </h1>

            {isMoodsLoading && (
              <p className="text-sm text-gray-500">載入中...</p>
            )}

            {moodsError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-6 py-4 text-center text-sm text-red-300">
                {moodsError}
              </div>
            )}

            {!isMoodsLoading && !moodsError && (
              <>
                <div className="flex w-full flex-col gap-3 sm:gap-4">
                  {moods.map((mood) => {
                    const isSelected = selectedMood?.id === mood.id;
                    return (
                      <button
                        key={mood.id}
                        type="button"
                        onClick={() => handleSelectMood(mood)}
                        className={`w-full rounded-2xl border px-6 py-4 text-left transition-all duration-300 sm:px-8 sm:py-5 ${
                          isSelected
                            ? "border-white/70 bg-white/[0.06]"
                            : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]"
                        }`}
                        style={{
                          boxShadow: isSelected
                            ? `0 0 30px ${mood.accent_color}30`
                            : undefined,
                        }}
                      >
                        <span className="break-words text-sm font-medium tracking-wide text-gray-200 sm:text-base">
                          {mood.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div
                  className={`mt-6 w-full transition-all duration-500 sm:mt-10 ${
                    selectedMood
                      ? "translate-y-0 opacity-100"
                      : "pointer-events-none -translate-y-2 opacity-0"
                  }`}
                >
                  <button
                    type="button"
                    onClick={handleStart}
                    disabled={!selectedMood}
                    className="w-full rounded-full border border-white/20 bg-white py-3.5 text-sm font-semibold tracking-[0.3em] text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 sm:py-4"
                  >
                    開 始 體 驗
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="flex-1" />

          {/* ---------------- 社群投稿：折疊式區塊，固定貼在階段一最下方 ---------------- */}
          {!isMoodsLoading && !moodsError && (
            <div className="w-full max-w-lg px-4 pb-2">
              <button
                type="button"
                onClick={() => setIsSubmitFormOpen((prev) => !prev)}
                className="mx-auto flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-xs text-gray-500 transition-colors hover:text-gray-300"
                aria-expanded={isSubmitFormOpen}
              >
                <span>我有私房厭世台語歌？向留聲機投稿</span>
                <span
                  className={`transition-transform duration-300 ${
                    isSubmitFormOpen ? "rotate-180" : "rotate-0"
                  }`}
                  aria-hidden="true"
                >
                  ▾
                </span>
              </button>

              <div
                className={`overflow-hidden transition-all duration-300 ${
                  isSubmitFormOpen
                    ? "mt-4 max-h-[600px] opacity-100"
                    : "max-h-0 opacity-0"
                }`}
              >
                <form
                  onSubmit={handleSubmitMoodSong}
                  className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5"
                >
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="submit-mood"
                      className="text-xs text-gray-500"
                    >
                      選擇心情分類
                    </label>
                    <select
                      id="submit-mood"
                      value={submitMoodId}
                      onChange={(e) => setSubmitMoodId(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-black px-3 py-2.5 text-sm text-gray-200 focus:border-white/30 focus:outline-none"
                    >
                      <option value="">請選擇...</option>
                      {moods.map((mood) => (
                        <option key={mood.id} value={mood.id}>
                          {mood.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="submit-text"
                      className="text-xs text-gray-500"
                    >
                      我想推薦的台語歌詞題目
                    </label>
                    <input
                      id="submit-text"
                      type="text"
                      value={submitSuggestedText}
                      onChange={(e) => setSubmitSuggestedText(e.target.value)}
                      placeholder="例如：好久不見的心情"
                      maxLength={200}
                      className="w-full rounded-lg border border-white/10 bg-black px-3 py-2.5 text-sm text-gray-200 placeholder:text-gray-600 focus:border-white/30 focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="submit-url"
                      className="text-xs text-gray-500"
                    >
                      Spotify 歌曲網址
                    </label>
                    <input
                      id="submit-url"
                      type="url"
                      value={submitSpotifyUrl}
                      onChange={(e) => setSubmitSpotifyUrl(e.target.value)}
                      placeholder="https://open.spotify.com/track/..."
                      className="w-full rounded-lg border border-white/10 bg-black px-3 py-2.5 text-sm text-gray-200 placeholder:text-gray-600 focus:border-white/30 focus:outline-none"
                    />
                  </div>

                  {submitError && (
                    <p className="text-xs text-red-400">{submitError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="mt-1 w-full rounded-full border border-white/20 bg-white/90 py-2.5 text-xs font-semibold tracking-[0.2em] text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmitting ? "送出中..." : "送 出 投 稿"}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================== 階段 2 ============================== */}
      {stage === 2 && selectedMood && (
        <div
          className={`relative flex h-full w-full flex-col items-center p-4 md:p-8 ${fadeClass}`}
        >
          {/* 左上角返回按鈕：獨立於中央內容之外，絕對定位，熱區夠大方便手機點擊 */}
          <button
            type="button"
            onClick={handleQuickBackToStage1}
            aria-label="返回重選主題"
            className="absolute left-4 top-4 z-20 flex items-center gap-1 rounded-full p-3 text-gray-400 transition-colors hover:text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-move-left-icon lucide-move-left"
            >
              <path d="M6 8L2 12L6 16" />
              <path d="M2 12H22" />
            </svg>
            <span className="text-xs tracking-widest">返回</span>
          </button>

          {/* 主要內容：置中在剩餘空間，不會跟頂部返回按鈕重疊 */}
          <div className="my-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 text-center">
            <span
              className="mb-6 rounded-full border px-5 py-1.5 text-xs tracking-[0.2em] text-gray-300 sm:mb-10"
              style={{ borderColor: `${selectedMood.accent_color}50` }}
            >
              {selectedMood.label}
            </span>

            <p className="w-full max-w-prose break-words text-xl font-bold leading-relaxed text-white sm:text-2xl md:text-4xl">
              {selectedMood.hanji}
            </p>
            <p
              className="mt-3 break-words text-center text-xs tracking-wide sm:mt-4 sm:text-sm"
              style={{ color: selectedMood.accent_color }}
            >
              {selectedMood.tailo}
            </p>

            {/* 錄音按鈕區 */}
            <div className="mt-8 flex flex-col items-center sm:mt-12">
              {isLoading ? (
                <div className="flex flex-col items-center gap-4">
                  <span className="h-12 w-12 animate-spin rounded-full border-2 border-white/20 border-t-white sm:h-14 sm:w-14" />
                  <p className="text-xs tracking-widest text-gray-400 sm:text-sm">
                    解鎖靈魂歌曲中...
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleMicClick}
                  aria-label={isRecording ? "停止錄音" : "開始錄音"}
                  className="relative flex h-28 w-28 items-center justify-center rounded-full sm:h-32 sm:w-32 md:h-36 md:w-36"
                >
                  {/* 呼吸燈光暈 */}
                  <span
                    className={`absolute inset-0 rounded-full ${
                      isRecording
                        ? "animate-pulse bg-red-500/30"
                        : "animate-pulse"
                    }`}
                    style={{
                      backgroundColor: isRecording
                        ? undefined
                        : `${selectedMood.accent_color}25`,
                    }}
                  />
                  {isRecording && (
                    <span className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
                  )}
                  <span
                    className={`relative flex h-20 w-20 items-center justify-center rounded-full border text-3xl transition-all sm:h-24 sm:w-24 sm:text-4xl md:h-28 md:w-28 ${
                      isRecording
                        ? "border-red-400/60 bg-red-500/10"
                        : "border-white/20 bg-white/5"
                    }`}
                  >
                    🎙️
                  </span>
                </button>
              )}

              <p className="mt-4 h-5 text-xs tracking-widest text-gray-500 sm:mt-6">
                {isLoading
                  ? ""
                  : isRecording
                    ? "錄音中，再按一次結束"
                    : "按下開始錄音"}
              </p>
            </div>

            {errorMessage && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-6 py-3 text-sm text-red-300 sm:mt-6">
                {errorMessage}
              </div>
            )}

            {showFailHint && (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-8 py-4 text-center sm:mt-6">
                <p className="text-sm text-gray-300">
                  再試一次，你差一點點就成功了！
                </p>
                {matchReason && (
                  <p className="mt-1 text-xs text-gray-600">{matchReason}</p>
                )}
              </div>
            )}
          </div>

          {/* 隱私宣告：固定貼在畫面最底部，絕對不會被中間內容擠出畫面 */}
          <p className="mt-auto max-w-md pt-4 text-center text-[10px] leading-normal text-gray-600 sm:text-xs">
            點擊錄音即代表您同意本站將音訊以去識別化方式用於台語 AI
            模型訓練與文化保存。
          </p>
        </div>
      )}

      {/* ============================== 階段 3 ============================== */}
      {stage === 3 && selectedMood && spotifyEmbedUrl && (
        <div
          className={`flex h-full w-full flex-col items-center p-4 md:p-8 ${fadeClass}`}
        >
          <p className="mb-4 mt-2 text-center text-base tracking-[0.2em] text-white sm:mb-6 sm:mt-4 sm:text-lg">
            靈 魂 已 共 鳴
          </p>

          {/* 中段內容：Spotify 播放器 + 分享卡片預覽，用 flex-1 + min-h-0 讓它在有限空間內自動縮放，不會把按鈕擠出畫面 */}
          <div className="my-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 overflow-hidden text-center">
            <div className="w-full overflow-hidden rounded-2xl shadow-[0_0_60px_rgba(255,255,255,0.06)]">
              <iframe
                src={spotifyEmbedUrl}
                width="100%"
                height="152"
                frameBorder="0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                title="Spotify 播放器"
              />
            </div>

            <p className="w-full max-w-xs break-words px-6 text-center text-xl font-semibold text-white sm:max-w-md md:text-2xl">
              {selectedMood.label} {selectedMood.emoji}
            </p>

            <div className="flex min-h-0 flex-1 items-center justify-center">
              {isGeneratingShareImage && !shareImageUrl && (
                <p className="text-xs text-gray-600">正在產生分享卡片...</p>
              )}
              {shareImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shareImageUrl}
                  alt="分享卡片預覽"
                  className="max-h-[24vh] w-auto rounded-xl border border-white/10 object-contain"
                />
              )}
            </div>
          </div>

          {/* 按鈕組：固定貼在畫面下緣，任何螢幕高度（含 iPhone SE）都能直接看到，不用往下滑 */}
          <div className="mb-4 flex w-full max-w-xs flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              disabled={isGeneratingShareImage}
              className="w-full rounded-full border border-white/20 bg-white py-3.5 text-sm font-semibold tracking-widest text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              下載並分享到 Threads / IG
            </button>

            {shareErrorMessage && (
              <p className="text-center text-xs text-red-400">
                {shareErrorMessage}
              </p>
            )}

            <button
              type="button"
              onClick={handleRestart}
              className="mt-1 text-xs tracking-[0.2em] text-gray-500 hover:text-gray-300"
            >
              重新選擇主題
            </button>
          </div>
        </div>
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
