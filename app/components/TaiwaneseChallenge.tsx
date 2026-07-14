"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ----------------------------------------------------------------------------
// 型別定義
// ----------------------------------------------------------------------------
type ResultStatus = "idle" | "success" | "fail";
type SaveStatus = "idle" | "saving" | "saved" | "error";

interface Challenge {
  id: string;
  hanji: string;
  tailo: string;
  slug: string;
  match_keywords: string[];
  required_match_count: number;
  question_order: number;
}

interface ChallengesResponse {
  challenges?: Challenge[];
  error?: string;
}

interface AsrResponse {
  text?: string;
  error?: string;
}

interface SaveDatasetResponse {
  success?: boolean;
  audio_url?: string;
  record_id?: string;
  error?: string;
}

const ASR_API_URL =
  process.env.NEXT_PUBLIC_ASR_API_URL || "http://localhost:8000/api/asr";
const SAVE_DATASET_API_URL =
  process.env.NEXT_PUBLIC_SAVE_DATASET_API_URL ||
  "http://localhost:8000/api/save-dataset";
const CHALLENGES_TODAY_API_URL =
  process.env.NEXT_PUBLIC_CHALLENGES_TODAY_API_URL ||
  "http://localhost:8000/api/challenges/today";

export default function TaiwaneseChallenge() {
  // --------------------------------------------------------------------------
  // 狀態管理
  // --------------------------------------------------------------------------
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isChallengesLoading, setIsChallengesLoading] = useState(true);
  const [challengesError, setChallengesError] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [resultStatus, setResultStatus] = useState<ResultStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const currentChallenge: Challenge | null = challenges[currentIndex] ?? null;

  // --------------------------------------------------------------------------
  // 頁面載入時，向後端取得今日題庫（5 題）
  // --------------------------------------------------------------------------
  useEffect(() => {
    async function loadTodayChallenges() {
      setIsChallengesLoading(true);
      setChallengesError(null);

      try {
        const response = await fetch(CHALLENGES_TODAY_API_URL);
        const data: ChallengesResponse = await response.json();

        if (!response.ok || data.error) {
          setChallengesError(data.error || "無法取得今日題庫，請稍後再試。");
          return;
        }

        if (!data.challenges || data.challenges.length === 0) {
          setChallengesError("今天還沒有出題，請稍後再回來挑戰！");
          return;
        }

        setChallenges(data.challenges);
      } catch (err) {
        console.error("取得題庫時發生錯誤：", err);
        setChallengesError("無法連接後端伺服器，請確認服務是否啟動。");
      } finally {
        setIsChallengesLoading(false);
      }
    }

    void loadTodayChallenges();
  }, []);

  // --------------------------------------------------------------------------
  // 判斷辨識結果是否命中足夠數量的關鍵字
  // --------------------------------------------------------------------------
  const isChallengeSuccess = useCallback(
    (recognizedText: string, challenge: Challenge): boolean => {
      const matchedCount = challenge.match_keywords.filter((keyword) =>
        recognizedText.includes(keyword)
      ).length;

      return matchedCount >= challenge.required_match_count;
    },
    []
  );

  // --------------------------------------------------------------------------
  // 挑戰成功後，將音訊存入後端資料集（背景任務，失敗不影響主流程）
  // --------------------------------------------------------------------------
  const saveToDataset = useCallback(
    async (audioBlob: Blob, challenge: Challenge, recognizedText: string) => {
      setSaveStatus("saving");

      try {
        const formData = new FormData();
        formData.append("file", audioBlob, "recording.webm");
        formData.append("challenge_id", challenge.id);
        formData.append("recognized_text", recognizedText);

        const response = await fetch(SAVE_DATASET_API_URL, {
          method: "POST",
          body: formData,
        });

        const data: SaveDatasetResponse = await response.json();

        if (!response.ok || data.error || !data.success) {
          console.warn("資料集儲存失敗：", data.error);
          setSaveStatus("error");
          return;
        }

        setSaveStatus("saved");
      } catch (err) {
        console.error("資料集儲存請求發生錯誤：", err);
        setSaveStatus("error");
      }
    },
    []
  );

  // --------------------------------------------------------------------------
  // 將錄好的音訊送到後端 ASR API
  // --------------------------------------------------------------------------
  const sendAudioToServer = useCallback(
    async (audioBlob: Blob) => {
      if (!currentChallenge) return;

      setIsLoading(true);
      setErrorMessage(null);
      setSaveStatus("idle");

      try {
        const formData = new FormData();
        formData.append("file", audioBlob, "recording.webm");

        const response = await fetch(ASR_API_URL, {
          method: "POST",
          body: formData,
        });

        const data: AsrResponse = await response.json();

        if (!response.ok || data.error) {
          setErrorMessage(data.error || "辨識服務發生未知錯誤，請稍後再試。");
          setResultStatus("idle");
          setTranscription("");
          return;
        }

        const recognizedText = data.text ?? "";
        setTranscription(recognizedText);

        const isMatch = isChallengeSuccess(recognizedText, currentChallenge);

        if (isMatch) {
          setResultStatus("success");
          void saveToDataset(audioBlob, currentChallenge, recognizedText);
        } else {
          setResultStatus("fail");
        }
      } catch (err) {
        console.error("送出音訊時發生錯誤：", err);
        setErrorMessage("無法連接語音辨識服務，請確認後端伺服器是否啟動。");
        setResultStatus("idle");
      } finally {
        setIsLoading(false);
      }
    },
    [currentChallenge, isChallengeSuccess, saveToDataset]
  );

  // --------------------------------------------------------------------------
  // 開始 / 停止錄音
  // --------------------------------------------------------------------------
  const startRecording = useCallback(async () => {
    setErrorMessage(null);
    setResultStatus("idle");
    setTranscription("");
    setSaveStatus("idle");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const handleMicClick = useCallback(() => {
    if (isLoading || !currentChallenge) return;

    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  }, [isRecording, isLoading, currentChallenge, startRecording, stopRecording]);

  // --------------------------------------------------------------------------
  // 切換到下一題
  // --------------------------------------------------------------------------
  const goToNextChallenge = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, challenges.length - 1));
    setResultStatus("idle");
    setTranscription("");
    setErrorMessage(null);
    setSaveStatus("idle");
  }, [challenges.length]);

  const isLastChallenge = currentIndex >= challenges.length - 1;

  // --------------------------------------------------------------------------
  // 載入中 / 錯誤狀態畫面
  // --------------------------------------------------------------------------
  if (isChallengesLoading) {
    return (
      <div className="min-h-screen w-full bg-gray-900 flex items-center justify-center">
        <p className="text-gray-400 text-sm">正在載入今日題庫...</p>
      </div>
    );
  }

  if (challengesError || !currentChallenge) {
    return (
      <div className="min-h-screen w-full bg-gray-900 flex items-center justify-center px-6">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-center text-sm text-red-300">
          {challengesError || "找不到今日題目。"}
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // 主畫面
  // --------------------------------------------------------------------------
  return (
    <div className="min-h-screen w-full bg-gray-900 flex flex-col items-center justify-center px-6 py-12">
      {/* 頁面標題 + 題號進度 */}
      <div className="mb-2 flex items-center gap-2 text-emerald-400/80 text-sm font-medium tracking-widest uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        台語發音大挑戰
        <span className="text-gray-500 normal-case tracking-normal">
          （第 {currentChallenge.question_order} / {challenges.length} 題）
        </span>
      </div>

      {/* 挑戰句卡片 */}
      <div className="mt-4 mb-10 w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm px-8 py-10 text-center shadow-2xl">
        <p className="text-sm text-gray-400 mb-3">今日挑戰台語文</p>
        <p className="text-3xl sm:text-4xl font-bold text-white leading-relaxed">
          {currentChallenge.hanji}
        </p>
        <p className="mt-3 text-base text-emerald-300/90 tracking-wide">
          {currentChallenge.tailo}
        </p>
      </div>

      {/* 錄音按鈕 */}
      <button
        type="button"
        onClick={handleMicClick}
        disabled={isLoading}
        aria-label={isRecording ? "停止錄音" : "開始錄音"}
        className={`
          relative flex h-32 w-32 items-center justify-center rounded-full text-5xl
          transition-all duration-300 ease-out
          focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/50
          disabled:cursor-not-allowed disabled:opacity-60
          ${
            isRecording
              ? "bg-gradient-to-br from-red-500 to-rose-600 shadow-[0_0_40px_rgba(244,63,94,0.5)] scale-105"
              : "bg-gradient-to-br from-emerald-400 to-blue-500 shadow-[0_0_30px_rgba(16,185,129,0.35)] hover:scale-105 hover:shadow-[0_0_40px_rgba(16,185,129,0.5)]"
          }
        `}
      >
        {isRecording && (
          <span className="absolute inset-0 rounded-full bg-red-500/40 animate-ping" />
        )}
        <span className="relative">{isLoading ? "⏳" : "🎙️"}</span>
      </button>

      {/* 狀態文字 */}
      <p className="mt-6 h-6 text-sm text-gray-400">
        {isLoading
          ? "辨識中，請稍候..."
          : isRecording
          ? "錄音中，再點一次結束"
          : "點擊麥克風開始錄音"}
      </p>

      {/* 隱私條款說明 */}
      <p className="mt-2 max-w-sm text-center text-xs text-gray-500 leading-relaxed">
        點擊錄音即代表您同意本站將音訊以去識別化方式
        <br />
        用於台語 AI 模型訓練與文化保存。
      </p>

      {/* 辨識結果文字 */}
      {transcription && !isLoading && (
        <p className="mt-6 max-w-md text-center text-gray-300">
          辨識結果：<span className="text-white font-medium">{transcription}</span>
        </p>
      )}

      {/* 錯誤提示 */}
      {errorMessage && (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-3 text-sm text-red-300">
          {errorMessage}
        </div>
      )}

      {/* 挑戰成功 */}
      {resultStatus === "success" && (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-8 py-4 text-center">
          <p className="text-xl font-bold text-emerald-300">
            🎉 挑戰成功！發音非常標準！
          </p>

          {saveStatus === "saving" && (
            <p className="text-xs text-gray-400">正在為台語文化保存貢獻你的聲音...</p>
          )}
          {saveStatus === "saved" && (
            <p className="text-xs text-emerald-400/80">✓ 已收錄至台語語料庫，感謝你的貢獻！</p>
          )}
          {saveStatus === "error" && (
            <p className="text-xs text-gray-500">（語料儲存暫時失敗，不影響你的挑戰成績）</p>
          )}

          {!isLastChallenge && (
            <button
              type="button"
              onClick={goToNextChallenge}
              className="mt-2 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 px-6 py-2 text-sm font-medium text-white transition hover:scale-105"
            >
              下一題 →
            </button>
          )}
          {isLastChallenge && (
            <p className="mt-2 text-sm text-gray-400">今天的題目都挑戰完了，明天再來！</p>
          )}
        </div>
      )}

      {/* 挑戰失敗 */}
      {resultStatus === "fail" && (
        <div className="mt-6 rounded-xl border border-gray-500/30 bg-gray-500/10 px-8 py-4 text-center">
          <p className="text-lg font-medium text-gray-300">
            再試一次，你差一點點就成功了！
          </p>
        </div>
      )}
    </div>
  );
}
