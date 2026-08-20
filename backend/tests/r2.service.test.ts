/**
 * Testes do CloudflareR2Service (src/services/r2.service.ts).
 *
 * Cobrem, sem tocar na rede:
 *   • helpers de key/extensão (organização cursos/{c}/aulas/{a}/video.ext)
 *   • resolução de config a partir do ambiente (isR2Configured)
 *   • URL ASSINADA + EXPIRAÇÃO de 5 min (presigner é cripto local — sem rede)
 *   • Upload / Delete / Exists / Multipart via aws-sdk-client-mock (S3 mockado)
 *
 * A config do R2 é injetada por env ANTES do import dinâmico do módulo (o objeto
 * `env` é montado no import). Vitest isola módulos por arquivo, então é seguro.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';

let r2: typeof import('../src/services/r2.service');
const s3mock = mockClient(S3Client);

beforeAll(async () => {
  process.env.R2_ACCESS_KEY_ID = 'test-access-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
  process.env.R2_BUCKET = 'cz-videos-test';
  process.env.R2_ENDPOINT = 'https://acct123.r2.cloudflarestorage.com';
  process.env.R2_REGION = 'auto';
  r2 = await import('../src/services/r2.service');
});

beforeEach(() => s3mock.reset());

describe('config', () => {
  it('reconhece o R2 como configurado quando o env está completo', () => {
    expect(r2.isR2Configured()).toBe(true);
    const cfg = r2.getR2Config()!;
    expect(cfg.bucket).toBe('cz-videos-test');
    expect(cfg.region).toBe('auto');
  });
});

describe('helpers de key', () => {
  it('deriva a extensão do nome do arquivo', () => {
    expect(r2.extFor('aula.mp4', '')).toBe('mp4');
    expect(r2.extFor('aula.MOV', '')).toBe('mov');
    expect(r2.extFor('aula.mkv', '')).toBe('mkv');
    expect(r2.extFor('playlist.m3u8', '')).toBe('m3u8');
  });

  it('cai pro MIME quando o nome não ajuda, e default mp4', () => {
    expect(r2.extFor('semext', 'video/webm')).toBe('webm');
    expect(r2.extFor('', 'application/vnd.apple.mpegurl')).toBe('m3u8');
    expect(r2.extFor('', '')).toBe('mp4');
  });

  it('monta o prefixo e a key no padrão cursos/{c}/aulas/{a}/video.ext', () => {
    expect(r2.lessonPrefix('c1', 'a1')).toBe('cursos/c1/aulas/a1/');
    expect(r2.videoKeyFor('c1', 'a1', 'mp4')).toBe('cursos/c1/aulas/a1/video.mp4');
  });

  it('sanitiza extensão inesperada para mp4', () => {
    expect(r2.videoKeyFor('c1', 'a1', '../../evil')).toBe('cursos/c1/aulas/a1/video.mp4');
  });
});

describe('URL assinada + expiração', () => {
  it('gera GET assinado que expira em 5 min por padrão', async () => {
    const { url, expiresIn, expiresAt } = await r2.getSignedDownloadUrl('cursos/c1/aulas/a1/video.mp4');
    expect(expiresIn).toBe(300);
    expect(url).toContain('X-Amz-Expires=300');
    expect(url).toContain('X-Amz-Signature=');
    expect(url).toContain('cz-videos-test'); // path-style: bucket no caminho
    const delta = expiresAt.getTime() - Date.now();
    expect(delta).toBeGreaterThan(4 * 60 * 1000);
    expect(delta).toBeLessThanOrEqual(5 * 60 * 1000 + 1000);
  });

  it('respeita expiração customizada', async () => {
    const { url, expiresIn } = await r2.getSignedDownloadUrl('k', { expiresIn: 60 });
    expect(expiresIn).toBe(60);
    expect(url).toContain('X-Amz-Expires=60');
  });
});

describe('upload / delete / exists', () => {
  it('putObject envia PutObjectCommand com bucket e key certos', async () => {
    s3mock.on(PutObjectCommand).resolves({});
    await r2.putObject({ key: 'k1', body: Buffer.from('x'), contentType: 'image/jpeg' });
    const calls = s3mock.commandCalls(PutObjectCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input).toMatchObject({ Bucket: 'cz-videos-test', Key: 'k1', ContentType: 'image/jpeg' });
  });

  it('deleteObject envia DeleteObjectCommand', async () => {
    s3mock.on(DeleteObjectCommand).resolves({});
    await r2.deleteObject('k1');
    expect(s3mock.commandCalls(DeleteObjectCommand)).toHaveLength(1);
  });

  it('objectExists true quando HEAD responde', async () => {
    s3mock.on(HeadObjectCommand).resolves({ ContentLength: 123, ContentType: 'video/mp4' });
    expect(await r2.objectExists('k1')).toBe(true);
    const head = await r2.headObject('k1');
    expect(head?.size).toBe(123);
  });

  it('objectExists false quando HEAD dá 404', async () => {
    s3mock.on(HeadObjectCommand).rejects({ $metadata: { httpStatusCode: 404 }, name: 'NotFound' });
    expect(await r2.objectExists('missing')).toBe(false);
  });
});

describe('multipart', () => {
  it('createMultipart devolve o uploadId', async () => {
    s3mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'up-1' });
    const r = await r2.createMultipart({ key: 'cursos/c1/aulas/a1/video.mp4', contentType: 'video/mp4' });
    expect(r.uploadId).toBe('up-1');
    expect(r.key).toBe('cursos/c1/aulas/a1/video.mp4');
  });

  it('signUploadPart devolve URL assinada de PUT da parte', async () => {
    const url = await r2.signUploadPart({ key: 'k', uploadId: 'up-1', partNumber: 2 });
    expect(url).toContain('partNumber=2');
    expect(url).toContain('uploadId=up-1');
    expect(url).toContain('X-Amz-Signature=');
  });

  it('completeMultipart ordena as partes por PartNumber', async () => {
    s3mock.on(CompleteMultipartUploadCommand).resolves({});
    await r2.completeMultipart({
      key: 'k',
      uploadId: 'up-1',
      parts: [
        { partNumber: 2, etag: '"e2"' },
        { partNumber: 1, etag: '"e1"' },
      ],
    });
    const call = s3mock.commandCalls(CompleteMultipartUploadCommand)[0];
    const parts = call.args[0].input.MultipartUpload?.Parts;
    expect(parts?.map((p) => p.PartNumber)).toEqual([1, 2]);
  });

  it('abortMultipart nunca lança (best-effort)', async () => {
    s3mock.on(AbortMultipartUploadCommand).rejects(new Error('boom'));
    await expect(r2.abortMultipart({ key: 'k', uploadId: 'up-1' })).resolves.toBeUndefined();
  });
});

describe('deletePrefix', () => {
  it('lista e apaga todos os objetos do prefixo', async () => {
    s3mock.on(ListObjectsV2Command).resolves({
      Contents: [{ Key: 'cursos/c1/aulas/a1/video.mp4' }, { Key: 'cursos/c1/aulas/a1/hls/master.m3u8' }],
      IsTruncated: false,
    });
    // deletePrefix usa DeleteObjects (batch) — cobrimos que lista e não lança.
    const { DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
    s3mock.on(DeleteObjectsCommand).resolves({});
    const removed = await r2.deletePrefix('cursos/c1/aulas/a1/');
    expect(removed).toBe(2);
  });
});
