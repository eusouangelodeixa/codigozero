"use client";
/**
 * Player de vídeo da área de membros.
 *
 *  • storageProvider = 'r2'  → pede a URL ASSINADA temporária (5 min) em
 *    GET /api/members/video/:id e RENOVA sozinho antes de expirar, sem recarregar
 *    a página (preserva o ponto e o play). MP4 nativo; HLS via hls.js (cada
 *    segmento volta pelo proxy autenticado do backend).
 *  • senão → embed legado (iframe do Kilax/YouTube/Vimeo), como antes.
 *
 * A KEY do arquivo e o endpoint do R2 NUNCA chegam ao cliente — só a URL
 * temporária. O bucket é privado.
 */
import { useEffect, useRef, useState } from "react";
import { membersFetch, membersToken } from "@/lib/members/api";
import k from "@/components/members/kit.module.css";

type VideoResponse = {
  type: "mp4" | "hls" | "embed";
  url: string | null;
  embed?: string | null;
  expiresAt?: string;
  expiresIn?: number;
  mimeType?: string;
};

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
  const isR2 = storageProvider === "r2";

  // ── Caminho legado (embed) ────────────────────────────────────────────────
  if (!isR2) {
    return embedHtml ? (
      <div style={{ position: "absolute", inset: 0 }} dangerouslySetInnerHTML={{ __html: embedHtml }} />
    ) : (
      <div className={k.videoEmpty}>Vídeo em breve</div>
    );
  }
  return <R2Player lessonId={lessonId} poster={poster} />;
}

function R2Player({ lessonId, poster }: { lessonId: string; poster?: string | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const renewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<any>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    let alive = true;

    const clearRenew = () => { if (renewTimer.current) { clearTimeout(renewTimer.current); renewTimer.current = null; } };

    const fetchUrl = () => membersFetch<VideoResponse>(`/api/members/video/${encodeURIComponent(lessonId)}`);

    /** Reagenda a renovação da URL assinada ~45s antes de expirar. */
    const scheduleRenew = (expiresAt?: string) => {
      clearRenew();
      if (!expiresAt) return;
      const ms = new Date(expiresAt).getTime() - Date.now() - 45_000;
      renewTimer.current = setTimeout(renewMp4, Math.max(15_000, ms));
    };

    /** Renova a URL do MP4 preservando ponto e estado de reprodução. */
    const renewMp4 = async () => {
      const v = videoRef.current;
      if (!v || !alive) return;
      try {
        const data = await fetchUrl();
        if (!alive || data.type !== "mp4" || !data.url) return;
        const t = v.currentTime;
        const wasPlaying = !v.paused && !v.ended;
        const restore = () => {
          try { v.currentTime = t; } catch { /* noop */ }
          if (wasPlaying) v.play().catch(() => {});
          v.removeEventListener("loadedmetadata", restore);
        };
        v.addEventListener("loadedmetadata", restore);
        v.src = data.url;
        v.load();
        scheduleRenew(data.expiresAt);
      } catch {
        // Deixa o handler de 'error' tentar de novo se o playback quebrar.
      }
    };

    const setupHls = async (masterUrl: string) => {
      const v = videoRef.current;
      if (!v) return;
      const mod = await import("hls.js");
      const Hls = mod.default;
      const token = membersToken();
      if (Hls.isSupported()) {
        const hls = new Hls({
          // Cada requisição de playlist/segmento leva o Bearer — o proxy do
          // backend re-verifica o acesso e faz stream do objeto privado.
          xhrSetup: (xhr: XMLHttpRequest) => {
            if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          },
        });
        hlsRef.current = hls;
        hls.loadSource(masterUrl);
        hls.attachMedia(v);
        hls.on(Hls.Events.ERROR, (_e: any, data: any) => {
          if (data?.fatal) { setState("error"); setErrMsg("Falha ao carregar o vídeo (HLS)."); }
        });
      } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari/iOS: HLS nativo. (Requer que o proxy aceite a sessão — HLS é
        // caminho arquitetural; o MP4 é o fluxo principal hoje.)
        v.src = masterUrl;
      } else {
        setState("error");
        setErrMsg("Seu navegador não suporta este formato de vídeo.");
      }
    };

    (async () => {
      try {
        const data = await fetchUrl();
        if (!alive) return;
        if (data.type === "mp4" && data.url) {
          const v = videoRef.current;
          if (v) { v.src = data.url; }
          scheduleRenew(data.expiresAt);
          setState("ready");
        } else if (data.type === "hls" && data.url) {
          await setupHls(data.url);
          setState("ready");
        } else if (data.type === "embed") {
          // Aula voltou a ser embed no meio da sessão — sem URL R2.
          setState("error");
          setErrMsg("Vídeo indisponível.");
        } else {
          setState("error");
          setErrMsg("Vídeo indisponível.");
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

  // Se o MP4 quebrar por URL expirada (ex.: aba dormiu), renova ao dar erro.
  const onVideoError = () => {
    const v = videoRef.current;
    if (!v) return;
    // Só tenta recuperar se já tínhamos algo tocando.
    if (state === "ready" && v.currentTime > 0) {
      membersFetch<VideoResponse>(`/api/members/video/${encodeURIComponent(lessonId)}`)
        .then((data) => {
          if (data.type === "mp4" && data.url && videoRef.current) {
            const t = v.currentTime;
            const resume = () => { try { v.currentTime = t; } catch { /* noop */ } v.play().catch(() => {}); v.removeEventListener("loadedmetadata", resume); };
            v.addEventListener("loadedmetadata", resume);
            v.src = data.url; v.load();
          }
        })
        .catch(() => {});
    }
  };

  return (
    <>
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        poster={poster || undefined}
        onError={onVideoError}
        controlsList="nodownload"
        onContextMenu={(e) => e.preventDefault()}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "#000", objectFit: "contain" }}
      />
      {state === "loading" && <div className={k.videoEmpty}>Carregando vídeo…</div>}
      {state === "error" && <div className={k.videoEmpty}>{errMsg || "Vídeo indisponível"}</div>}
    </>
  );
}
