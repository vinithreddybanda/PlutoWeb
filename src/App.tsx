import { useEffect, useRef, useState } from "react";
import { Disc3, Heart, Home, ListMusic, LoaderCircle, Music2, Pause, Play, Search, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { musicApi } from "./ytmusic";
import type { Track } from "./types";

const savedKey = "plutoweb-liked";
const readSaved = (): Track[] => { try { return JSON.parse(localStorage.getItem(savedKey) || "[]"); } catch { return []; } };
const demo: Track[] = [];

export default function App() {
  const audio = useRef<HTMLAudioElement>(null);
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>(demo);
  const [queue, setQueue] = useState<Track[]>([]);
  const [current, setCurrent] = useState<Track | null>(null);
  const [liked, setLiked] = useState<Track[]>(readSaved);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"home" | "search" | "library">("home");
  const [volume, setVolume] = useState(0.8);

  useEffect(() => { localStorage.setItem(savedKey, JSON.stringify(liked)); }, [liked]);
  useEffect(() => { if (audio.current) audio.current.volume = volume; }, [volume]);

  async function play(track: Track, upcoming?: Track[]) {
    setCurrent(track);
    setPlaying(false);
    setBusy(true);
    setError("");
    if (upcoming) setQueue(upcoming);
    try {
      const url = await musicApi.stream(track.videoId);
      if (!audio.current) return;
      audio.current.src = url;
      await audio.current.play();
      setPlaying(true);
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artists, album: track.album || "SimpMusic", artwork: track.thumbnail ? [{ src: track.thumbnail }] : [] });
        navigator.mediaSession.setActionHandler("play", () => audio.current?.play());
        navigator.mediaSession.setActionHandler("pause", () => audio.current?.pause());
        navigator.mediaSession.setActionHandler("nexttrack", () => next());
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Playback failed."); }
    finally { setBusy(false); }
  }

  async function search() {
    if (!query.trim()) return;
    setTab("search"); setBusy(true); setError("");
    try { const result = await musicApi.search(query.trim()); setTracks(result.tracks); }
    catch (e) { setError(e instanceof Error ? e.message : "Search failed."); setTracks([]); }
    finally { setBusy(false); }
  }

  async function next() {
    if (queue.length) {
      const [head, ...rest] = queue;
      setQueue(rest);
      void play(head, rest);
      return;
    }
    if (!current) return;
    setBusy(true);
    try {
      const recommendations = await musicApi.next(current.videoId, current.playlistId);
      const candidates = recommendations.filter(t => t.videoId !== current.videoId);
      if (candidates[0]) void play(candidates[0], candidates.slice(1));
      else setError("No next recommendations were returned.");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't load next songs."); }
    finally { setBusy(false); }
  }

  function toggleLike(track: Track) {
    setLiked(old => old.some(t => t.videoId === track.videoId) ? old.filter(t => t.videoId !== track.videoId) : [track, ...old]);
  }
  const isLiked = (track: Track) => liked.some(t => t.videoId === track.videoId);
  const visible = tab === "library" ? liked : tracks;

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
        <div className="top-actions"><span className="status-dot"/> Browser player</div>
      </header>

      <section className="content">
        {tab === "home" && <div className="hero">
          <div className="eyebrow">YOUR MUSIC, YOUR WAY</div>
          <h1>Find your<br/><em>next favourite.</em></h1>
          <p>Search across YouTube Music and let the music keep moving.</p>
          <form className="search-box" onSubmit={e => { e.preventDefault(); void search(); }}>
            <Search size={19}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Songs, artists, albums..." aria-label="Search music"/><button type="submit" disabled={busy}>Search</button>
          </form>
          <div className="hero-foot"><span><Music2 size={14}/> Powered by SimpMusic sources</span><span>NO ACCOUNT REQUIRED TO EXPLORE</span></div>
        </div>}

        {tab === "search" && <div className="page-heading"><div><div className="eyebrow">DISCOVER</div><h2>Search music</h2></div><form className="search-box compact" onSubmit={e => {e.preventDefault();void search();}}><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="What do you want to hear?"/><button>Search</button></form></div>}
        {tab === "library" && <div className="page-heading"><div><div className="eyebrow">COLLECTION</div><h2>Your library</h2><p>Your liked tracks, saved on this device.</p></div></div>}

        {error && <div className="error-banner">{error}<button onClick={()=>setError("")}>Dismiss</button></div>}
        {busy && <div className="loading"><LoaderCircle className="spin" size={18}/> Connecting to music source…</div>}

        {(tab !== "home" || tracks.length > 0) && <section className="track-section">
          <div className="section-title"><div><span className="eyebrow">{tab === "library" ? "SAVED ON THIS DEVICE" : "RESULTS"}</span><h3>{tab === "library" ? "Liked songs" : tracks.length ? "Tracks" : "Start exploring"}</h3></div><span className="count">{visible.length} TRACKS</span></div>
          {visible.length === 0 && !busy && <div className="empty"><ListMusic size={25}/><p>{tab === "library" ? "Your liked songs will appear here." : "Search for a song or artist to get started."}</p></div>}
          <div className="track-list">{visible.map((track, index) => <div className={"track-row " + (current?.videoId === track.videoId ? "selected" : "")} key={track.videoId}>
            <button className="cover" onClick={()=>void play(track, visible.slice(index + 1))}>{track.thumbnail ? <img src={track.thumbnail} alt=""/> : <span><Music2/></span>}<i><Play size={15} fill="currentColor"/></i></button>
            <button className="track-meta" onClick={()=>void play(track, visible.slice(index + 1))}><strong>{track.title}</strong><span>{track.artists}</span></button>
            <span className="duration">{track.duration || ""}</span>
            <button className={"like-btn " + (isLiked(track) ? "liked" : "")} aria-label="Like song" onClick={()=>toggleLike(track)}><Heart size={17} fill={isLiked(track) ? "currentColor" : "none"}/></button>
            <button className="play-btn" aria-label="Play song" onClick={()=>void play(track, visible.slice(index + 1))}><Play size={16} fill="currentColor"/></button>
          </div>)}</div>
        </section>}
      </section>
    </main>

    <footer className="player">
      <audio ref={audio} onEnded={()=>void next()} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}/>
      <div className="now-playing">{current ? <>{current.thumbnail && <img src={current.thumbnail} alt=""/>}<div><strong>{current.title}</strong><span>{current.artists}</span></div></> : <div className="placeholder-art"><Music2/></div>}</div>
      <div className="controls"><div className="control-buttons"><button aria-label="Previous song" onClick={()=>{}}><SkipBack size={17} fill="currentColor"/></button><button className="main-play" aria-label={playing ? "Pause" : "Play"} onClick={()=>{if(!audio.current)return; if(playing)audio.current.pause();else void audio.current.play();}}>{busy ? <LoaderCircle className="spin"/> : playing ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}</button><button aria-label="Next song" onClick={()=>void next()}><SkipForward size={17} fill="currentColor"/></button></div><div className="progress"><span>{current ? "PLAYING" : "READY WHEN YOU ARE"}</span><div className="progress-line"><i/></div><span>{queue.length ? queue.length + " UP NEXT" : "SIMPMUSIC"}</span></div></div>
      <div className="player-right"><ListMusic size={17}/><Volume2 size={17}/><input aria-label="Volume" type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></div>
    </footer>
  </div>;
}