"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import * as htmlToImage from "html-to-image";
import type { Mood } from "./types";
import Link from "next/link";

interface Step3ResultProps {
  mood: Mood;
  spotifyEmbedUrl: string;
  spotifyUrl: string | null;
  onRestart: () => void;
  showToast: (message: string) => void;
}

// ============================================================================
// 粒子煙火特效（純 Canvas，不依賴套件）
// 只有進到階段三才會被瀏覽器下載/初始化，階段一、二完全不會載入這段程式碼。
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
// 主元件
// ============================================================================
export default function Step3Result({
  mood,
  spotifyEmbedUrl,
  spotifyUrl,
  onRestart,
  showToast,
}: Step3ResultProps) {
  const [mounted, setMounted] = useState(false);
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null);
  const [shareBlob, setShareBlob] = useState<Blob | null>(null);
  const [isGeneratingShareImage, setIsGeneratingShareImage] = useState(false);
  const [shareErrorMessage, setShareErrorMessage] = useState<string | null>(
    null,
  );

  const { canvasRef, trigger: triggerFireworks } = useFireworks();

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(timer);
  }, []);

  // 進入這個階段就自動放煙火 + 產生分享卡片
  useEffect(() => {
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
  }, [mood.id]);

  useEffect(() => {
    return () => {
      if (shareImageUrl) {
        URL.revokeObjectURL(shareImageUrl);
      }
    };
  }, [shareImageUrl]);

  const handleShare = useCallback(async () => {
    setShareErrorMessage(null);

    let blob = shareBlob;
    if (!blob) {
      setIsGeneratingShareImage(true);
      blob = await captureIGShareCardBlob();
      setIsGeneratingShareImage(false);
    }

    if (!blob) {
      setShareErrorMessage("圖片產生失敗，請稍後再試。");
      return;
    }

    // Viral Loop：把真實可點擊的 Spotify 連結複製到剪貼簿，
    // 因為分享卡片圖片本身在 IG 限動 / Threads 上沒辦法點擊。
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

    const file = new File([blob], "taigi-mood-jukebox.png", {
      type: "image/png",
    });
    let sharedNatively = false;

    if (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          files: [file],
          title: "情懷留聲機",
          text: "我用台語解鎖了我的專屬 BGM！",
        });
        sharedNatively = true;
      } catch (shareErr) {
        if ((shareErr as Error)?.name !== "AbortError") {
          console.warn("原生分享失敗，改用下載：", shareErr);
        }
      }
    }

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
  }, [shareBlob, mood, spotifyUrl, showToast]);

  return (
    <div
      className={`flex min-h-full w-full flex-col items-center p-4 transition-opacity duration-300 md:p-8 overflow-y-auto no-scrollbar ${
        mounted ? "opacity-100" : "opacity-0"
      }`}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-50"
      />

      <p className="mb-4 mt-2 text-center text-base tracking-[0.2em] text-white sm:mb-6 sm:mt-4 sm:text-lg">
        靈 魂 已 共 鳴
      </p>

      <div className="mb-6 flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="w-full rounded-2xl shadow-[0_0_60px_rgba(255,255,255,0.06)]">
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

        <p className="w-full max-w-xs wrap-break-word px-6 text-center text-xl font-semibold text-white sm:max-w-md md:text-2xl">
          {mood.label} {mood.emoji}
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

      <div className="mt-auto flex w-full max-w-xs flex-col items-center gap-2.5 pb-8">
        <button
          type="button"
          onClick={handleShare}
          disabled={isGeneratingShareImage}
          className="w-full rounded-full border border-white/20 bg-white py-3.5 text-sm font-semibold tracking-widest text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
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
          onClick={onRestart}
          className="w-full rounded-full border border-white/20 bg-black py-3.5 text-sm font-semibold tracking-widest text-white transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          重新選擇主題
        </button>
        <Link
          href="https://creativelab-sigma.vercel.app/"
          className="w-full rounded-full border border-white/20 bg-black py-3.5 text-sm font-semibold tracking-widest text-white transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 inline-flex justify-center text-center cursor-pointer"
          target="_blank"
        >
          Creative Lab
        </Link>
      </div>
    </div>
  );
}
