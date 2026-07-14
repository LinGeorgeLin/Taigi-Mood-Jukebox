"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Mood } from "./types";
import { getApiUrl } from "../lib/api";
import { Client } from "@gradio/client";

interface MoodAsrResponse {
  text?: string;
  is_match?: boolean;
  reason?: string;
  spotify_embed_url?: string;
  spotify_url?: string;
  error?: string;
}

const MOOD_ASR_API_URL = getApiUrl(
  "/api/mood-asr",
  process.env.NEXT_PUBLIC_MOOD_ASR_API_URL,
);

interface Step2RecordingProps {
  mood: Mood;
  onBack: () => void;
  onUnlock: (spotifyEmbedUrl: string, spotifyUrl: string | null) => void;
}

export default function Step2Recording({
  mood,
  onBack,
  onUnlock,
}: Step2RecordingProps) {
  const [mounted, setMounted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showFailHint, setShowFailHint] = useState(false);
  const [matchReason, setMatchReason] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // 掛載後淡入：因為現在每個階段是嚴格條件渲染 + 動態載入，
  // 上一個階段的元件已經整個卸載，沒辦法再做「兩個階段同時存在、互相淡出淡入」的
  // 傳統 cross-fade，改成每個階段自己「掛載後淡入」，效果接近、但實作上更單純。
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(timer);
  }, []);
  // --------------------------------------------------------------------------
  // 送出音訊至 Hugging Face 後端進行辨識 (使用 Gradio Client)
  // --------------------------------------------------------------------------
const sendAudioToServer = useCallback(
    async (audioBlob: Blob) => {
      setIsLoading(true);
      setErrorMessage(null);
      setShowFailHint(false);

      try {
        // 1. 建立標準的 FormData 表單，用來封裝檔案與文字資料
        const formData = new FormData();
        
        // ⚠️ 注意：這裡的 "file" 和 "mood" 必須跟 Modal 後端的參數名稱完全一致！
        // 我們將錄音檔案命名為 recorded_audio.webm 送出
        formData.append("file", audioBlob, "recorded_audio.webm");
        formData.append("mood", mood.id);

        // 2. 使用標準 fetch 打 Modal 後端的 /api/mood-asr 接口
        const response = await fetch(
          "https://lingeorgelin--taigi-mood-backend-fastapi-app.modal.run/api/mood-asr",
          {
            method: "POST",
            body: formData, // fetch 會自動設定正確的 Content-Type: multipart/form-data
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP 錯誤！狀態碼: ${response.status}`);
        }

        // 3. 直接解析 JSON。Modal 回傳的就是乾淨的物件，不需要再經過 JSON.parse
        const data: MoodAsrResponse = await response.json();

        if ((data as any).error) {
          setErrorMessage((data as any).error || "辨識服務發生未知錯誤，請稍後再試。");
          return;
        }

        // 4. 將解析後的資料帶入你原本的邏輯中
        setMatchReason(data.reason ?? "");

        if (data.is_match && data.spotify_embed_url) {
          onUnlock(data.spotify_embed_url, data.spotify_url ?? null);
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
    [mood, onUnlock], // 依賴項保持不變
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

  // 返回上一頁前，如果正在錄音要先停止、釋放麥克風權限，不留下背景連線
  const handleBackClick = useCallback(() => {
    if (
      isRecording &&
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    onBack();
  }, [isRecording, onBack]);

  return (
    <div
      className={`relative flex h-full w-full flex-col items-center p-4 transition-opacity duration-300 md:p-8 ${
        mounted ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* 左上角返回按鈕 */}
      <button
        type="button"
        onClick={handleBackClick}
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

      {/* 主要內容 */}
      <div className="my-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 text-center">
        <span
          className="mb-6 rounded-full border px-5 py-1.5 text-xs tracking-[0.2em] text-gray-300 sm:mb-10"
          style={{ borderColor: `${mood.accent_color}50` }}
        >
          {mood.label}
        </span>

        <p className="w-full max-w-prose break-words text-xl font-bold leading-relaxed text-white sm:text-2xl md:text-4xl">
          {mood.hanji}
        </p>
        <p
          className="mt-3 break-words text-center text-xs tracking-wide sm:mt-4 sm:text-sm"
          style={{ color: mood.accent_color }}
        >
          {mood.tailo}
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
              <span
                className={`absolute inset-0 rounded-full ${
                  isRecording ? "animate-pulse bg-red-500/30" : "animate-pulse"
                }`}
                style={{
                  backgroundColor: isRecording
                    ? undefined
                    : `${mood.accent_color}25`,
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

      {/* 隱私宣告：固定貼在畫面最底部 */}
      <p className="mt-auto max-w-md pt-4 text-center text-[10px] leading-normal text-gray-600 sm:text-xs">
        點擊錄音即代表您同意本站將音訊以去識別化方式用於台語 AI
        模型訓練與文化保存。
      </p>
    </div>
  );
}
