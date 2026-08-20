"use client";
/**
 * Player de vídeo da área de membros — skin própria (tema Código Zero) com
 * play/pause, barra de progresso com buffer, tempo, volume, VELOCIDADE
 * (0.5–2x), retomar de onde parou, Picture-in-Picture, tela cheia e atalhos de
 * teclado. Menu de QUALIDADE aparece quando o vídeo é HLS multi-bitrate.
 *
 *  • storageProvider = 'r2' → pede a URL ASSINADA temporária (5 min) e a renova
 *    sozinho antes de expirar, sem recarregar (preserva o ponto). MP4 nativo;
 *    HLS via hls.js (segmentos passam pelo proxy autenticado do backend).
 *  • senão → embed legado (iframe do Kilax/YouTube/Vimeo).
 *
 * A KEY e o endpoint do R2 nunca chegam ao cliente — só a URL temporária.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play, Pause, Volume2, Volume1, VolumeX, Maximize, Minimize,
  Gauge, PictureInPicture2, Check, SlidersHorizontal,
} from "lucide-react";
import { membersFetch, membersToken } from "@/lib/members/api";
import k from "@/components/members/kit.module.css";
import s from "@/components/members/VideoPlayer.module.css";

type VideoResponse = {
  type: "mp4" | "hls" | "embed";
  url: string | null;
  embed?: string | null;
  expiresAt?: string;
  expiresIn?: number;
  mimeType?: string;
};

type QualityLevel = { id: number; label: string; height: number };

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s2 = Math.floor(sec % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? h + ":" : ""}${mm}:${String(s2).padStart(2, "0")}`;
}

export default function MembersVideoPlayer({
  lessonId,
  storageProvider,
  embedHtml,
  poster,
}: {
  lessonId: string;
  storageProvider?: string | null;
  embedHtml: string;
  poster?: string | null;
}) {
  if (storageProvider !== "r2") {
    return embedHtml ? (
      <div style={{ position: "absolute", inset: 0 }} dangerouslySetInnerHTML={{ __html: embedHtml }} />
    ) : (
      <div className={k.videoEmpty}>Vídeo em breve</div>
    );
  }
  return <R2Player lessonId={lessonId} poster={poster} />;
}

function R2Player({ lessonId, poster }: { lessonId: string; poster?: string | null }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const renewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<any>(null);
  const posKey = `cz_vpos_${lessonId}`;

  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

  // Estado da UI de controles.
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [barVisible, setBarVisible] = useState(true);
  const [fs, setFs] = useState(false);
  const [menu, setMenu] = useState<"none" | "speed" | "quality">("none");
  const [hovered, setHovered] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [level, setLevel] = useState<number>(-1); // -1 = auto

  // ── Carregamento da fonte (URL assinada / HLS) + auto-renovação ────────────
  useEffect(() => {
    let alive = true;
    const clearRenew = () => { if (renewTimer.current) { clearTimeout(renewTimer.current); renewTimer.current = null; } };
    const fetchUrl = () => membersFetch<VideoResponse>(`/api/members/video/${encodeURIComponent(lessonId)}`);

    const scheduleRenew = (expiresAt?: string) => {
      clearRenew();
      if (!expiresAt) return;
      const ms = new Date(expiresAt).getTime() - Date.now() - 45_000;
      renewTimer.current = setTimeout(renewMp4, Math.max(15_000, ms));
    };
    const renewMp4 = async () => {
      const v = videoRef.current;
      if (!v || !alive) return;
      try {
        const data = await fetchUrl();
        if (!alive || data.type !== "mp4" || !data.url) return;
        const t = v.currentTime, wasPlaying = !v.paused && !v.ended;
        const restore = () => {
          try { v.currentTime = t; } catch { /* noop */ }
          if (wasPlaying) v.play().catch(() => {});
          v.removeEventListener("loadedmetadata", restore);
        };
        v.addEventListener("loadedmetadata", restore);
        v.src = data.url; v.load();
        scheduleRenew(data.expiresAt);
      } catch { /* handler de erro tenta de novo */ }
    };

    const setupHls = async (masterUrl: string) => {
      const v = videoRef.current;
      if (!v) return;
      const mod = await import("hls.js");
      const Hls = mod.default;
      const token = membersToken();
      if (Hls.isSupported()) {
        const hls = new Hls({
          xhrSetup: (xhr: XMLHttpRequest) => { if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`); },
        });
        hlsRef.current = hls;
        hls.loadSource(masterUrl);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, (_e: any, data: any) => {
          const lv: QualityLevel[] = (data.levels || []).map((l: any, i: number) => ({
            id: i, height: l.height || 0, label: l.height ? `${l.height}p` : `Faixa ${i + 1}`,
          }));
          setLevels(lv);
          setLevel(-1);
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, (_e: any, data: any) => {
          setLevel(hls.autoLevelEnabled ? -1 : data.level);
        });
        hls.on(Hls.Events.ERROR, (_e: any, data: any) => {
          if (data?.fatal) { setState("error"); setErrMsg("Falha ao carregar o vídeo (HLS)."); }
        });
      } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = masterUrl;
      } else {
        setState("error"); setErrMsg("Seu navegador não suporta este formato de vídeo.");
      }
    };

    (async () => {
      try {
        const data = await fetchUrl();
        if (!alive) return;
        if (data.type === "mp4" && data.url) {
          const v = videoRef.current;
          if (v) v.src = data.url;
          scheduleRenew(data.expiresAt);
          setState("ready");
        } else if (data.type === "hls" && data.url) {
          await setupHls(data.url);
          setState("ready");
        } else {
          setState("error"); setErrMsg("Vídeo indisponível.");
        }
      } catch (e: any) {
        if (alive) { setState("error"); setErrMsg(e?.message || "Erro ao carregar o vídeo."); }
      }
    })();

    return () => {
      alive = false;
      clearRenew();
      if (hlsRef.current) { try { hlsRef.current.destroy(); } catch { /* noop */ } hlsRef.current = null; }
    };
  }, [lessonId]);

  // ── Liga os eventos do elemento <video> ao estado da UI ────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      setCur(v.currentTime);
      // Salva a posição a cada ~5s (retomar de onde parou).
      if (v.duration && Math.floor(v.currentTime) % 5 === 0) {
        try { localStorage.setItem(posKey, String(Math.floor(v.currentTime))); } catch { /* noop */ }
      }
    };
    const onDur = () => setDur(v.duration || 0);
    const onProg = () => { try { if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1)); } catch { /* noop */ } };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onWaiting = () => setWaiting(true);
    const onPlaying = () => setWaiting(false);
    const onVol = () => { setVolume(v.volume); setMuted(v.muted); };
    const onRate = () => setRate(v.playbackRate);
    const onEnded = () => { setPlaying(false); try { localStorage.removeItem(posKey); } catch { /* noop */ } };
    // Recuperação: se o MP4 quebrar (ex.: URL assinada expirou com a aba dormindo),
    // busca uma URL nova e retoma do ponto. Só pro MP4 (HLS se recupera sozinho).
    const onError = () => {
      if (hlsRef.current || v.currentTime <= 0) return;
      const t = v.currentTime, wasPlaying = !v.paused;
      membersFetch<VideoResponse>(`/api/members/video/${encodeURIComponent(lessonId)}`)
        .then((data) => {
          if (data.type !== "mp4" || !data.url) return;
          const resume = () => { try { v.currentTime = t; } catch { /* noop */ } if (wasPlaying) v.play().catch(() => {}); v.removeEventListener("loadedmetadata", resume); };
          v.addEventListener("loadedmetadata", resume);
          v.src = data.url; v.load();
        })
        .catch(() => {});
    };
    const onLoaded = () => {
      setDur(v.duration || 0);
      // Retoma se havia posição salva (entre 5s e faltando >10s do fim).
      try {
        const saved = Number(localStorage.getItem(posKey) || 0);
        if (saved > 5 && v.duration && saved < v.duration - 10 && v.currentTime < 1) v.currentTime = saved;
      } catch { /* noop */ }
    };

    v.addEventListener("timeupdate", onTime);
    v.addEventListener("durationchange", onDur);
    v.addEventListener("progress", onProg);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("volumechange", onVol);
    v.addEventListener("ratechange", onRate);
    v.addEventListener("ended", onEnded);
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("error", onError);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("durationchange", onDur);
      v.removeEventListener("progress", onProg);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("volumechange", onVol);
      v.removeEventListener("ratechange", onRate);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("error", onError);
    };
  }, [posKey, state, lessonId]);

  // Fullscreen change.
  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Auto-esconder a barra quando tocando e sem interação.
  const kickHide = useCallback(() => {
    setBarVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && menu === "none") setBarVisible(false);
    }, 2600);
  }, [menu]);

  // ── Ações ──────────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  }, []);
  const seekTo = (t: number) => { const v = videoRef.current; if (v && isFinite(t)) v.currentTime = Math.max(0, Math.min(t, v.duration || t)); };
  const skip = (d: number) => { const v = videoRef.current; if (v) seekTo(v.currentTime + d); };
  const setVol = (val: number) => { const v = videoRef.current; if (!v) return; v.muted = false; v.volume = Math.max(0, Math.min(1, val)); };
  const toggleMute = () => { const v = videoRef.current; if (v) v.muted = !v.muted; };
  const changeRate = (r: number) => { const v = videoRef.current; if (v) v.playbackRate = r; setMenu("none"); };
  const changeLevel = (id: number) => {
    const hls = hlsRef.current;
    if (hls) { hls.currentLevel = id; setLevel(id === -1 ? -1 : id); }
    setMenu("none");
  };
  const togglePip = async () => {
    const v = videoRef.current; if (!v) return;
    try {
      if ((document as any).pictureInPictureElement) await (document as any).exitPictureInPicture();
      else if ((v as any).requestPictureInPicture) await (v as any).requestPictureInPicture();
    } catch { /* noop */ }
  };
  const toggleFs = async () => {
    const w = wrapRef.current, v = videoRef.current;
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return; }
      if (w?.requestFullscreen) await w.requestFullscreen();
      else if ((v as any)?.webkitEnterFullscreen) (v as any).webkitEnterFullscreen(); // iOS
    } catch { /* noop */ }
  };

  // Seek por ponteiro (clique + arraste) na barra.
  const seekFromEvent = (clientX: number, el: HTMLDivElement) => {
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return pct * (dur || 0);
  };
  const onSeekDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    setSeeking(true);
    seekTo(seekFromEvent(e.clientX, el));
  };
  const onSeekMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const t = seekFromEvent(e.clientX, el);
    const rect = el.getBoundingClientRect();
    setHover({ x: e.clientX - rect.left, t });
    if (seeking) seekTo(t);
  };
  const onSeekUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    setSeeking(false);
  };

  // Atalhos de teclado (quando o mouse está sobre o player ou em tela cheia).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!hovered && !document.fullscreenElement) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      switch (e.key) {
        case " ": case "k": e.preventDefault(); togglePlay(); break;
        case "ArrowLeft": e.preventDefault(); skip(-10); break;
        case "ArrowRight": e.preventDefault(); skip(10); break;
        case "ArrowUp": e.preventDefault(); setVol((videoRef.current?.volume ?? 1) + 0.1); break;
        case "ArrowDown": e.preventDefault(); setVol((videoRef.current?.volume ?? 1) - 0.1); break;
        case "f": e.preventDefault(); toggleFs(); break;
        case "m": e.preventDefault(); toggleMute(); break;
        default:
          if (/^[0-9]$/.test(e.key)) { e.preventDefault(); seekTo((Number(e.key) / 10) * (dur || 0)); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered, dur, togglePlay]);

  const playedPct = dur ? (cur / dur) * 100 : 0;
  const bufPct = dur ? (buffered / dur) * 100 : 0;
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={wrapRef}
      className={s.wrap}
      onMouseEnter={() => { setHovered(true); kickHide(); }}
      onMouseLeave={() => { setHovered(false); if (playing && menu === "none") setBarVisible(false); }}
      onMouseMove={kickHide}
      onTouchStart={kickHide}
    >
      <video
        ref={videoRef}
        playsInline
        preload="metadata"
        poster={poster || undefined}
        controlsList="nodownload"
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Camada de gestos: clique alterna play/pause; duplo-clique = tela cheia. */}
      {state === "ready" && (
        <div className={s.gestures} onClick={togglePlay} onDoubleClick={toggleFs} />
      )}

      {/* Botão central quando pausado. */}
      {state === "ready" && !playing && !waiting && (
        <div className={s.center}>
          <button type="button" className={s.centerBtn} onClick={togglePlay} aria-label="Reproduzir">
            <Play size={30} fill="#fff" style={{ marginLeft: 3 }} />
          </button>
        </div>
      )}

      {/* Spinner de buffering. */}
      {(state === "loading" || waiting) && (
        <div className={s.spinner}><div className={s.spinnerRing} /></div>
      )}

      {state === "error" && <div className={k.videoEmpty}>{errMsg || "Vídeo indisponível"}</div>}

      {/* Barra de controles. */}
      {state === "ready" && (
        <div className={`${s.bar} ${barVisible || !playing ? "" : s.hidden}`} onClick={(e) => e.stopPropagation()}>
          {/* Seek */}
          <div
            className={`${s.seek} ${seeking ? s.seeking : ""}`}
            onPointerDown={onSeekDown}
            onPointerMove={onSeekMove}
            onPointerUp={onSeekUp}
            onPointerLeave={() => setHover(null)}
          >
            <div className={s.seekTrack}>
              <div className={s.seekBuffered} style={{ width: `${bufPct}%` }} />
              <div className={s.seekPlayed} style={{ width: `${playedPct}%` }} />
              <div className={s.seekThumb} style={{ left: `${playedPct}%` }} />
            </div>
            {hover && <div className={s.seekHover} style={{ left: hover.x }}>{fmtTime(hover.t)}</div>}
          </div>

          {/* Linha de botões */}
          <div className={s.row}>
            <button type="button" className={s.btn} onClick={togglePlay} aria-label={playing ? "Pausar" : "Reproduzir"}>
              {playing ? <Pause size={20} fill="#fff" /> : <Play size={20} fill="#fff" />}
            </button>

            <div className={s.volume}>
              <button type="button" className={s.btn} onClick={toggleMute} aria-label="Volume">
                <VolIcon size={20} />
              </button>
              <div className={s.volumeSlider}>
                <div
                  className={s.volTrack}
                  onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const r = e.currentTarget.getBoundingClientRect(); setVol((e.clientX - r.left) / r.width); }}
                  onPointerMove={(e) => { if (e.buttons === 1) { const r = e.currentTarget.getBoundingClientRect(); setVol((e.clientX - r.left) / r.width); } }}
                >
                  <div className={s.volFill} style={{ width: `${(muted ? 0 : volume) * 100}%` }} />
                </div>
              </div>
            </div>

            <span className={s.time}>{fmtTime(cur)} / {fmtTime(dur)}</span>

            <div className={s.spacer} />

            {/* Qualidade (só quando HLS tem níveis) */}
            {levels.length > 1 && (
              <div className={s.menuWrap}>
                <button type="button" className={s.btn} onClick={() => setMenu(menu === "quality" ? "none" : "quality")} aria-label="Qualidade">
                  <SlidersHorizontal size={19} />
                </button>
                {menu === "quality" && (
                  <div className={s.menu}>
                    <div className={s.menuLabel}>Qualidade</div>
                    <button type="button" className={`${s.menuItem} ${level === -1 ? s.menuItemActive : ""}`} onClick={() => changeLevel(-1)}>
                      <span>Auto</span>{level === -1 && <Check size={15} className={s.check} />}
                    </button>
                    {levels.slice().sort((a, b) => b.height - a.height).map((l) => (
                      <button key={l.id} type="button" className={`${s.menuItem} ${level === l.id ? s.menuItemActive : ""}`} onClick={() => changeLevel(l.id)}>
                        <span>{l.label}</span>{level === l.id && <Check size={15} className={s.check} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Velocidade */}
            <div className={s.menuWrap}>
              <button type="button" className={s.btn} onClick={() => setMenu(menu === "speed" ? "none" : "speed")} aria-label="Velocidade">
                {rate === 1 ? <Gauge size={20} /> : <span className={s.speedBadge}>{rate}x</span>}
              </button>
              {menu === "speed" && (
                <div className={s.menu}>
                  <div className={s.menuLabel}>Velocidade</div>
                  {SPEEDS.map((r) => (
                    <button key={r} type="button" className={`${s.menuItem} ${rate === r ? s.menuItemActive : ""}`} onClick={() => changeRate(r)}>
                      <span>{r === 1 ? "Normal" : `${r}x`}</span>{rate === r && <Check size={15} className={s.check} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* PiP */}
            <button type="button" className={s.btn} onClick={togglePip} aria-label="Picture in picture">
              <PictureInPicture2 size={19} />
            </button>

            {/* Fullscreen */}
            <button type="button" className={s.btn} onClick={toggleFs} aria-label="Tela cheia">
              {fs ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
