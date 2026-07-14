import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        // 加上 .direct 才能繞過 Hugging Face 的 HTML 外殼，直接連到 FastAPI 後端
        source: '/api/moods',
        destination: 'https://georgelin29-taigi-mood-backend.direct.hf.space/api/moods',
      },
      {
        source: '/api/mood-asr',
        destination: 'https://georgelin29-taigi-mood-backend.direct.hf.space/api/mood-asr',
      },
    ];
  },
};

export default nextConfig;