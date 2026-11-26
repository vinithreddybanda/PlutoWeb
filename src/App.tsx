import { useCallback, useEffect, useRef, useState } from "react";
import { Disc3, Heart, Home, ListMusic, LoaderCircle, Music2, Pause, Play, Search, SkipBack, SkipForward, Volume2, X } from "lucide-react";
import { musicApi } from "./ytmusic";
import type { Track } from "./types";

const likedKey = "plutoweb-liked";
const queueKey = "plutoweb-queue";
const safeRead = (key: string): Track[] => {
  try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; }
  catch { return []; }
};
type Tab = "home" | "search" | "library";
const isYoutubeTrack = (track: Track | null | undefined) => Boolean(track && (track.source === "youtube" || (!track.source && !track.videoId.startsWith("audius:"))));

type YouTubePlayerEvent = { data: number; target: YouTubePlayer };
type YouTubePlayer = {
  playVideo(): void; pauseVideo(): void; seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number; getDuration(): number; destroy(): void;
};
type YouTubeApi = { Player: new (element: HTMLElement, options: Record<string, unknown>) => YouTubePlayer };
declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export default function App() {
  const audio = useRef<HTMLAudioElement>(null);
  const youtubeHost = useRef<HTMLDivElement>(null);
  const youtubePlayer = useRef<YouTubePlayer | null>(null);
  const nextRef = useRef<() => void>(() => {});
  const requestId = useRef(0);
  const preloadCache = useRef(new Map<string, string>());
  const history = useRef<Track[]>([]);
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [queue, setQueue] = useState<Track[]>(() => safeRead(queueKey));
  const [current, setCurrent] = useState<Track | null>(null);
  const [liked, setLiked] = useState<Track[]>(() => safeRead(likedKey));
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [volume, setVolume] = useState(0.8);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showQueue, setShowQueue] = useState(false);

  useEffect(() => { localStorage.setItem(likedKey, JSON.stringify(liked)); }, [liked]);
  useEffect(() => { localStorage.setItem(queueKey, JSON.stringify(queue)); }, [queue]);
  useEffect(() => { if (audio.current) audio.current.volume = volume; }, [volume]);

  const resolve = useCallback(async (track: Track) => {
    const cached = preloadCache.current.get(track.videoId);
    if (cached) { preloadCache.current.delete(track.videoId); return cached; }
    return musicApi.stream(track);
  }, []);

  const play = useCallback(async (track: Track, upcoming?: Track[], fromQueue = false) => {
    const id = ++requestId.current;
    if (!fromQueue) musicApi.resetRadioQueue();
    if (current && current.videoId !== track.videoId) history.current = [...history.current.slice(-49), current];
    setCurrent(track); setPlaying(false); setBusy(true); setError(""); setPosition(0); setDuration(track.durationSeconds || 0);
    if (upcoming) setQueue(upcoming);
    if (isYoutubeTrack(track)) {
      audio.current?.pause();
      if (audio.current) { audio.current.removeAttribute("src"); audio.current.load(); }
      if (current?.videoId === track.videoId && youtubePlayer.current) {
        youtubePlayer.current.playVideo();
        setBusy(false);
      }
      return;
    }
    youtubePlayer.current?.destroy();
    youtubePlayer.current = null;
    try {
      const url = await resolve(track);
      if (id !== requestId.current || !audio.current) return;
      audio.current.src = url;
      await audio.current.play();
      if (id !== requestId.current) return;
      if ("mediaSession" in navigator && typeof MediaMetadata !== "undefined") {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title, artist: track.artists, album: track.album || "PlutoWeb",
          artwork: track.thumbnail ? [{ src: track.thumbnail, sizes: "480x480", type: "image/jpeg" }] : []
        });
        navigator.mediaSession.setActionHandler("play", () => void audio.current?.play());
        navigator.mediaSession.setActionHandler("pause", () => audio.current?.pause());
        navigator.mediaSession.setActionHandler("nexttrack", () => void next());
        navigator.mediaSession.setActionHandler("previoustrack", () => void previous());
      }
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : "Playback failed.");
    } finally { if (id === requestId.current) setBusy(false); }
  }, [current, resolve]);

  const next = useCallback(async () => {
    if (queue.length) {
      const [head, ...rest] = queue;
      setQueue(rest);
      void play(head, rest, true);
      return;
    }
    if (!current) return;
    setBusy(true); setError("");
    try {
      const recommendations = (await musicApi.next(current)).filter(t => t.videoId !== current.videoId);
      if (recommendations.length) {
        const [head, ...rest] = recommendations;
        void play(head, rest, true);
      } else setError("No similar tracks were returned by this source.");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't load recommendations."); }
    finally { setBusy(false); }
  }, [current, queue, play]);

  useEffect(() => { nextRef.current = () => { void next(); }; }, [next]);

  useEffect(() => {
    if (!current || !isYoutubeTrack(current)) {
      youtubePlayer.current?.destroy();
      youtubePlayer.current = null;
      return;
    }
    let cancelled = false;
    let poll: number | undefined;
    const mount = () => {
      if (cancelled || !youtubeHost.current || !window.YT?.Player) return;
      youtubePlayer.current?.destroy();
      youtubeHost.current.innerHTML = "";
      const mountPoint = document.createElement("div");
      youtubeHost.current.appendChild(mountPoint);
      youtubePlayer.current = new window.YT.Player(mountPoint, {
        width: "100%",
        height: "225",
        videoId: current.videoId,
        playerVars: { autoplay: 1, playsinline: 1, origin: window.location.origin, enablejsapi: 1 },
        events: {
          onReady: (event: YouTubePlayerEvent) => {
            setBusy(false);
            event.target.playVideo();
            setDuration(event.target.getDuration() || 0);
          },
          onStateChange: (event: YouTubePlayerEvent) => {
            setPlaying(event.data === 1);
            if (event.data === 0) nextRef.current();
          },
          onError: () => {
            setBusy(false);
            setPlaying(false);
            setError("YouTube could not embed this video. Try another result.");
          }
        }
      });
      poll = window.setInterval(() => {
        const player = youtubePlayer.current;
        if (!player) return;
        const time = player.getCurrentTime();
        const total = player.getDuration();
        if (Number.isFinite(time)) setPosition(time);
        if (Number.isFinite(total) && total > 0) setDuration(total);
      }, 500);
    };
    if (window.YT?.Player) mount();
    else {
      const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
      if (!existing) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
      window.onYouTubeIframeAPIReady = mount;
    }
    return () => {
      cancelled = true;
      if (poll !== undefined) window.clearInterval(poll);
      youtubePlayer.current?.destroy();
      youtubePlayer.current = null;
    };
  }, [current?.videoId, current?.source]);

  const previous = useCallback(() => {
    const previousTrack = history.current.pop();
    if (previousTrack) void play(previousTrack, queue, true);
    else if (isYoutubeTrack(current) && youtubePlayer.current) youtubePlayer.current.seekTo(0, true);
    else if (audio.current) audio.current.currentTime = 0;
  }, [current, play, queue]);

  useEffect(() => {
    let cancelled = false;
    const upcoming = queue.filter(track => !isYoutubeTrack(track)).slice(0, 2);
    void Promise.all(upcoming.map(async track => {
      if (preloadCache.current.has(track.videoId)) return;
      try {
        const url = await musicApi.stream(track);
        if (cancelled) return;
        preloadCache.current.set(track.videoId, url);
        const warm = new Audio();
        warm.preload = "metadata";
        warm.src = url;
      } catch { /* The actual play path retries resolution and reports failures. */ }
    }));
    return () => { cancelled = true; };
  }, [queue]);

  async function search() {
    if (!query.trim()) return;
    setTab("search"); setBusy(true); setError("");
    try {
      const result = await musicApi.search(query.trim());
      setTracks(result.tracks);
      if (!result.tracks.length) setError("No tracks found. Try another search.");
    } catch (e) { setError(e instanceof Error ? e.message : "Search failed."); setTracks([]); }
    finally { setBusy(false); }
  }
  function toggleLike(track: Track) {
    setLiked(old => old.some(t => t.videoId === track.videoId)
      ? old.filter(t => t.videoId !== track.videoId) : [track, ...old]);
  }
  function addToQueue(track: Track) {
    setQueue(old => old.some(item => item.videoId === track.videoId) ? old : [...old, track]);
  }
  const isLiked = (track: Track) => liked.some(t => t.videoId === track.videoId);
  const visible = tab === "library" ? liked : tracks;
  const formatTime = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Disc3 size={21}/></span><span>pluto<span className="brand-light">web</span></span></div>
      <div className="nav-label">MENU</div>
      <button className={tab === "home" ? "nav-item active" : "nav-item"} onClick={() => setTab("home")}><Home size={18}/> Home</button>
      <button className={tab === "search" ? "nav-item active" : "nav-item"} onClick={() => setTab("search")}><Search size={18}/> Search</button>
      <button className={tab === "library" ? "nav-item active" : "nav-item"} onClick={() => setTab("library")}><Heart size={18}/> Your library</button>
      <div className="sidebar-bottom"><div className="mini-note">A lighter way to listen.</div><span>SIMPMUSIC · WEB CLIENT</span></div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div className="crumb">SimpMusic <span>/</span> {tab === "library" ? "Your library" : tab === "search" ? "Search" : "Listen now"}</div>
        <div className="top-actions"><span className="status-dot"/> Browser player · YouTube Music + Audius</div>
      </header>
      {current?.source === "youtube" && <section className="youtube-player-shell"><div className="youtube-player-heading"><span className="eyebrow">YOUTUBE PLAYER</span><strong>{current.title}</strong></div><div className="youtube-player-host" ref={youtubeHost}/></section>}
      <section className="content">
        {tab === "home" && <div className="hero">
          <div className="eyebrow">YOUR MUSIC, YOUR WAY</div>
          <h1>Find your<br/><em>next favourite.</em></h1>
          <p>Search YouTube Music first, with Audius as a fallback.</p>
          <form className="search-box" onSubmit={e => { e.preventDefault(); void search(); }}>
            <Search size={19}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Songs, artists, albums..." aria-label="Search music"/><button type="submit" disabled={busy}>Search</button>
          </form>
          <div className="hero-foot"><span><Music2 size={14}/> YouTube Music · Audius fallback · SimpMusic queue port</span><span>NO ACCOUNT REQUIRED TO EXPLORE</span></div>
        </div>}
        {tab === "search" && <div className="page-heading"><div><div className="eyebrow">DISCOVER</div><h2>Search music</h2></div><form className="search-box compact" onSubmit={e => {e.preventDefault();void search();}}><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="What do you want to hear?"/><button disabled={busy}>Search</button></form></div>}
        {tab === "library" && <div className="page-heading"><div><div className="eyebrow">COLLECTION</div><h2>Your library</h2><p>Your liked tracks, saved on this device.</p></div></div>}
        {error && <div className="error-banner">{error}<button onClick={()=>setError("")}>Dismiss</button></div>}
        {busy && <div className="loading"><LoaderCircle className="spin" size={18}/> Connecting to music source…</div>}
        {(tab !== "home" || tracks.length > 0) && <section className="track-section">
          <div className="section-title"><div><span className="eyebrow">{tab === "library" ? "SAVED ON THIS DEVICE" : "RESULTS"}</span><h3>{tab === "library" ? "Liked songs" : tracks.length ? "Tracks" : "Start exploring"}</h3></div><span className="count">{visible.length} TRACKS</span></div>
          {visible.length === 0 && !busy && <div className="empty"><ListMusic size={25}/><p>{tab === "library" ? "Your liked songs will appear here." : "Search for a song or artist to get started."}</p></div>}
          <div className="track-list">{visible.map((track, index) => <div className={"track-row " + (current?.videoId === track.videoId ? "selected" : "")} key={track.videoId}>
            <button className="cover" onClick={()=>void play(track, visible.slice(index + 1))}>{track.thumbnail ? <img src={track.thumbnail} alt=""/> : <span><Music2/></span>}<i><Play size={15} fill="currentColor"/></i></button>
            <button className="track-meta" onClick={()=>void play(track, visible.slice(index + 1))}><strong>{track.title}</strong><span>{track.artists} · {track.source === "youtube" ? "YouTube Music" : "Audius"}</span></button>
            <span className="duration">{track.duration || ""}</span>
            <button className={"like-btn " + (isLiked(track) ? "liked" : "")} aria-label="Like song" onClick={()=>toggleLike(track)}><Heart size={17} fill={isLiked(track) ? "currentColor" : "none"}/></button>
            <button className="play-btn" aria-label="Add to queue" title="Add to queue" onClick={()=>addToQueue(track)}><ListMusic size={17}/></button>
            <button className="play-btn" aria-label="Play song" onClick={()=>void play(track, visible.slice(index + 1))}><Play size={16} fill="currentColor"/></button>
          </div>)}</div>
        </section>}
        {showQueue && <section className="track-section queue-panel">
          <div className="section-title"><div><span className="eyebrow">LISTENING SESSION</span><h3>Up next</h3></div><button className="queue-close" onClick={()=>setShowQueue(false)} aria-label="Close queue"><X size={17}/></button></div>
          {queue.length === 0 ? <div className="empty">Your queue is empty.</div> : queue.map((track, index) => <div className="track-row" key={track.videoId}>
            <span className="queue-index">{index + 1}</span><button className="track-meta" onClick={()=>{const rest=queue.slice(index+1);setQueue(rest);void play(track,rest,true);}}><strong>{track.title}</strong><span>{track.artists}</span></button><button className="play-btn" onClick={()=>setQueue(old=>old.filter(item=>item.videoId!==track.videoId))} aria-label="Remove from queue"><X size={16}/></button>
          </div>)}
        </section>}
      </section>
    </main>
    <footer className="player">
      <audio ref={audio} onEnded={()=>void next()} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}
        onTimeUpdate={e=>setPosition(e.currentTarget.currentTime)} onLoadedMetadata={e=>setDuration(e.currentTarget.duration || 0)}/>
      <div className="now-playing">{current ? <>{current.thumbnail && <img src={current.thumbnail} alt=""/>}<div><strong>{current.title}</strong><span>{current.artists}</span></div></> : <div className="placeholder-art"><Music2/></div>}</div>
      <div className="controls"><div className="control-buttons">
        <button aria-label="Previous song" onClick={previous}><SkipBack size={17} fill="currentColor"/></button>
        <button className="main-play" aria-label={playing ? "Pause" : "Play"} onClick={()=>{if(current?.source === "youtube" && youtubePlayer.current){if(playing)youtubePlayer.current.pauseVideo();else youtubePlayer.current.playVideo();return;}if(!audio.current)return;if(playing)audio.current.pause();else void audio.current.play();}}>{busy ? <LoaderCircle className="spin"/> : playing ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}</button>
        <button aria-label="Next song" onClick={()=>void next()}><SkipForward size={17} fill="currentColor"/></button>
      </div><div className="progress"><span>{formatTime(position)}</span><input aria-label="Seek" type="range" min="0" max={duration || 0} step=".1" value={Math.min(position,duration || position)} onChange={e=>{const value=Number(e.target.value);if(isYoutubeTrack(current) && youtubePlayer.current)youtubePlayer.current.seekTo(value,true);else if(audio.current)audio.current.currentTime=value;}}/><span>{duration ? formatTime(duration) : "--:--"}</span></div></div>
      <div className="player-right"><button className="queue-toggle" onClick={()=>setShowQueue(value=>!value)} aria-label="Toggle queue"><ListMusic size={18}/><span>{queue.length}</span></button><Volume2 size={17}/><input aria-label="Volume" type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></div>
    </footer>
  </div>;
}
