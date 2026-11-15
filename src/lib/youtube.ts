const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;

export function extractYoutubeId(value: string): string | undefined {
  const input = value.trim();
  if (!input) return undefined;
  if (VIDEO_ID_PATTERN.test(input)) return input;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    try {
      url = new URL(`https://${input}`);
    } catch {
      return undefined;
    }
  }

  const hostname = url.hostname.toLowerCase();
  const isYouTubeHost =
    hostname === "youtu.be" ||
    hostname === "youtube.com" ||
    hostname.endsWith(".youtube.com") ||
    hostname === "youtube-nocookie.com" ||
    hostname.endsWith(".youtube-nocookie.com");
  if (!isYouTubeHost) return undefined;

  const id =
    url.searchParams.get("v") ??
    (hostname === "youtu.be"
      ? url.pathname.split("/").filter(Boolean)[0]
      : url.pathname.split("/").filter(Boolean)[1]);
  return id && VIDEO_ID_PATTERN.test(id) ? id : undefined;
}
