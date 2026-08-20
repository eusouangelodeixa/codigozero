/**
 * CloudflareR2Service — armazenamento de vídeos das aulas em bucket PRIVADO.
 *
 * Regras de ouro (não negociáveis):
 *   • O bucket é SEMPRE privado. Nada é servido diretamente do R2 ao aluno.
 *   • A Secret/Access Key e o Endpoint NUNCA saem do backend.
 *   • Todo acesso ao vídeo passa por uma URL ASSINADA e TEMPORÁRIA (5 min no
 *     player). O front nunca recebe URL permanente nem a KEY do bucket.
 *   • Só guardamos a KEY do objeto no banco — nunca uma URL pública.
 *
 * R2 é S3-compatível: usamos o SDK oficial da AWS apontando para o endpoint do
 * R2 (path-style — `https://<conta>.r2.cloudflarestorage.com/<bucket>/<key>`).
 *
 * Upload de arquivos grandes (até 20 GB) é MULTIPART PRESIGNED DIRETO do
 * navegador para o R2: o backend só AUTORIZA (assina cada parte) e finaliza o
 * multipart — os bytes nunca passam pela memória/banda do servidor. Ver os
 * endpoints em routes/members.admin.routes.ts.
 *
 * Config vem 100% de variáveis de ambiente (config/env.ts):
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT, R2_REGION.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { env } from '../config/env';

export type R2Config = {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  region: string;
};

/** Config resolvida do env. null = R2 não configurado (features de vídeo R2 ficam inativas). */
export function getR2Config(): R2Config | null {
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const bucket = env.R2_BUCKET;
  const endpoint = env.R2_ENDPOINT;
  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) return null;
  return { accessKeyId, secretAccessKey, bucket, endpoint, region: env.R2_REGION || 'auto' };
}

export function isR2Configured(): boolean {
  return getR2Config() !== null;
}

// Cliente é caro de criar; guardamos um singleton por processo. Recriado só se
// a config mudar (não muda em runtime, mas mantém o singleton honesto).
let cachedClient: { client: S3Client; sig: string } | null = null;

function getClient(cfg: R2Config): S3Client {
  const sig = `${cfg.endpoint}|${cfg.accessKeyId}|${cfg.region}`;
  if (cachedClient && cachedClient.sig === sig) return cachedClient.client;
  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    // R2 usa path-style: bucket vai no caminho, não em subdomínio.
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  cachedClient = { client, sig };
  return client;
}

function requireConfig(): R2Config {
  const cfg = getR2Config();
  if (!cfg) throw new Error('R2 não configurado (defina R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT).');
  return cfg;
}

// ── Organização de arquivos ──────────────────────────────────────────────────
// cursos/{courseId}/aulas/{lessonId}/video.{ext}
// HLS: cursos/{courseId}/aulas/{lessonId}/hls/master.m3u8 (+ segmentos ao lado).

/** Extensão segura a partir do nome/MIME (sem ponto). Default mp4. */
export function extFor(filename?: string | null, mime?: string | null): string {
  const fromName = (filename || '').split('.').pop()?.toLowerCase() || '';
  const known = new Set(['mp4', 'mov', 'mkv', 'webm', 'm3u8']);
  if (known.has(fromName)) return fromName;
  const m = (mime || '').toLowerCase();
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('quicktime')) return 'mov';
  if (m.includes('matroska')) return 'mkv';
  if (m.includes('webm')) return 'webm';
  if (m.includes('mpegurl')) return 'm3u8';
  return 'mp4';
}

/** Prefixo (pasta lógica) de uma aula. Sempre com barra no fim. */
export function lessonPrefix(courseId: string, lessonId: string): string {
  return `cursos/${courseId}/aulas/${lessonId}/`;
}

/** Key do vídeo principal de uma aula, dado o ext. */
export function videoKeyFor(courseId: string, lessonId: string, ext: string): string {
  const safeExt = /^[a-z0-9]{2,5}$/.test(ext) ? ext : 'mp4';
  return `${lessonPrefix(courseId, lessonId)}video.${safeExt}`;
}

// ── Operações ────────────────────────────────────────────────────────────────

/** Sobe um objeto pequeno diretamente do backend (usado para thumbs/util, não
 *  para o vídeo grande — esse vai por multipart presigned). */
export async function putObject(opts: {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
}): Promise<void> {
  const cfg = requireConfig();
  await getClient(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
    }),
  );
}

/** Apaga um objeto. Idempotente (R2 não erra em key inexistente). */
export async function deleteObject(key: string): Promise<void> {
  const cfg = requireConfig();
  await getClient(cfg).send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}

/** Apaga TODOS os objetos sob um prefixo (limpa a pasta da aula: vídeo + HLS). */
export async function deletePrefix(prefix: string): Promise<number> {
  const cfg = requireConfig();
  const client = getClient(cfg);
  let removed = 0;
  let ContinuationToken: string | undefined;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, ContinuationToken }),
    );
    const objects = (listed.Contents || []).map((o) => ({ Key: o.Key! })).filter((o) => o.Key);
    if (objects.length) {
      await client.send(
        new DeleteObjectsCommand({ Bucket: cfg.bucket, Delete: { Objects: objects, Quiet: true } }),
      );
      removed += objects.length;
    }
    ContinuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return removed;
}

/** Existe? Retorna metadados básicos ou null. */
export async function headObject(
  key: string,
): Promise<{ size: number; contentType?: string; lastModified?: Date } | null> {
  const cfg = requireConfig();
  try {
    const r = await getClient(cfg).send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
    return { size: Number(r.ContentLength || 0), contentType: r.ContentType, lastModified: r.LastModified };
  } catch (e: any) {
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') return null;
    throw e;
  }
}

export async function objectExists(key: string): Promise<boolean> {
  return (await headObject(key)) !== null;
}

/** Lista keys sob um prefixo (paginado internamente). */
export async function listPrefix(prefix: string): Promise<Array<{ key: string; size: number }>> {
  const cfg = requireConfig();
  const client = getClient(cfg);
  const out: Array<{ key: string; size: number }> = [];
  let ContinuationToken: string | undefined;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, ContinuationToken }),
    );
    for (const o of listed.Contents || []) if (o.Key) out.push({ key: o.Key, size: Number(o.Size || 0) });
    ContinuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return out;
}

/**
 * URL ASSINADA temporária de leitura (GET). É assim — e só assim — que um vídeo
 * privado chega ao player. `expiresIn` em segundos (default 300 = 5 min).
 */
export async function getSignedDownloadUrl(
  key: string,
  opts?: { expiresIn?: number; responseContentType?: string },
): Promise<{ url: string; expiresIn: number; expiresAt: Date }> {
  const cfg = requireConfig();
  const expiresIn = opts?.expiresIn ?? 300;
  const url = await getSignedUrl(
    getClient(cfg),
    new GetObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      ResponseContentType: opts?.responseContentType,
    }),
    { expiresIn },
  );
  return { url, expiresIn, expiresAt: new Date(Date.now() + expiresIn * 1000) };
}

/** Baixa um objeto como stream (usado pelo proxy de segmentos HLS privados). */
export async function getObjectStream(
  key: string,
): Promise<{ body: Readable; contentType?: string; contentLength?: number } | null> {
  const cfg = requireConfig();
  try {
    const r = await getClient(cfg).send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
    return {
      body: r.Body as Readable,
      contentType: r.ContentType,
      contentLength: r.ContentLength ? Number(r.ContentLength) : undefined,
    };
  } catch (e: any) {
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NoSuchKey') return null;
    throw e;
  }
}

// ── Multipart presigned (upload direto navegador → R2) ───────────────────────

/** Abre um multipart e devolve o uploadId. */
export async function createMultipart(opts: {
  key: string;
  contentType?: string;
}): Promise<{ uploadId: string; key: string }> {
  const cfg = requireConfig();
  const r = await getClient(cfg).send(
    new CreateMultipartUploadCommand({ Bucket: cfg.bucket, Key: opts.key, ContentType: opts.contentType }),
  );
  if (!r.UploadId) throw new Error('R2 não retornou UploadId');
  return { uploadId: r.UploadId, key: opts.key };
}

/** URL assinada para o navegador dar PUT de UMA parte (default 1h de validade). */
export async function signUploadPart(opts: {
  key: string;
  uploadId: string;
  partNumber: number;
  expiresIn?: number;
}): Promise<string> {
  const cfg = requireConfig();
  return getSignedUrl(
    getClient(cfg),
    new UploadPartCommand({
      Bucket: cfg.bucket,
      Key: opts.key,
      UploadId: opts.uploadId,
      PartNumber: opts.partNumber,
    }),
    { expiresIn: opts.expiresIn ?? 3600 },
  );
}

/** Finaliza o multipart com os ETags de cada parte (na ordem). */
export async function completeMultipart(opts: {
  key: string;
  uploadId: string;
  parts: Array<{ partNumber: number; etag: string }>;
}): Promise<void> {
  const cfg = requireConfig();
  const Parts = [...opts.parts]
    .sort((a, b) => a.partNumber - b.partNumber)
    .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag }));
  await getClient(cfg).send(
    new CompleteMultipartUploadCommand({
      Bucket: cfg.bucket,
      Key: opts.key,
      UploadId: opts.uploadId,
      MultipartUpload: { Parts },
    }),
  );
}

/** Aborta um multipart (cancelar upload / limpar parte órfã). Nunca lança. */
export async function abortMultipart(opts: { key: string; uploadId: string }): Promise<void> {
  const cfg = requireConfig();
  try {
    await getClient(cfg).send(
      new AbortMultipartUploadCommand({ Bucket: cfg.bucket, Key: opts.key, UploadId: opts.uploadId }),
    );
  } catch (e) {
    console.warn('[R2] abortMultipart falhou (ignorado):', (e as Error).message);
  }
}
