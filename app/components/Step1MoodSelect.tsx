"use client";

import { useState, useCallback, useEffect, type FormEvent } from "react";
import type { Mood } from "./types";
import { getApiUrl } from "../lib/api";

interface MoodsResponse {
  moods?: Mood[];
  error?: string;
}

const MOODS_API_URL = getApiUrl("/api/moods");
const GOOGLE_SHEET_WEBHOOK_URL = process.env.NEXT_PUBLIC_GOOGLE_SHEET_WEBHOOK_URL || "";

interface Step1MoodSelectProps {
  selectedMood: Mood | null;
  onSelectMood: (mood: Mood) => void;
  onStart: () => void;
  showToast: (message: string) => void;
}

export default function Step1MoodSelect({
  selectedMood,
  onSelectMood,
  onStart,
  showToast,
}: Step1MoodSelectProps) {
  const [moods, setMoods] = useState<Mood[]>([]);
  const [isMoodsLoading, setIsMoodsLoading] = useState(true);
  const [moodsError, setMoodsError] = useState<string | null>(null);

  // ---------------- 社群投稿表單 ----------------
  const [isSubmitFormOpen, setIsSubmitFormOpen] = useState(false);
  const [submitMoodId, setSubmitMoodId] = useState("");
  const [submitSuggestedText, setSubmitSuggestedText] = useState("");
  const [submitSpotifyUrl, setSubmitSpotifyUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // 載入心情題庫
  // --------------------------------------------------------------------------
  useEffect(() => {
    async function loadMoods() {
      setIsMoodsLoading(true);
      setMoodsError(null);
      try {
        const response = await fetch(MOODS_API_URL);
        const data: MoodsResponse = await response.json();
        if (!response.ok || data.error || !data.moods) {
          setMoodsError(data.error || "無法載入心情題庫，請稍後再試。");
          return;
        }
        setMoods(data.moods);
      } catch (err) {
        console.error("載入心情題庫時發生錯誤：", err);
        setMoodsError("無法連接後端伺服器，請確認服務是否啟動。");
      } finally {
        setIsMoodsLoading(false);
      }
    }
    void loadMoods();
  }, []);

  // --------------------------------------------------------------------------
  // 投稿表單送出
  // --------------------------------------------------------------------------
  const handleSubmitMoodSong = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
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
        // Content-Type 故意用 text/plain，避開 Google Apps Script 不支援
        // CORS 預檢請求（OPTIONS）的限制，詳見專案文件說明。
        const response = await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            mood_id: submitMoodId,
            suggested_text: submitSuggestedText.trim(),
            spotify_url: submitSpotifyUrl.trim(),
          }),
        });

        const data: { success?: boolean; error?: string } = await response.json();

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
    [submitMoodId, submitSuggestedText, submitSpotifyUrl, showToast]
  );

  return (
    <div className="flex h-full w-full flex-col items-center justify-between overflow-y-auto p-4 md:p-8">
      <div className="flex-1" />

      <div className="flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4">
        <h1 className="mb-8 text-center font-serif text-2xl font-light tracking-[0.5em] text-white sm:mb-12 sm:text-3xl md:text-4xl md:tracking-[0.6em]">
          情 懷 留 聲 機
        </h1>

        {isMoodsLoading && <p className="text-sm text-gray-500">載入中...</p>}

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
                    onClick={() => onSelectMood(mood)}
                    className={`w-full rounded-2xl border px-6 py-4 text-left transition-all duration-300 sm:px-8 sm:py-5 ${
                      isSelected
                        ? "border-white/70 bg-white/[0.06]"
                        : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]"
                    }`}
                    style={{
                      boxShadow: isSelected ? `0 0 30px ${mood.accent_color}30` : undefined,
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
                onClick={onStart}
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

      {/* ---------------- 社群投稿：折疊式區塊 ---------------- */}
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
              isSubmitFormOpen ? "mt-4 max-h-[600px] opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <form
              onSubmit={handleSubmitMoodSong}
              className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5"
            >
              <div className="flex flex-col gap-1.5">
                <label htmlFor="submit-mood" className="text-xs text-gray-500">
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
                <label htmlFor="submit-text" className="text-xs text-gray-500">
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
                <label htmlFor="submit-url" className="text-xs text-gray-500">
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

              {submitError && <p className="text-xs text-red-400">{submitError}</p>}

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
  );
}
