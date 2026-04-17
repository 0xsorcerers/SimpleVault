const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "bmp"];
const VIDEO_EXTENSIONS = ["mp4", "webm", "ogg", "mov", "m4v", "avi"];

export const MAX_MEDIA_SIZE_BYTES = 5 * 1024 * 1024;

const extractExtension = (url: string): string => {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    const extension = pathname.split(".").pop();
    return extension ?? "";
  } catch {
    return "";
  }
};

export const isSupportedMediaUrl = (url: string): boolean => {
  if (!url.trim()) return false;

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    const extension = extractExtension(url);
    return IMAGE_EXTENSIONS.includes(extension) || VIDEO_EXTENSIONS.includes(extension);
  } catch {
    return false;
  }
};

export const isVideoUrl = (url?: string | null): boolean => {
  if (!url) return false;
  const extension = extractExtension(url);
  return VIDEO_EXTENSIONS.includes(extension);
};

const parseContentLength = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const getRemoteMediaSizeBytes = async (url: string): Promise<number | null> => {
  try {
    const headResponse = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
    });

    const headLength = parseContentLength(headResponse.headers.get("content-length"));
    if (headLength !== null) return headLength;
  } catch {
    // Ignore and continue with Range request fallback
  }

  try {
    const rangeResponse = await fetch(url, {
      method: "GET",
      headers: {
        Range: "bytes=0-0",
      },
      cache: "no-store",
    });

    const contentRange = rangeResponse.headers.get("content-range");
    if (contentRange) {
      const totalBytes = contentRange.split("/").pop();
      const parsed = totalBytes ? Number(totalBytes) : Number.NaN;
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return parseContentLength(rangeResponse.headers.get("content-length"));
  } catch {
    return null;
  }
};
