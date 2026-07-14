import React from "react";

// ============================================================================
// 型別定義
// ============================================================================
interface IGShareCardProps {
  title?: string; // 主標題，例如「拜五爽啦」
  content?: string; // 台語長句本文
  romaji?: string; // 台羅拼音
  score?: number; // 右上角巨型分數
  songName?: string; // Spotify 模擬盒裡顯示的歌名
  moodTag?: string; // 保留這個 prop 是為了跟舊版呼叫端相容，沒填 songName 時會退回用這個
  accentColor?: string; // 幫黑膠唱片搖臂頭上一點點心情色，不影響整體黑白基調
  illustrationType?: any;
}

const LEADING_PUNCTUATION = /^[,.;:!?，。；：！？、）】」』》]/;

function formatLines(text: string, maxCharsPerLine: number, maxLines: number): string {
  const source = (text || "").replace(/\s+/g, "").trim();
  if (!source) return "";

  const lines: string[] = [];
  let cursor = 0;

  while (cursor < source.length && lines.length < maxLines) {
    lines.push(source.slice(cursor, cursor + maxCharsPerLine));
    cursor += maxCharsPerLine;
  }

  if (cursor < source.length && lines.length > 0) {
    const idx = lines.length - 1;
    const keep = Math.max(lines[idx].length - 1, 1);
    lines[idx] = `${lines[idx].slice(0, keep)}…`;
  }

  // 避免最後一行只剩 1 個字，回補上一行尾字。
  if (lines.length >= 2) {
    const lastIndex = lines.length - 1;
    if (lines[lastIndex].length === 1 && lines[lastIndex - 1].length >= 3) {
      lines[lastIndex] = lines[lastIndex - 1].slice(-1) + lines[lastIndex];
      lines[lastIndex - 1] = lines[lastIndex - 1].slice(0, -1);
    }
  }

  // 避免新行以標點開頭，將標點挪回上一行。
  for (let i = 1; i < lines.length; i++) {
    if (LEADING_PUNCTUATION.test(lines[i]) && lines[i - 1].length > 0) {
      lines[i - 1] += lines[i].slice(0, 1);
      lines[i] = lines[i].slice(1);
    }
  }

  return lines.filter(Boolean).join("\n");
}

function MoodGlyph({ accentColor = "#94a3b8" }: { accentColor?: string }) {
  return (
    <div className="relative flex h-59 w-59 items-center justify-center rounded-full" style={{ backgroundColor: `${accentColor}33` }}>
      <div className="absolute h-[72%] w-[72%] rounded-full border border-white/15" />
      <div className="absolute h-[44%] w-[44%] rounded-full border border-white/20" />
      <div className="h-8 w-8 rounded-full border border-white/40 bg-white/10" />
      <div className="absolute right-8.5 top-12 h-15.5 w-1.75 rounded-full bg-zinc-900" />
      <div className="absolute right-11.5 top-24.75 h-1.75 w-11.5 rotate-38 rounded-full bg-zinc-900" />
    </div>
  );
}

export const IGShareCard = ({
  title,
  content,
  romaji,
  songName,
  moodTag,
  accentColor = "#94a3b8",
}: IGShareCardProps) => {
  const displaySongName = songName || moodTag || title || "Taigi Mood Jukebox";
  const baseTitle = title || "拜五爽啦";
  const baseContent = content || "今仔日拜五，暗時想欲佮朋友做伙夜市食牛排、啉珍奶。";
  const displayRomaji =
    romaji || "kin-a-jit pai-goo, am-si siunn-beh kah ping-iu tso-hue khi ia-tshi tsiah gu-pai, lim tin-tsu-le.";
  const displayTitle = formatLines(baseTitle, 5, 2);
  const displayContent = formatLines(baseContent, 9, 5);

  return (
    <div id="ig-share-card" className="relative h-240 w-135 overflow-hidden bg-black px-11 pb-10 pt-10 font-sans text-white">
      <div className="pointer-events-none absolute -left-16 top-52 h-64 w-64 rounded-full blur-3xl" style={{ backgroundColor: `${accentColor}26` }} />
      <div className="pointer-events-none absolute -right-20 top-24 h-72 w-72 rounded-full bg-zinc-800/35 blur-3xl" />

      <div className="relative z-10 flex items-center justify-between">
        <p className="text-[20px] font-medium tracking-[0.22em] text-zinc-200">情 懷 留 聲 機</p>
        <p className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-medium tracking-[0.16em] text-zinc-300">MOOD EDITION</p>
      </div>

      <div className="relative z-10 mt-8 grid grid-cols-[1fr_236px] gap-6">
        <div>
          <h1 className="whitespace-pre-line text-[67px] font-black leading-[1.04] tracking-[0.015em] text-white">{displayTitle}</h1>
          <p className="mt-7 whitespace-pre-line text-[34px] font-bold leading-[1.24] tracking-[0.01em] text-zinc-100">{displayContent}</p>
        </div>

        <div className="pt-20">
          <MoodGlyph accentColor={accentColor} />
        </div>
      </div>

      <div className="relative z-10 mt-8 rounded-2xl border border-white/15 bg-white/4 px-5 py-4">
        <p className="text-center text-[13px] font-medium leading-[1.45] tracking-[0.02em] text-zinc-400">{displayRomaji}</p>
      </div>

      <div className="relative z-10 mt-8 border-t border-white/18 pt-5">
        <p className="text-[12px] font-semibold tracking-[0.23em] text-zinc-500">CURRENT TRACK</p>
        <p className="mt-2 text-[27px] font-semibold leading-[1.15] tracking-[0.01em] text-zinc-100">{displaySongName}</p>
        <p className="mt-1 text-[13px] font-medium tracking-widest text-zinc-500">TAIGI MOOD JUKEBOX</p>

        <div className="absolute right-0 top-1 [writing-mode:vertical-rl] text-[31px] font-semibold leading-none tracking-[0.02em] text-zinc-200">
          Mood Jukebox
        </div>
      </div>
    </div>
  );
};
