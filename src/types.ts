export type Track = {
  videoId: string;
  title: string;
  artists: string;
  album?: string;
  thumbnail?: string;
  duration?: string;
  durationSeconds?: number;
  playlistId?: string;
  musicVideoType?: string;
  counterpart?: Track;
  isLive?: boolean;
};

export type SearchResult = { tracks: Track[]; continuation?: string };
