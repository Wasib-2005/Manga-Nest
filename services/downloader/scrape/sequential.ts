import type { MangaMeta } from "../types/manga";

const EXTENSIONS = [".webp", ".jpg", ".jpeg", ".png", ".gif"];

export const SEQUENTIAL_PATTERN = /(.*\/)(\d+)\.(webp|jpg|jpeg|png|gif)(\?.*)?$/i;

/**
 * Does NOT scan — just validates the URL and returns a placeholder.
 * The actual HEAD-request scan happens inside downloadManga so the
 * modal opens instantly and the user fills metadata while scanning runs.
 */
export const scrapeSequential = (imageUrl: string): MangaMeta => {
  if (!SEQUENTIAL_PATTERN.test(imageUrl)) {
    throw new Error(
      "Invalid sequential URL — must contain a number before the extension, e.g. .../05.jpg"
    );
  }
  return {
    name:      "",
    author:    "",
    tags:      [],
    genres:    [],
    ep:        "",
    source:    "sequential",
    imageUrls: [],       // filled during download
    scanUrl:   imageUrl, // stored so downloadManga can scan
  };
};

// ─── Scanner (called by downloadManga) ───────────────────────────────────────

const MAX_HEAD_RETRIES   = 2;
const CONSECUTIVE_MISSES = 2;
const HEAD_TIMEOUT_MS    = 6000;

const tryIndex = async (
  base:       string,
  index:      number,
  extensions: string[],
  onLog:      (msg: string) => void
): Promise<{ url: string; ext: string } | null> => {
  onLog(`Trying index ${index}  →  ${base}${index}`);

  const check = async (ext: string): Promise<{ url: string; ext: string } | null> => {
    const url = `${base}${index}${ext}`;
    for (let attempt = 1; attempt <= MAX_HEAD_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
        const res = await fetch(url, { method: "HEAD", signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) return { url, ext };
        onLog(`  ✗ ${url} (${res.status})`);
        return null;
      } catch {
        if (attempt === MAX_HEAD_RETRIES) {
          onLog(`  ✗ ${url} (network error)`);
          return null;
        }
      }
    }
    return null;
  };

  const results = await Promise.all(extensions.map(ext => check(ext)));
  const found   = results.find(r => r !== null) ?? null;
  if (found) onLog(`  ✓ found: ${found.url}`);
  return found;
};

const scanDirection = async (
  base:       string,
  start:      number,
  direction:  1 | -1,
  extensions: string[],
  onLog:      (msg: string) => void,
  cancelRef:  { cancelled: boolean }
): Promise<string[]> => {
  const found: string[] = [];
  let i      = start;
  let misses = 0;

  while (true) {
    if (cancelRef.cancelled) throw new Error("CANCELLED");
    if (i <= 0 && direction === -1) break;

    const result = await tryIndex(base, i, extensions, onLog);
    if (result) {
      misses = 0;
      found.push(result.url);
    } else {
      misses++;
      if (misses >= CONSECUTIVE_MISSES) break;
    }
    i += direction;
  }
  return found;
};

/**
 * Full sequential scan — called from downloadManga before page downloads begin.
 * Returns the ordered list of image URLs.
 */
export const runSequentialScan = async (
  imageUrl:  string,
  onLog:     (msg: string) => void,
  cancelRef: { cancelled: boolean }
): Promise<string[]> => {
  const match = imageUrl.match(/(.*\/)(\d+)(\.[a-zA-Z]+)(\?.*)?$/);
  if (!match) throw new Error("Invalid sequential image URL");

  const base      = match[1];
  const startIdx  = parseInt(match[2], 10);
  const inputExt  = match[3].toLowerCase();
  const ordered   = [inputExt, ...EXTENSIONS.filter(e => e !== inputExt)];

  onLog(`Base: ${base}  |  Start: ${startIdx}  |  Ext: ${inputExt}`);
  onLog("── Scanning backward ──");
  const backward = await scanDirection(base, startIdx,     -1, ordered, onLog, cancelRef);

  onLog("── Scanning forward ──");
  const forward  = await scanDirection(base, startIdx + 1,  1, ordered, onLog, cancelRef);

  const urls = [...backward.reverse(), ...forward];
  onLog(`✓ Found ${urls.length} images`);

  if (urls.length === 0) throw new Error("No images found — check the URL");
  return urls;
};