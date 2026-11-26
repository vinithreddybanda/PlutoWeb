import type { SearchResult, Track } from "./types";

const ORIGIN = "https://music.youtube.com";
const API = ORIGIN + "/youtubei/v1";
const CLIENT = {
  context: {
    client: {
      clientName: "WEB_REMIX",
      clientVersion: "1.20250115.01.00",
      hl: "en",
      gl: "US"
    }
  }
};

function text(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(text).join("");
  return value.simpleText ?? value.runs?.map((r: any) => r.text).join("") ?? "";
}

function walk(value: any, visit: (node: any) => void) {
  if (!value || typeof value !== "object") return;
  visit(value);
  if (Array.isArray(value)) value.forEach(v => walk(v, visit));
  else Object.values(value).forEach(v => walk(v, visit));
}

function parseTracks(data: any): Track[] {
  const found = new Map<string, Track>();
  walk(data, node => {
    const renderer = node.musicResponsiveListItemRenderer ?? node.musicTwoRowItemRenderer ??
      node.playlistPanelVideoRenderer ?? node.compactVideoRenderer;
    if (!renderer) return;
    const videoId = renderer.playlistItemData?.videoId ?? renderer.videoId;
    if (!videoId || found.has(videoId)) return;
    const flex = renderer.flexColumns ?? [];
    const title = text(flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text) ||
      text(renderer.title) || "Unknown track";
    const artistColumn = flex[1]?.musicResponsiveListItemFlexColumnRenderer?.text;
    const artists = text(artistColumn) || text(renderer.shortBylineText) || "Unknown artist";
    const thumbnails = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ??
      renderer.thumbnail?.thumbnails ?? renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
    const thumb = thumbnails?.[thumbnails.length - 1]?.url;
    const duration = text(renderer.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text) ||
      text(renderer.lengthText);
    found.set(videoId, { videoId, title, artists, thumbnail: thumb, duration,
      playlistId: renderer.playlistId });
  });
  return [...found.values()];
}

export class YouTubeMusicWeb {
  private async request<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${API}/${endpoint}?prettyPrint=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": ORIGIN },
      body: JSON.stringify({ ...CLIENT, ...body })
    });
    if (!response.ok) throw new Error(`YouTube Music returned ${response.status}`);
    return response.json() as Promise<T>;
  }

  async search(query: string): Promise<SearchResult> {
    const data = await this.request<any>("search", { query, params: "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D" });
    return { tracks: parseTracks(data) };
  }

  async next(videoId: string, playlistId?: string): Promise<Track[]> {
    const data = await this.request<any>("next", {
      videoId,
      playlistId,
      watchEndpoint: { videoId, playlistId }
    });
    return parseTracks(data);
  }

  async stream(videoId: string): Promise<string> {
    const data = await this.request<any>("player", { videoId, playbackContext: { contentPlaybackContext: { signatureTimestamp: 0 } } });
    const formats = [...(data.streamingData?.adaptiveFormats ?? []), ...(data.streamingData?.formats ?? [])];
    const audio = formats.filter((f: any) => f.mimeType?.startsWith("audio/") && f.url)
      .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
    if (!audio?.url) throw new Error("No browser-playable audio URL was returned. This source may require signature deciphering or a compatible service.");
    return audio.url;
  }
}

export const musicApi = new YouTubeMusicWeb();