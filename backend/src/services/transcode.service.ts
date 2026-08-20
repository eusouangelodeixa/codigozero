/**
 * Transcodificação MP4 → HLS multi-bitrate (ffmpeg) para o seletor de qualidade.
 *
 * Fila SIMPLES e SEGURA para a VPS compartilhada:
 *   • UM job por vez (workerRunning), reivindicação atômica no banco.
 *   • ffmpeg com prioridade baixa (`nice -n 19`) e poucas threads (-threads 2).
 *   • ffmpeg lê o MP4 DIRETO do R2 por URL assinada (não baixa 20 GB pro disco);
 *     só a saída HLS (menor) passa pelo disco temporário, e é limpa no fim.
 *   • Sem upscale: a escada de qualidade é filtrada pela altura da fonte.
 *
 * O MP4 continua tocando na hora; quando o HLS fica pronto, `videoType` vira
 * 'hls' e o player passa a oferecer 1080/720/480 (ver components/members/VideoPlayer).
 */
import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import * as r2 from './r2.service';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

// Escada de qualidade (filtrada por altura da fonte — nunca faz upscale).
const LADDER = [
  { h: 1080, vb: '5000k', maxrate: '5350k', bufsize: '7500k', ab: '128k' },
  { h: 720, vb: '2800k', maxrate: '2996k', bufsize: '4200k', ab: '128k' },
  { h: 480, vb: '1400k', maxrate: '1498k', bufsize: '2100k', ab: '96k' },
  { h: 360, vb: '800k', maxrate: '856k', bufsize: '1200k', ab: '96k' },
];

let workerRunning = false;
let safetyInterval: ReturnType<typeof setInterval> | null = null;

function enabled(): boolean {
  return process.env.TRANSCODE_DISABLED !== '1' && r2.isR2Configured();
}

/** Marca a aula como pendente de transcodificação e acorda o worker. */
export async function enqueueTranscode(lessonId: string): Promise<void> {
  if (!enabled()) return;
  await prisma.lesson.update({ where: { id: lessonId }, data: { transcodeStatus: 'pending', transcodeError: null } }).catch(() => {});
  kickWorker();
}

/** Acorda o worker (no-op se já rodando). */
export function kickWorker(): void {
  if (workerRunning || !enabled()) return;
  workerRunning = true;
  runLoop()
    .catch((e) => console.error('[TRANSCODE] loop error:', e))
    .finally(() => { workerRunning = false; });
}

/** Chamado no boot: destrava jobs presos em 'processing' (restart no meio) e
 *  liga uma rede de segurança que acorda o worker periodicamente. */
export async function initTranscodeWorker(): Promise<void> {
  if (!enabled()) { console.log('[TRANSCODE] desligado (R2 ausente ou TRANSCODE_DISABLED=1)'); return; }
  try {
    await prisma.lesson.updateMany({ where: { transcodeStatus: 'processing' }, data: { transcodeStatus: 'pending' } });
  } catch { /* noop */ }
  if (!safetyInterval) safetyInterval = setInterval(() => kickWorker(), 5 * 60 * 1000);
  kickWorker();
}

async function runLoop(): Promise<void> {
  while (true) {
    const pending = await prisma.lesson.findFirst({
      where: { transcodeStatus: 'pending', storageProvider: 'r2', videoKey: { not: null } },
      orderBy: { videoUploadedAt: 'asc' },
      select: { id: true },
    });
    if (!pending) break;
    // Reivindicação atômica — evita dois workers no mesmo job (réplicas).
    const claim = await prisma.lesson.updateMany({
      where: { id: pending.id, transcodeStatus: 'pending' },
      data: { transcodeStatus: 'processing' },
    });
    if (claim.count === 0) continue;
    await processLesson(pending.id);
  }
}

/** Executa um comando e resolve com o código de saída; captura stderr. */
function run(cmd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); if (stderr.length > 20000) stderr = stderr.slice(-20000); });
    child.on('error', (e) => resolve({ code: -1, stderr: String(e) }));
    child.on('close', (code) => resolve({ code: code ?? -1, stderr }));
  });
}

async function processLesson(lessonId: string): Promise<void> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, videoKey: true, videoType: true, module: { select: { courseId: true } } },
  });
  if (!lesson || !lesson.videoKey) {
    await prisma.lesson.update({ where: { id: lessonId }, data: { transcodeStatus: 'failed', transcodeError: 'aula/vídeo ausente' } }).catch(() => {});
    return;
  }

  const workdir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cz-hls-'));
  const outDir = path.join(workdir, 'hls');
  await fsp.mkdir(outDir, { recursive: true });

  try {
    // URL assinada longa (6h) — ffmpeg lê o MP4 direto do R2, sem baixar.
    const { url } = await r2.getSignedDownloadUrl(lesson.videoKey, { expiresIn: 6 * 3600 });

    // ffprobe: altura (STDOUT) + presença de áudio.
    const height = await probeInt(['-select_streams', 'v:0', '-show_entries', 'stream=height', '-of', 'csv=p=0'], url);
    const audioIdx = await probeStr(['-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0'], url);
    const hasAudio = audioIdx.trim().length > 0;

    const srcH = height > 0 ? height : 1080;
    // Escada filtrada pela fonte; garante pelo menos uma faixa.
    let ladder = LADDER.filter((r) => r.h <= srcH);
    if (ladder.length === 0) ladder = [{ ...LADDER[LADDER.length - 1], h: Math.max(144, srcH) }];

    console.log(`[TRANSCODE] aula=${lessonId} altura=${srcH} faixas=${ladder.map((l) => l.h).join('/')} audio=${hasAudio}`);

    const args = buildFfmpegArgs(url, outDir, ladder, hasAudio);
    const res = await run('nice', ['-n', '19', 'ffmpeg', ...args]);
    if (res.code !== 0) throw new Error(`ffmpeg saiu ${res.code}: ${res.stderr.slice(-500)}`);

    // Sobe todos os arquivos HLS gerados pro R2, sob o prefixo hls/ da aula.
    const prefix = `${r2.lessonPrefix(lesson.module.courseId, lessonId)}hls/`;
    const files = await fsp.readdir(outDir);
    if (!files.some((f) => f === 'master.m3u8')) throw new Error('master.m3u8 não gerado');
    // Limpa HLS antigo (re-transcodificação após troca de vídeo).
    await r2.deletePrefix(prefix).catch(() => {});
    for (const f of files) {
      const buf = await fsp.readFile(path.join(outDir, f));
      const ct = f.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : f.endsWith('.ts') ? 'video/mp2t' : 'application/octet-stream';
      await r2.putObject({ key: `${prefix}${f}`, body: buf, contentType: ct });
    }

    // Pronto: o player passa a usar HLS (com seletor de qualidade). O MP4 fica
    // no bucket como fallback.
    await prisma.lesson.update({ where: { id: lessonId }, data: { videoType: 'hls', transcodeStatus: 'ready', transcodeError: null } });
    console.log(`[TRANSCODE] ✅ aula=${lessonId} HLS pronto (${files.length} arquivos)`);
  } catch (e: any) {
    console.error(`[TRANSCODE] ❌ aula=${lessonId}:`, e?.message || e);
    await prisma.lesson.update({ where: { id: lessonId }, data: { transcodeStatus: 'failed', transcodeError: String(e?.message || e).slice(0, 500) } }).catch(() => {});
  } finally {
    await fsp.rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

/** ffprobe devolvendo string do STDOUT. */
function probeStr(extra: string[], url: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('ffprobe', ['-v', 'error', ...extra, url], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.on('error', () => resolve(''));
    child.on('close', () => resolve(out));
  });
}
async function probeInt(extra: string[], url: string): Promise<number> {
  const s = await probeStr(extra, url);
  const n = parseInt(s.trim().split(/\r?\n/)[0] || '0', 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Monta os argumentos do ffmpeg para HLS multi-bitrate FLAT:
 *   hls/master.m3u8, hls/stream_N.m3u8, hls/stream_N_XYZ.ts
 * (estrutura plana casa com o proxy GET /video/:id/hls/*).
 */
function buildFfmpegArgs(
  input: string,
  outDir: string,
  ladder: Array<{ h: number; vb: string; maxrate: string; bufsize: string; ab: string }>,
  hasAudio: boolean,
): string[] {
  const N = ladder.length;
  const splitOuts = ladder.map((_, i) => `[v${i}]`).join('');
  const filter =
    `[0:v]split=${N}${splitOuts}; ` +
    ladder.map((r, i) => `[v${i}]scale=-2:${r.h}[v${i}o]`).join('; ');

  const args: string[] = [
    '-y',
    '-loglevel', 'error',
    '-threads', '2',
    '-i', input,
    '-filter_complex', filter,
  ];

  const streamMap: string[] = [];
  ladder.forEach((r, i) => {
    args.push('-map', `[v${i}o]`);
    if (hasAudio) args.push('-map', '0:a:0');
    args.push(
      `-c:v:${i}`, 'libx264', '-preset', 'veryfast', '-profile:v', 'main',
      '-g', '48', '-keyint_min', '48', '-sc_threshold', '0',
      `-b:v:${i}`, r.vb, `-maxrate:v:${i}`, r.maxrate, `-bufsize:v:${i}`, r.bufsize,
    );
    if (hasAudio) args.push(`-c:a:${i}`, 'aac', `-b:a:${i}`, r.ab, '-ac', '2');
    streamMap.push(hasAudio ? `v:${i},a:${i}` : `v:${i}`);
  });

  args.push(
    '-f', 'hls',
    '-hls_time', '6',
    '-hls_playlist_type', 'vod',
    '-hls_flags', 'independent_segments',
    '-hls_segment_filename', path.join(outDir, 'stream_%v_%03d.ts'),
    '-master_pl_name', 'master.m3u8',
    '-var_stream_map', streamMap.join(' '),
    path.join(outDir, 'stream_%v.m3u8'),
  );
  return args;
}
