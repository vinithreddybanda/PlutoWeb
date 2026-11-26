import type { SearchResult, Track } from "../types";

type AudiusTrack = {
  id: string | number; title?: string; duration?: number; genre?: string;
  artwork?: Record<string, string> | null;
  user?: { name?: string; handle?: string }; is_streamable?: boolean;
};
type AudiusResponse<T> = { data?: T; error?: string };
const APP_NAME = "PlutoWeb";
const API = "https://api.audius.co/v1";

function durationLabel(seconds?: number): string | undefined {
  if (!seconds || !Number.isFinite(seconds)) return undefined;
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
function mapTrack(item: AudiusTrack): Track {
  const id = String(item.id);
  return {
    videoId: `audius:${id}`, sourceId: id, source: "audius",
    title: item.title?.trim() || "Untitled track",
    artists: item.user?.name || item.user?.handle || "Unknown artist",
    album: item.genre || undefined,
    thumbnail: item.artwork?.["480x480"] || item.artwork?.["150x150"] || undefined,
    durationSeconds: item.duration, duration: durationLabel(item.duration)
  };
}
async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const join = path.includes("?") ? "&" : "?";
  const response = await fetch(`${API}${path}${join}app_name=${APP_NAME}`, {
    headers: { Accept: "application/json" }, signal
  });
  if (!response.ok) throw new Error(`Audius request failed (${response.status}).`);
  const payload = await response.json() as AudiusResponse<T>;
  if (payload.error || payload.data === undefined) throw new Error(payload.error || "Audius returned an empty response.");
  return payload.data;
}

export interface MusicProvider {
  readonly id: string;
  search(query: string, signal?: AbortSignal): Promise<SearchResult>;
  stream(track: Track): string | Promise<string>;
  next(track: Track): Promise<Track[]>;
}

export class AudiusProvider implements MusicProvider {
  readonly id = "audius";
  async search(query: string, signal?: AbortSignal): Promise<SearchResult> {
    const data = await request<AudiusTrack[]>(
      `/tracks/search?query=${encodeURIComponent(query)}&limit=30`, signal
    );
    return { tracks: (data || []).filter(x => x.id !== undefined && x.is_streamable !== false).map(mapTrack) };
  }
  stream(track: Track): string {
    const id = track.sourceId || track.videoId.replace(/^audius:/, "");
    return `${API}/tracks/${encodeURIComponent(id)}/stream?app_name=${APP_NAME}`;
  }
  async next(track: Track): Promise<Track[]> {
    const id = track.sourceId || track.videoId.replace(/^audius:/, "");
    const data = await request<AudiusTrack[]>(`/tracks/${encodeURIComponent(id)}/similar?limit=20`);
    return (data || []).map(mapTrack).filter(item => item.videoId !== track.videoId);
  }
}
export const audiusProvider = new AudiusProvider();
