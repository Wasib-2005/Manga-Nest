import { Platform, PermissionsAndroid } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import type { MangaMeta, EditedMeta, DownloadProgress } from "./types/manga";
import { runSequentialScan } from "./scrape/sequential";

const MAX_RETRY = 3;

const HEADERS: Record<MangaMeta["source"], Record<string, string>> = {
  mangadex:   { "User-Agent": "Mozilla/5.0", "Referer": "https://mangadex.org/" },
  nhentai:    { "User-Agent": "Mozilla/5.0", "Referer": "https://nhentai.net/"  },
  sequential: { "User-Agent": "Mozilla/5.0" },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface IndexEntry {
  uid:     string;
  name:    string;
  source:  MangaMeta["source"];
  addedAt: string;
}

// ─── Lock ─────────────────────────────────────────────────────────────────────

let _busy = false;

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  while (_busy) await new Promise(r => setTimeout(r, 30));
  _busy = true;
  try   { return await fn(); }
  finally { _busy = false; }
}

// ─── UID helpers ──────────────────────────────────────────────────────────────

function generateUid(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

function uniqueUid(existing: IndexEntry[]): string {
  const taken = new Set(existing.map(e => e.uid));
  let uid: string;
  do { uid = generateUid(); } while (taken.has(uid));
  return uid;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

async function readIndex(root: Directory): Promise<IndexEntry[]> {
  try {
    const f = new File(`${root.uri}/index.json`);
    if (!f.exists) return [];
    const parsed = JSON.parse(await f.text());
    if (!Array.isArray(parsed)) throw new Error("not an array");
    return parsed.filter((e: IndexEntry) => {
      try { return new Directory(root, e.uid).exists; }
      catch { return false; }
    });
  } catch (err) {
    console.warn("⚠️  index.json unreadable — rebuilding:", err);
    return rebuildIndexAsync(root);
  }
}

async function rebuildIndexAsync(root: Directory): Promise<IndexEntry[]> {
  const entries: IndexEntry[] = [];
  try {
    for (const item of root.list()) {
      if (!(item instanceof Directory)) continue;
      try {
        const f = new File(`${item.uri}/title.json`);
        if (!f.exists) continue;
        const data: IndexEntry = JSON.parse(await f.text());
        if (data.uid && data.name && data.source) entries.push(data);
      } catch { /* skip */ }
    }
  } catch { /* root not yet created */ }
  return entries;
}

async function writeIndex(root: Directory, entries: IndexEntry[]): Promise<void> {
  const tmp  = new File(`${root.uri}/index.json.tmp`);
  const real = new File(`${root.uri}/index.json`);
  await tmp.write(JSON.stringify(entries, null, 2));
  if (real.exists) real.delete();
  await tmp.move(real);
}

// ─── Permission ───────────────────────────────────────────────────────────────

export async function requestSdcardPermission() {
  if (Platform.OS !== "android") return;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      {
        title:          "Storage Permission",
        message:        "This app needs access to storage to download manga.",
        buttonNeutral:  "Ask Me Later",
        buttonNegative: "Cancel",
        buttonPositive: "OK",
      }
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error("Storage permission denied");
    }
  } catch (err) {
    throw err;
  }
}

// ─── Main downloader ──────────────────────────────────────────────────────────

export const downloadManga = async (
  meta:       MangaMeta,
  edited:     EditedMeta,
  onProgress: (p: DownloadProgress) => void,
  cancelRef:  { cancelled: boolean },
  onLog?:     (msg: string) => void    
): Promise<string> => {

  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };

  const canonicalName = edited.name.trim();
  const ep            = edited.ep.trim();

  // ── 1. Sequential scan ────────────────────────────────────────────────────
  let resolvedMeta = meta;
  if (meta.source === "sequential") {
    if (!meta.scanUrl) throw new Error("Missing scan URL for sequential source");
    onProgress({ message: "Scanning for images…", current: 0, total: 0 });
    const urls = await runSequentialScan(
      meta.scanUrl,
      (msg) => {
        log(msg);
        onProgress({ message: msg, current: 0, total: 0 });
      },
      cancelRef
    );
    resolvedMeta = { ...meta, imageUrls: urls };
  }

  // ── 2. Ensure manga root ───────────────────────────────────────────────────
  const root = new Directory(Paths.document, "manga");
  if (!root.exists) root.create({ intermediates: true });

  // ── 3. Registry lookup ────────────────────────────────────────────────────
  const { uid, isNewTitle } = await withLock(async () => {
    const entries  = await readIndex(root);
    const normName = canonicalName.toLowerCase();
    const existing = entries.find(e => e.name.toLowerCase() === normName);

    if (existing) {
      const done = new File(`${root.uri}/${existing.uid}/${ep}/info.json`);
      if (done.exists) throw new Error("ALREADY_EXISTS");
      return { uid: existing.uid, isNewTitle: false };
    }

    const newUid = uniqueUid(entries);
    entries.push({ uid: newUid, name: canonicalName, source: resolvedMeta.source, addedAt: new Date().toISOString() });
    await writeIndex(root, entries);
    return { uid: newUid, isNewTitle: true };
  });

  // ── 4. Directory tree & Title Metadata ─────────────────────────────────────
  const titleDir   = new Directory(root,     uid);
  const chapterDir = new Directory(titleDir, ep);

  if (!titleDir.exists)   titleDir.create(  { intermediates: true });
  if (!chapterDir.exists) chapterDir.create({ intermediates: true });

  const titleFile = new File(`${titleDir.uri}/title.json`);
  
  // FIX: Save full metadata to title.json so LibraryScreen can find it
  await titleFile.write(JSON.stringify(
    { 
      uid, 
      name: canonicalName, 
      author: edited.author.trim(),
      tags: edited.tags.split(",").map(t => t.trim()).filter(Boolean),
      genres: edited.genres.split(",").map(t => t.trim()).filter(Boolean),
      source: resolvedMeta.source, 
      addedAt: new Date().toISOString() 
    },
    null, 2
  ));

  log(`📁 uid: ${uid}  («${canonicalName}»)`);
  log(`📁 path: ${chapterDir.uri}`);

  // ── 5. Download pages ─────────────────────────────────────────────────────
  try {
    for (let i = 0; i < resolvedMeta.imageUrls.length; i++) {
      if (cancelRef.cancelled) throw new Error("CANCELLED");

      const url  = resolvedMeta.imageUrls[i];
      const ext  = url.split(".").pop()?.split("?")[0] || "jpg";
      const file = new File(`${chapterDir.uri}/${i + 1}.${ext}`);

      if (file.exists) {
        onProgress({ message: `${i + 1}.${ext} (resumed)`, current: i + 1, total: resolvedMeta.imageUrls.length });
        continue;
      }

      let saved     = false;
      let lastError = "";

      for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
        try {
          const res = await fetch(url, { headers: HEADERS[resolvedMeta.source] });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await file.write(new Uint8Array(await res.arrayBuffer()));
          saved = true;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          console.warn(`⚠️  retry ${attempt + 1}/${MAX_RETRY} page ${i + 1}: ${lastError}`);
          if (attempt < MAX_RETRY - 1) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        }
      }

      if (!saved) throw new Error(`Failed page ${i + 1}: ${lastError}`);

      onProgress({ message: `${i + 1}.${ext}`, current: i + 1, total: resolvedMeta.imageUrls.length });
    }

    // ── 6. info.json — completion marker ────────────────────────────────────
    await new File(`${chapterDir.uri}/info.json`).write(JSON.stringify({
      uid,
      name:    canonicalName,
      author:  edited.author.trim(),
      tags:    edited.tags  .split(",").map(t => t.trim()).filter(Boolean),
      genres:  edited.genres.split(",").map(t => t.trim()).filter(Boolean),
      ep,
      source:  resolvedMeta.source,
      pages:   resolvedMeta.imageUrls.length,
      savedAt: new Date().toISOString(),
    }, null, 2));

    log(`🎉 Done: ${chapterDir.uri}`);
    return chapterDir.uri;

  } catch (err) {
    const isCancelled = err instanceof Error && err.message === "CANCELLED";
    console.warn(isCancelled ? "🚫 Cancelled." : "❌ Rolling back.", err);

    try { if (chapterDir.exists) chapterDir.delete(); } catch { /* ignore */ }

    if (isNewTitle) {
      try {
        await withLock(async () => {
          const entries = await readIndex(root);
          await writeIndex(root, entries.filter(e => e.uid !== uid));
        });
      } catch { /* best-effort */ }
      try { if (titleDir.exists) titleDir.delete(); } catch { /* ignore */ }
    }

    throw err;
  }
};