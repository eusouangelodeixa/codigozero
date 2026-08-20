"use client";
/**
 * Vídeo da Aula — upload direto do navegador para o Cloudflare R2 (bucket
 * PRIVADO), sem passar pela memória do backend.
 *
 * Fluxo: init (abre multipart) → sign-part por parte → PUT direto no R2 →
 * complete (grava a KEY na aula). Suporta arquivos até 20 GB, com progresso,
 * velocidade, tempo restante, cancelar, trocar e remover. Duração e miniatura
 * são capturadas no cliente (um <video>+<canvas>), sem ffmpeg no servidor.
 *
 * O componente é auto-suficiente: cada ação já persiste no backend. Não depende
 * do botão "Salvar aula".
 */
import { useCallback, useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const ALLOWED_EXT = ["mp4", "mov", "mkv", "webm", "m3u8"];
const MAX_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB
const PART_CONCURRENCY = 3;

type VideoMeta = {
  hasVideo: boolean;
  storageProvider: string;
  videoKey: string | null;
  videoSize: number | null;
  videoDuration: number | null;
  videoMimeType: string | null;
  videoType: string | null;
  videoUploadedAt: string | null;
};

type Phase = "idle" | "preparing" | "uploading" | "finalizing" | "done" | "error";

function fmtBytes(n?: number | null): string {
  if (!n || n <= 0) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}
function fmtDuration(s?: number | null): string {
  if (!s || s <= 0) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
function fmtEta(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return "—";
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m > 0 ? `${m}min ${s}s` : `${s}s`;
}
function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}
function extOf(name: string): string {
  return (name.split(".").pop() || "").toLowerCase();
}

/** Captura duração e um frame (JPEG dataURL) do vídeo no próprio navegador. */
function captureDurationAndThumb(file: File): Promise<{ duration: number | null; thumb: string | null }> {
  return new Promise((resolve) => {
    // HLS/.m3u8 e formatos que o browser não decodifica: pula sem travar.
    if (extOf(file.name) === "m3u8") return resolve({ duration: null, thumb: null });
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = url;
    let done = false;
    const finish = (r: { duration: number | null; thumb: string | null }) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(r);
    };
    const timeout = setTimeout(() => finish({ duration: null, thumb: null }), 15000);
    video.onloadedmetadata = () => {
      const duration = isFinite(video.duration) ? Math.round(video.duration) : null;
      // Busca ~10% (cap 3s) pra evitar o frame preto inicial.
      const t = Math.min(3, (video.duration || 0) * 0.1);
      const grab = () => {
        try {
          const canvas = document.createElement("canvas");
          const ratio = video.videoWidth && video.videoHeight ? video.videoHeight / video.videoWidth : 9 / 16;
          canvas.width = 640;
          canvas.height = Math.round(640 * ratio);
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const thumb = canvas.toDataURL("image/jpeg", 0.82);
            clearTimeout(timeout);
            return finish({ duration, thumb });
          }
        } catch { /* frame não capturável (ex.: codec) */ }
        clearTimeout(timeout);
        finish({ duration, thumb: null });
      };
      video.onseeked = grab;
      try { video.currentTime = t; } catch { grab(); }
    };
    video.onerror = () => { clearTimeout(timeout); finish({ duration: null, thumb: null }); };
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(head)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export default function LessonVideoUploader({
  lessonId,
  onDuration,
  onThumbnail,
  apiBase = "/api/admin/members",
  uploadPath = "/api/admin/members/upload",
}: {
  lessonId: string;
  onDuration?: (seconds: number) => void;
  onThumbnail?: (url: string) => void;
  // Base das rotas de vídeo (admin ou coprodutor) e caminho do upload de mídia.
  apiBase?: string;
  uploadPath?: string;
}) {
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);
  const [speed, setSpeed] = useState(0); // bytes/s
  const [eta, setEta] = useState(0); // s
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const cancelRef = useRef<{ aborted: boolean; xhrs: Set<XMLHttpRequest>; upload?: { key: string; uploadId: string } }>(
    { aborted: false, xhrs: new Set() },
  );

  const token = () => (typeof window !== "undefined" ? localStorage.getItem("cz_token") : "") || "";
  const jsonHdr = useCallback(() => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" }), []);

  const loadMeta = useCallback(async () => {
    try {
      const r = await fetch(`${API}${apiBase}/lessons/${lessonId}/video`, { headers: { Authorization: `Bearer ${token()}` } });
      const d = await r.json();
      if (r.ok) { setMeta(d.video); setPreviewUrl(d.previewUrl || null); }
    } catch { /* silencioso — mostra estado vazio */ }
  }, [lessonId, apiBase]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  const reset = () => {
    setPhase("idle"); setPct(0); setSpeed(0); setEta(0); setFileName(""); setFileSize(0);
    cancelRef.current = { aborted: false, xhrs: new Set() };
  };

  const cancelUpload = useCallback(async () => {
    const c = cancelRef.current;
    c.aborted = true;
    for (const x of c.xhrs) { try { x.abort(); } catch { /* noop */ } }
    if (c.upload) {
      try {
        await fetch(`${API}${apiBase}/lessons/${lessonId}/video/abort`, {
          method: "POST", headers: jsonHdr(), body: JSON.stringify(c.upload),
        });
      } catch { /* noop */ }
    }
    reset();
  }, [lessonId, apiBase, jsonHdr]);

  const doUpload = useCallback(async (file: File) => {
    setError(null);
    // Validação de tipo e tamanho.
    if (!ALLOWED_EXT.includes(extOf(file.name))) {
      setError("Formato não suportado. Use MP4, MOV, MKV, WEBM ou M3U8.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      setError("Arquivo acima do limite de 20 GB.");
      return;
    }

    const c = { aborted: false, xhrs: new Set<XMLHttpRequest>(), upload: undefined as any };
    cancelRef.current = c;
    setFileName(file.name); setFileSize(file.size); setPct(0); setSpeed(0); setEta(0);
    setPhase("preparing");

    try {
      // 1) Captura duração + miniatura no cliente (não bloqueia o upload em erro).
      const { duration, thumb } = await captureDurationAndThumb(file);

      // 2) init — abre o multipart no R2.
      const initRes = await fetch(`${API}${apiBase}/lessons/${lessonId}/video/init`, {
        method: "POST", headers: jsonHdr(),
        body: JSON.stringify({ filename: file.name, size: file.size, mimeType: file.type }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || "Falha ao iniciar o upload");
      const { uploadId, key, partSize, videoType } = initData as { uploadId: string; key: string; partSize: number; videoType: string };
      c.upload = { key, uploadId };
      if (c.aborted) throw new Error("__cancel__");

      // 3) Sobe as partes (concorrência limitada), assinando cada uma.
      setPhase("uploading");
      const totalParts = Math.ceil(file.size / partSize);
      const etags: Array<{ partNumber: number; etag: string }> = [];
      const loadedByPart = new Map<number, number>();
      let lastTick = Date.now();
      let lastLoaded = 0;
      let smoothed = 0; // bytes/s suavizado

      const totalLoaded = () => { let s = 0; for (const v of loadedByPart.values()) s += v; return s; };
      const refreshProgress = () => {
        const loaded = totalLoaded();
        setPct(Math.min(99, Math.round((loaded / file.size) * 100)));
        const now = Date.now();
        const dt = (now - lastTick) / 1000;
        if (dt >= 0.6) {
          const inst = Math.max(0, (loaded - lastLoaded) / dt); // bytes/s
          smoothed = smoothed ? smoothed * 0.6 + inst * 0.4 : inst;
          setSpeed(smoothed);
          const remaining = file.size - loaded;
          setEta(smoothed > 0 ? remaining / smoothed : 0);
          lastTick = now; lastLoaded = loaded;
        }
      };

      const uploadPart = async (partNumber: number) => {
        if (c.aborted) throw new Error("__cancel__");
        const start = (partNumber - 1) * partSize;
        const blob = file.slice(start, Math.min(start + partSize, file.size));
        const signRes = await fetch(`${API}${apiBase}/lessons/${lessonId}/video/sign-part`, {
          method: "POST", headers: jsonHdr(), body: JSON.stringify({ key, uploadId, partNumber }),
        });
        const signData = await signRes.json();
        if (!signRes.ok) throw new Error(signData.error || "Falha ao assinar parte");

        const etag: string = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          c.xhrs.add(xhr);
          xhr.open("PUT", signData.url, true);
          xhr.upload.onprogress = (e) => { loadedByPart.set(partNumber, e.loaded); refreshProgress(); };
          xhr.onload = () => {
            c.xhrs.delete(xhr);
            if (xhr.status >= 200 && xhr.status < 300) {
              loadedByPart.set(partNumber, blob.size); refreshProgress();
              const et = xhr.getResponseHeader("ETag");
              if (!et) return reject(new Error("R2 não expôs o ETag — configure o CORS do bucket (ExposeHeaders: ETag)."));
              resolve(et);
            } else reject(new Error(`Falha no upload da parte ${partNumber} (HTTP ${xhr.status})`));
          };
          xhr.onerror = () => { c.xhrs.delete(xhr); reject(new Error("Erro de rede no upload da parte")); };
          xhr.onabort = () => { c.xhrs.delete(xhr); reject(new Error("__cancel__")); };
          xhr.send(blob);
        });
        etags.push({ partNumber, etag });
      };

      // Pool de concorrência.
      let next = 1;
      const worker = async () => {
        while (next <= totalParts) {
          const p = next++;
          await uploadPart(p);
        }
      };
      await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, totalParts) }, worker));
      if (c.aborted) throw new Error("__cancel__");

      // 4) Miniatura → sobe pelo pipeline público existente (webp), vira thumbnailUrl.
      setPhase("finalizing");
      let thumbnailUrl: string | null = null;
      if (thumb) {
        try {
          const fd = new FormData();
          fd.append("file", dataUrlToBlob(thumb), "thumb.jpg");
          const tr = await fetch(`${API}${uploadPath}`, {
            method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: fd,
          });
          const td = await tr.json();
          if (tr.ok) thumbnailUrl = td.url;
        } catch { /* miniatura é opcional */ }
      }

      // 5) complete — finaliza o multipart e grava a KEY na aula.
      const compRes = await fetch(`${API}${apiBase}/lessons/${lessonId}/video/complete`, {
        method: "POST", headers: jsonHdr(),
        body: JSON.stringify({ key, uploadId, parts: etags, duration, mimeType: file.type, videoType, thumbnailUrl }),
      });
      const compData = await compRes.json();
      if (!compRes.ok) throw new Error(compData.error || "Falha ao finalizar o vídeo");

      setPct(100);
      setPhase("done");
      setMeta(compData.video);
      if (duration && onDuration) onDuration(duration);
      if (thumbnailUrl && onThumbnail) onThumbnail(thumbnailUrl);
      await loadMeta();
      setTimeout(() => setPhase("idle"), 1200);
    } catch (e: any) {
      if (e?.message === "__cancel__" || cancelRef.current.aborted) { reset(); return; }
      setError(e?.message || "Falha no upload");
      setPhase("error");
      // Best-effort: aborta o multipart pendente pra não deixar partes órfãs.
      if (c.upload) {
        try {
          await fetch(`${API}${apiBase}/lessons/${lessonId}/video/abort`, {
            method: "POST", headers: jsonHdr(), body: JSON.stringify(c.upload),
          });
        } catch { /* noop */ }
      }
    }
  }, [lessonId, apiBase, uploadPath, jsonHdr, loadMeta, onDuration, onThumbnail]);

  const removeVideo = useCallback(async () => {
    if (!confirm("Remover o vídeo desta aula? O arquivo será apagado do R2.")) return;
    try {
      const r = await fetch(`${API}${apiBase}/lessons/${lessonId}/video`, { method: "DELETE", headers: jsonHdr() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMeta(d.video); setPreviewUrl(null); reset();
    } catch (e: any) {
      setError(e?.message || "Falha ao remover");
    }
  }, [lessonId, apiBase, jsonHdr]);

  const busy = phase === "preparing" || phase === "uploading" || phase === "finalizing";
  const onPick = (f?: File | null) => { if (f && !busy) doUpload(f); };

  // ── Estilos (tokens do tema) ──────────────────────────────────────────────
  const card: React.CSSProperties = {
    border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)",
    background: "var(--bg-elevated)", padding: "var(--space-4)",
  };
  const badge = (bg: string, fg: string): React.CSSProperties => ({
    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: bg, color: fg,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {/* Vídeo já hospedado no R2 */}
      {meta?.hasVideo && !busy && phase !== "error" && (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={badge("var(--accent-dim)", "var(--accent)")}>R2 · {meta.videoType?.toUpperCase() || "MP4"}</span>
              <span style={badge("rgba(34,197,94,0.15)", "var(--color-success)")}>✓ Pronto</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ fontSize: 13, color: "var(--accent)", cursor: "pointer", fontWeight: 600 }}>
                Trocar
                <input type="file" accept="video/*,.mkv,.m3u8" style={{ display: "none" }} onChange={(e) => onPick(e.target.files?.[0])} />
              </label>
              <button type="button" onClick={removeVideo} style={{ fontSize: 13, color: "#f87171", fontWeight: 600 }}>Remover</button>
            </div>
          </div>
          {previewUrl && meta.videoType !== "hls" && (
            <video src={previewUrl} controls preload="metadata" style={{ width: "100%", maxHeight: 220, borderRadius: "var(--radius-md)", background: "#000", marginBottom: 10 }} />
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, fontSize: 12.5 }}>
            <Meta label="Peso" value={fmtBytes(meta.videoSize)} />
            <Meta label="Duração" value={fmtDuration(meta.videoDuration)} />
            <Meta label="Formato" value={meta.videoMimeType || meta.videoType || "—"} />
            <Meta label="Enviado" value={fmtDate(meta.videoUploadedAt)} />
          </div>
        </div>
      )}

      {/* Zona de drop / progresso */}
      {(!meta?.hasVideo || busy || phase === "error") && (
        <div
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); onPick(e.dataTransfer.files?.[0]); }}
          style={{
            ...card,
            borderStyle: "dashed",
            borderColor: dragOver ? "var(--accent)" : "var(--border-strong)",
            background: dragOver ? "var(--accent-dim)" : "var(--bg-elevated)",
            textAlign: "center",
            transition: "all .15s",
          }}
        >
          {!busy ? (
            <>
              <div style={{ fontSize: 30, marginBottom: 6 }}>🎬</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Arraste o vídeo aqui</div>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 12 }}>
                MP4, MOV, MKV, WEBM ou M3U8 · até 20 GB · enviado direto e privado
              </div>
              <label style={{
                display: "inline-block", padding: "8px 18px", borderRadius: "var(--radius-md)",
                background: "var(--accent)", color: "var(--accent-fg)", fontWeight: 600, cursor: "pointer", fontSize: 13.5,
              }}>
                Selecionar vídeo
                <input type="file" accept="video/*,.mkv,.m3u8" style={{ display: "none" }} onChange={(e) => onPick(e.target.files?.[0])} />
              </label>
            </>
          ) : (
            <div style={{ textAlign: "left" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, fontSize: 13.5 }}>{fileName}</div>
                <button type="button" onClick={cancelUpload} style={{ fontSize: 12.5, color: "#f87171", fontWeight: 600, flexShrink: 0 }}>Cancelar</button>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: "var(--bg-base)", overflow: "hidden", marginBottom: 8 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)", transition: "width .2s" }} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                  {phase === "preparing" ? "Preparando…" : phase === "finalizing" ? "Finalizando…" : `${pct}%`}
                </span>
                <span>{fmtBytes(fileSize * (pct / 100))} / {fmtBytes(fileSize)}</span>
                {phase === "uploading" && speed > 0 && <span>{fmtBytes(speed)}/s</span>}
                {phase === "uploading" && eta > 0 && <span>~{fmtEta(eta)} restantes</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12.5, color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: "var(--radius-md)", padding: "8px 12px" }}>
          {error}
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{value}</div>
    </div>
  );
}
