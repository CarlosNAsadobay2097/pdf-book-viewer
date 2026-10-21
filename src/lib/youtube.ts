const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/

export function parseYouTubeId(raw: string): string | null {
  const value = raw.trim()
  if (VIDEO_ID.test(value)) return value

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username || url.password || url.port
  ) return null

  const host = url.hostname
  let id: string | null = null
  if (host === "youtu.be") {
    id = url.pathname.match(/^\/([a-zA-Z0-9_-]{11})\/?$/)?.[1] ?? null
  } else if (
    host === "youtube.com" || host === "www.youtube.com" ||
    host === "m.youtube.com" || host === "music.youtube.com"
  ) {
    id = /^\/watch\/?$/.test(url.pathname)
      ? url.searchParams.get("v")
      : url.pathname.match(/^\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})\/?$/)?.[1] ?? null
  } else if (host === "youtube-nocookie.com" || host === "www.youtube-nocookie.com") {
    id = url.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})\/?$/)?.[1] ?? null
  }

  return id !== null && VIDEO_ID.test(id) ? id : null
}
