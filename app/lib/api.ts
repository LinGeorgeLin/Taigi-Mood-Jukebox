const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

function isLocalhostUrl(url: string) {
  return /localhost|127\.0\.0\.1/i.test(url);
}

function isPlaceholderUrl(url: string) {
  return /your-huggingface-backend-url/i.test(url);
}

export function getApiUrl(path: string, legacyUrl?: string) {
  if (legacyUrl && !isLocalhostUrl(legacyUrl)) {
    return legacyUrl;
  }

  if (!API_BASE_URL || isPlaceholderUrl(API_BASE_URL)) {
    if (legacyUrl) {
      return legacyUrl;
    }

    throw new Error("NEXT_PUBLIC_API_BASE_URL is not set or is still a placeholder.");
  }

  const normalizedBaseUrl = API_BASE_URL.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${normalizedBaseUrl}${normalizedPath}`;
}
