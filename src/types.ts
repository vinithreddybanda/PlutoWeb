export type Track = {
  videoId: string;
  title: string;
  artists: string;
  album?: string;
  thumbnail?: string;
  duration?: string;
  durationSeconds?: number;
  playlistId?: string;
};

export type SearchResult = { tracks: Track[]; continuation?: string };