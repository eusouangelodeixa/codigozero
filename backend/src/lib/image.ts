/**
 * Image optimization for user uploads (avatars + chat images).
 *
 * `optimizeImage` auto-rotates by EXIF, downscales the longest side to fit
 * `maxDim` (never enlarges), re-encodes compressed, and OVERWRITES the file in
 * place (or writes a sibling file when the extension changes, removing the old
 * one). It is deliberately failure-tolerant: ANY sharp error leaves the ORIGINAL
 * file untouched and returns null, so a bad/odd upload can never break the
 * request path that called it.
 *
 * sharp is loaded lazily (require inside the function) so a missing/broken
 * native binary — e.g. an Alpine Docker image without the right libvips — can't
 * crash the process at import time; the upload simply falls back to the original.
 */
import path from 'path';
import fs from 'fs';

export interface OptimizeOptions {
  /** Longest-side cap in px. Images larger than this are scaled down to fit. */
  maxDim: number;
  /** Output container. Only 'webp' and 'jpeg' are wired today. */
  format?: 'webp' | 'jpeg';
}

export interface OptimizeResult {
  /** Absolute path of the (possibly renamed) optimized file. */
  path: string;
  /** Public-ish basename of the optimized file (for rebuilding a served URL). */
  filename: string;
  /** New mime type after re-encode. */
  mime: string;
}

const MIME_BY_FORMAT: Record<NonNullable<OptimizeOptions['format']>, string> = {
  webp: 'image/webp',
  jpeg: 'image/jpeg',
};

const EXT_BY_FORMAT: Record<NonNullable<OptimizeOptions['format']>, string> = {
  webp: '.webp',
  jpeg: '.jpg',
};

/**
 * Optimize an image at `absPath` in place. Returns the new file info on success
 * (note: `filename`/`path` may change when the extension changes), or `null` on
 * ANY failure — in which case the original file is left exactly as it was.
 */
export async function optimizeImage(
  absPath: string,
  opts: OptimizeOptions,
): Promise<OptimizeResult | null> {
  const format = opts.format || 'webp';
  try {
    // Lazy require so a missing native binding can't crash module load.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sharp = require('sharp');

    const targetExt = EXT_BY_FORMAT[format];
    const dir = path.dirname(absPath);
    const base = path.basename(absPath, path.extname(absPath));
    const outPath = path.join(dir, `${base}${targetExt}`);
    const sameFile = path.resolve(outPath) === path.resolve(absPath);

    // sharp can't safely read and write the same path in one pipeline, so we
    // always render to a temp file first, then atomically move into place.
    const tmpPath = path.join(dir, `${base}.opt-${Date.now()}${targetExt}`);

    let pipeline = sharp(absPath, { failOn: 'none' })
      .rotate() // apply EXIF orientation, then strip it
      .resize({
        width: opts.maxDim,
        height: opts.maxDim,
        fit: 'inside',
        withoutEnlargement: true,
      });

    if (format === 'webp') {
      pipeline = pipeline.webp({ quality: 80 });
    } else {
      pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true });
    }

    await pipeline.toFile(tmpPath);

    // Swap the optimized file into the final location.
    fs.renameSync(tmpPath, outPath);
    // If we changed the extension, the original is now orphaned — drop it.
    if (!sameFile && fs.existsSync(absPath)) {
      try {
        fs.unlinkSync(absPath);
      } catch {
        /* best-effort cleanup; a leftover original is harmless */
      }
    }

    return {
      path: outPath,
      filename: path.basename(outPath),
      mime: MIME_BY_FORMAT[format],
    };
  } catch (err: any) {
    // Never break the upload: keep the original, signal "not optimized".
    console.warn('[IMAGE] optimize failed (keeping original):', err?.message || err);
    return null;
  }
}
