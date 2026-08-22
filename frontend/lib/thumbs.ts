import { driveApi } from './drive';

// Lazy thumbnail pipeline for image files.
//
// Downloads are authenticated and return full-resolution blobs, so we:
//   - only fetch images under THUMB_MAX_BYTES (memory safety),
//   - cap concurrent downloads (THUMB_CONCURRENCY),
//   - cache object URLs in an LRU keyed by file id, revoking on eviction,
//   - coalesce duplicate requests for the same file into one promise.

const THUMB_MAX_BYTES = 15 * 1024 * 1024;
const THUMB_CONCURRENCY = 4;
const CACHE_LIMIT = 160;

type Entry = { url: string };
const cache = new Map<number, Entry>(); // insertion-ordered → LRU via re-insert
const inflight = new Map<number, Promise<string>>();
const queue: { id: number; run: () => void }[] = [];
let active = 0;

function touch(id: number, url: string) {
  cache.delete(id);
  cache.set(id, { url });
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as number | undefined;
    if (oldest !== undefined) {
      const evicted = cache.get(oldest);
      cache.delete(oldest);
      if (evicted) URL.revokeObjectURL(evicted.url);
    }
  }
}

function pump() {
  while (active < THUMB_CONCURRENCY && queue.length > 0) {
    const job = queue.shift()!;
    active += 1;
    job.run();
  }
}

export function isThumbEligible(mime: string | null | undefined, size: number): boolean {
  return !!mime && mime.startsWith('image/') && size <= THUMB_MAX_BYTES && size > 0;
}

export function getCachedThumb(id: number): string | null {
  const hit = cache.get(id);
  if (hit) {
    // Re-insert to mark as recently used.
    cache.delete(id);
    cache.set(id, hit);
    return hit.url;
  }
  return null;
}

export function loadThumb(file: {
  id: number;
  mime_type: string | null;
  file_size: number;
}): Promise<string> {
  if (!isThumbEligible(file.mime_type, file.file_size)) {
    return Promise.reject(new Error('not eligible'));
  }
  const cached = getCachedThumb(file.id);
  if (cached) return Promise.resolve(cached);

  const existing = inflight.get(file.id);
  if (existing) return existing;

  const promise = new Promise<string>((resolve, reject) => {
    const run = () => {
      driveApi
        .download(file.id)
        .then(({ blob }) => {
          if (!blob.type.startsWith('image/')) throw new Error('not an image');
          const url = URL.createObjectURL(blob);
          touch(file.id, url);
          resolve(url);
        })
        .catch(reject)
        .finally(() => {
          active -= 1;
          inflight.delete(file.id);
          pump();
        });
    };
    queue.push({ id: file.id, run });
    pump();
  });

  inflight.set(file.id, promise);
  return promise;
}
