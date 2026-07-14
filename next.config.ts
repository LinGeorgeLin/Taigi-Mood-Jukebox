import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        // 當前端呼叫 /api/moods 時，Next.js 會在後台默默幫你轉去 Hugging Face
        source: '/api/moods',
        destination: 'https://georgelin29-taigi-mood-backend.hf.space/api/moods',
      },
      {
        // 當前端呼叫 /api/mood-asr 時，自動轉去 Hugging Face
        source: '/api/mood-asr',
        destination: 'https://georgelin29-taigi-mood-backend.hf.space/api/mood-asr',
      },
    ];
  },
};

export default nextConfig;