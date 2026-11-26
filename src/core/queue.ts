import { innertubePost, type NextRequest, type WatchEndpoint } from "./innertube";
import type { Track } from "../types";

type AnyRecord = Record<string, any>;

export type QueuePage = {
  title?: string;
  items: Track[];
  currentIndex?: number;
  continuation?: string;
  endpoint: WatchEndpoint;
};

const uniqueByVideoId = (tracks: Track[]) => {
  const seen = new Set<string>();
  return tracks.filter(track => {
    if (!track.videoId || seen.has(track.videoId)) return false;
    seen.add(track.videoId);
    return true;
  });
};

function runText(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(runText).join("");
  return value.simpleText ?? value.runs?.map((run: AnyRecord) => run.text ?? "").join("") ?? "";
}

function bestThumbnail(thumbnails: AnyRecord[] | undefined): string | undefined {
  if (!thumbnails?.length) return undefined;
  return [...thumbnails].sort((a, b) =>
    (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0)
  ).at(-1)?.url ?? thumbnails[thumbnails.length - 1]?.url;
}

function musicVideoType(renderer: AnyRecord): string | undefined {
  return renderer.navigationEndpoint?.watchEndpoint
    ?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;
}

function parsePanelVideo(renderer: AnyRecord | undefined): Track | null {
  if (!renderer?.videoId) return null;

  const artistRuns = renderer.longBylineText?.runs ?? renderer.shortBylineText?.runs ?? [];
  const artistNames = artistRuns
    .filter((run: AnyRecord) => run.text && run.navigationEndpoint?.browseEndpoint)
    .map((run: AnyRecord) => run.text);
  const artists = artistNames.length
    ? artistNames.join(", ")
    : runText(renderer.longBylineText ?? renderer.shortBylineText) || "Unknown artist";

  const title = runText(renderer.title) || "Unknown track";
  const duration = runText(renderer.lengthText);
  const thumbnail = bestThumbnail(renderer.thumbnail?.thumbnails);

  return {
    videoId: renderer.videoId,
    title,
    artists,
    duration: duration || undefined,
    thumbnail,
    musicVideoType: musicVideoType(renderer),
    isLive: (renderer.badges ?? []).some((badge: AnyRecord) => Boolean(badge.liveBadgeRenderer))
  };
}

function parsePanelContent(content: AnyRecord): Track | null {
  const wrapper = content.playlistPanelVideoWrapperRenderer;
  const primary = content.playlistPanelVideoRenderer ??
    wrapper?.primaryRenderer?.playlistPanelVideoRenderer;
  const track = parsePanelVideo(primary);
  if (!track) return null;

  const counterpartRenderer = wrapper?.counterpart
    ?.map((item: AnyRecord) => item.counterpartRenderer?.playlistPanelVideoRenderer)
    .find(Boolean);
  const counterpart = parsePanelVideo(counterpartRenderer);
  if (counterpart) track.counterpart = counterpart;

  return track;
}

function parseResponsiveItem(renderer: AnyRecord): Track | null {
  const videoId = renderer.videoId ?? renderer.playlistItemData?.videoId;
  if (!videoId) return null;

  const columns = renderer.flexColumns ?? [];
  const title = runText(columns[0]?.musicResponsiveListItemFlexColumnRenderer?.text) ||
    runText(renderer.title) || "Unknown track";
  const artists = runText(columns[1]?.musicResponsiveListItemFlexColumnRenderer?.text) ||
    runText(renderer.shortBylineText) || "Unknown artist";
  const thumbnails = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ??
    renderer.thumbnail?.thumbnails ?? [];
  const duration = runText(
    renderer.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text
  ) || runText(renderer.lengthText);

  return {
    videoId,
    title,
    artists,
    thumbnail: bestThumbnail(thumbnails),
    duration: duration || undefined,
    musicVideoType: musicVideoType(renderer),
    isLive: (renderer.badges ?? []).some((badge: AnyRecord) => Boolean(badge.liveBadgeRenderer))
  };
}

function readPlaylistPanel(data: AnyRecord): AnyRecord | undefined {
  return data.continuationContents?.playlistPanelContinuation ??
    data.contents?.singleColumnMusicWatchNextResultsRenderer
      ?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs?.[0]
      ?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer;
}

function automixEndpoint(lastContent: AnyRecord | undefined): WatchEndpoint | null {
  const endpoint = lastContent?.automixPreviewVideoRenderer?.content
    ?.automixPlaylistVideoRenderer?.navigationEndpoint?.watchPlaylistEndpoint;
  if (!endpoint) return null;

  return {
    videoId: endpoint.videoId ?? null,
    playlistId: endpoint.playlistId ?? null,
    playlistSetVideoId: endpoint.playlistSetVideoId ?? null,
    index: endpoint.index ?? null,
    params: endpoint.params ?? null
  };
}

function continuationOf(panel: AnyRecord): string | undefined {
  return panel.continuations?.[0]?.nextContinuationData?.continuation ??
    panel.continuations?.[0]?.nextRadioContinuationData?.continuation;
}

async function requestNext(
  endpoint: WatchEndpoint,
  continuation?: string,
  depth = 0
): Promise<QueuePage> {
  if (depth > 4) throw new Error("YouTube Music returned too many nested automix queues.");

  const body: NextRequest = {
    videoId: endpoint.videoId ?? null,
    playlistId: endpoint.playlistId ?? null,
    playlistSetVideoId: endpoint.playlistSetVideoId ?? null,
    index: endpoint.index ?? null,
    params: endpoint.params ?? null,
    continuation: continuation ?? null
  };

  const data = await innertubePost<AnyRecord>("next", body);
  const panel = readPlaylistPanel(data);

  if (panel) {
    const contents: AnyRecord[] = panel.contents ?? [];
    const autoEndpoint = automixEndpoint(contents.at(-1));

    if (autoEndpoint) {
      const radioPage = await requestNext(autoEndpoint, undefined, depth + 1);
      return {
        ...radioPage,
        title: panel.title ?? runText(panel.titleText),
        items: uniqueByVideoId([
          ...contents.map(parsePanelContent).filter((item): item is Track => item !== null),
          ...radioPage.items
        ]),
        currentIndex: panel.currentIndex,
        endpoint: autoEndpoint
      };
    }

    return {
      title: panel.title ?? runText(panel.titleText),
      items: uniqueByVideoId(
        contents.map(parsePanelContent).filter((item): item is Track => item !== null)
      ),
      currentIndex: panel.currentIndex,
      continuation: continuationOf(panel),
      endpoint
    };
  }

  const shelf = data.continuationContents?.musicPlaylistShelfContinuation;
  if (shelf) {
    const items = (shelf.contents ?? [])
      .map((item: AnyRecord) => parseResponsiveItem(item.musicResponsiveListItemRenderer ?? {}))
      .filter((item: Track | null): item is Track => item !== null);

    return {
      items: uniqueByVideoId(items),
      continuation: shelf.continuations?.[0]?.nextContinuationData?.continuation,
      endpoint
    };
  }

  throw new Error("YouTube Music returned an unrecognised queue response.");
}

export async function getRadioQueue(videoId: string): Promise<QueuePage> {
  return requestNext({ videoId });
}

export async function continueQueue(page: QueuePage): Promise<QueuePage> {
  if (!page.continuation) return { ...page, items: [] };
  return requestNext(page.endpoint, page.continuation);
}

function isVideoSong(type?: string): boolean {
  return Boolean(type?.startsWith("MUSIC_VIDEO_TYPE_") && type !== "MUSIC_VIDEO_TYPE_ATV");
}

function isAudio(type?: string): boolean {
  return type === "MUSIC_VIDEO_TYPE_ATV";
}

/** Mirrors core/data SongRepositoryImpl.preferAudioWhenRadioAudioOnly. */
export function preferAudioWhenRadioAudioOnly(
  tracks: Track[],
  isRadio: boolean,
  enabled: boolean
): Track[] {
  if (!isRadio || !enabled) return tracks;

  const swapped = uniqueByVideoId(
    tracks.flatMap(track => {
      if (!isVideoSong(track.musicVideoType)) return [track];
      return track.counterpart && isAudio(track.counterpart.musicVideoType)
        ? [track.counterpart]
        : [];
    })
  );

  // SimpMusic keeps the original response if every row would otherwise disappear.
  return swapped.length ? swapped : tracks;
}

export async function getRelatedTracks(
  videoId: string,
  radioAudioOnly = false
): Promise<{ tracks: Track[]; continuation?: string; page: QueuePage }> {
  const page = await getRadioQueue(videoId);
  const related = uniqueByVideoId(page.items.filter(track => track.videoId !== videoId));
  return {
    tracks: preferAudioWhenRadioAudioOnly(related, true, radioAudioOnly),
    continuation: page.continuation,
    page
  };
}
