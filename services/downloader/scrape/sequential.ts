import type { MangaMeta } from "../types/manga";

const EXTENSIONS = [".webp", ".jpg", ".jpeg", ".png", ".gif"];

export const SEQUENTIAL_PATTERN = /(.*\/)(\d+)\.(webp|jpg|jpeg|png|gif)(\?.*)?$/i;

/**
 * Validates the URL and returns a placeholder.
 */
export const scrapeSequential = (imageUrl: string): MangaMeta => {
  const match = imageUrl.match(SEQUENTIAL_PATTERN);
  if (!match) {
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
    imageUrls: [],       
    scanUrl:   imageUrl, 
  };
};

// ─── Scanner Helpers ─────────────────────────────────────────────────────────

const MAX_HEAD_RETRIES   = 2;
const CONSECUTIVE_MISSES = 2; 
const HEAD_TIMEOUT_MS    = 6000;

const tryIndex = async (
  base:       string,
  index:      number,
  extensions: string[],
  onLog:      (msg: string) => void
): Promise<{ url: string; ext: string } | null> => {
  const strIndex = index.toString();
  
  const check = async (ext: string): Promise<{ url: string; ext: string } | null> => {
    const url = `${base}${strIndex}${ext}`;
    for (let attempt = 1; attempt <= MAX_HEAD_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
        const res = await fetch(url, { method: "HEAD", signal: controller.signal });
        clearTimeout(timer);
        
        if (res.ok) return { url, ext };
        return null; 
      } catch {
        if (attempt === MAX_HEAD_RETRIES) return null;
      }
    }
    return null;
  };

  for (const ext of extensions) {
    const found = await check(ext);
    if (found) {
      onLog(`  ✓ Found ${index}: ${found.url}`);
      return found;
    }
  }
  
  onLog(`  ✗ No image at ${index}`);
  return null;
};

/**
 * Start-Forward Scan:
 * Starts exactly at the index provided in the URL and goes UP.
 */
export const runSequentialScan = async (
  imageUrl:  string,
  onLog:     (msg: string) => void,
  cancelRef: { cancelled: boolean }
): Promise<string[]> => {
  const match = imageUrl.match(/(.*\/)(\d+)(\.[a-zA-Z]+)(\?.*)?$/);
  if (!match) throw new Error("Invalid sequential image URL");

  const base      = match[1];
  const startIndex = parseInt(match[2], 10); // Extract 10 from .../10.jpg
  const inputExt  = match[3].toLowerCase();
  const orderedExts = [inputExt, ...EXTENSIONS.filter(e => e !== inputExt)];

  onLog(`Starting Scan from index: ${startIndex}`);
  
  const urls: string[] = [];
  let currentIndex = startIndex;
  let misses = 0;

  while (true) {
    if (cancelRef.cancelled) throw new Error("CANCELLED");

    const result = await tryIndex(base, currentIndex, orderedExts, onLog);
    
    if (result) {
      urls.push(result.url);
      misses = 0; 
    } else {
      misses++;
      // Stop if we hit 404s for 2 numbers in a row
      if (misses >= CONSECUTIVE_MISSES) {
        onLog(`Scan complete. End of sequence reached at ${currentIndex}.`);
        break;
      }
    }

    currentIndex++;

    // Safety limit
    if (currentIndex > startIndex + 1000) {
      onLog("Reached safety limit (1000 pages from start). Stopping.");
      break;
    }
  }

  onLog(`✓ Found ${urls.length} images starting from ${startIndex}`);
  
  if (urls.length === 0) {
    throw new Error(`Failed to find even the first image at index ${startIndex}`);
  }

  return urls;
};