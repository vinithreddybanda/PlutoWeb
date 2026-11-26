export const YOUTUBE_MUSIC_ORIGIN = "https://music.youtube.com";
export const YOUTUBE_MUSIC_API = `${YOUTUBE_MUSIC_ORIGIN}/youtubei/v1`;

export const WEB_REMIX_CONTEXT = {
  client: {
    clientName: "WEB_REMIX",
    clientVersion: "1.20260304.03.00",
    hl: "en",
    gl: "US",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
  }
};

export type WatchEndpoint = {
  videoId?: string | null;
  playlistId?: string | null;
  playlistSetVideoId?: string | null;
  index?: number | null;
  params?: string | null;
};

export type NextRequest = WatchEndpoint & {
  continuation?: string | null;
};

export function createWebRemixContext() {
  return {
    context: {
      client: {
        ...WEB_REMIX_CONTEXT.client,
        visitorData: undefined
      }
    }
  };
}

export async function innertubePost<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      `${YOUTUBE_MUSIC_API}/${endpoint}?prettyPrint=false`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-YouTube-Client-Name": "1",
          "X-YouTube-Client-Version": WEB_REMIX_CONTEXT.client.clientVersion
        },
        body: JSON.stringify({
          ...createWebRemixContext(),
          ...body
        })
      }
    );
  } catch {
    throw new Error(
      "The browser could not reach YouTube Music. Its cross-origin policy may block direct API requests; a TypeScript port cannot remove browser CORS restrictions."
    );
  }

  if (!response.ok) {
    throw new Error(`YouTube Music ${endpoint} request failed (${response.status}).`);
  }

  return response.json() as Promise<T>;
}
