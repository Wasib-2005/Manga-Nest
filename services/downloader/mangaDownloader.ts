import { Platform, PermissionsAndroid } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import type { MangaMeta, EditedMeta, DownloadProgress } from "./types/manga";

const MAX_RETRY = 3;

const IS_PRODUCTION = process.env.PRODUCTION === "1";

const HEADERS: Record<MangaMeta["source"], Record<string, string>> = {
  mangadex: { "User-Agent": "Mozilla/5.0", "Referer": "https://mangadex.org/" },
  nhentai:  { "User-Agent": "Mozilla/5.0", "Referer": "https://nhentai.net/"  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface IndexEntry {
  uid:     string;
  name:    string;
  source:  MangaMeta["source"];
  addedAt: string;
}

// ─── In-memory lock ───────────────────────────────────────────────────────────

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

// ─── Registry helpers ─────────────────────────────────────────────────────────

async function readIndex(root: Directory): Promise<IndexEntry[]> {
  try {
    const f = new File(`${root.uri}/index.json`);
    if (!f.exists) return [];

    const parsed = JSON.parse(await f.text());
    if (!Array.isArray(parsed)) throw new Error("registry not an array");

    // Prune entries whose uid folder was deleted outside the app
    return parsed.filter((e: IndexEntry) => {
      try { return new Directory(root, e.uid).exists; }
      catch { return false; }
    });
  } catch (err) {
    console.warn("⚠️  index.json unreadable — rebuilding from disk:", err);
    return rebuildIndexAsync(root);
  }
}

async function rebuildIndexAsync(root: Directory): Promise<IndexEntry[]> {
  const entries: IndexEntry[] = [];
  try {
    for (const item of root.list()) {
      if (!(item instanceof Directory)) continue;
      try {
        const titleFile = new File(`${item.uri}/title.json`);
        if (!titleFile.exists) continue;
        const data: IndexEntry = JSON.parse(await titleFile.text());
        if (data.uid && data.name && data.source) entries.push(data);
      } catch { /* malformed title.json — skip */ }
    }
  } catch { /* root may not exist yet */ }
  return entries;
}

/**
 * Crash-safe write:
 *   1. Write to index.json.tmp
 *   2. Delete index.json if it exists        ← ✅ FIX for FileAlreadyExistsException
 *   3. Move tmp → index.json
 *
 * If the app crashes between step 2 and 3 the tmp file is left behind.
 * readIndex() handles that by falling back to rebuildIndexAsync().
 */
async function writeIndex(root: Directory, entries: IndexEntry[]): Promise<void> {
  const tmp  = new File(`${root.uri}/index.json.tmp`);
  const real = new File(`${root.uri}/index.json`);

  await tmp.write(JSON.stringify(entries, null, 2));

  // ✅ FIX: expo-file-system File.move() throws FileAlreadyExistsException if
  // the destination already exists — delete it first.
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
    console.log("✅ Storage permission granted");
  } catch (err) {
    console.error("❌ Permission error:", err);
    throw err;
  }
}

// ─── Main downloader ──────────────────────────────────────────────────────────

/**
 * Download one chapter of a manga.
 *
 * Folder layout:
 *   manga/
 *     index.json          ← name→uid registry
 *     <uid>/              ← e.g. sdse33er/
 *       title.json        ← title metadata (registry rebuild source)
 *       ep1/
 *         1.jpg … N.jpg
 *         info.json       ← written LAST = "chapter complete" marker
 *       ep2/
 *
 * Throws:
 *   "ALREADY_EXISTS"  — chapter already downloaded successfully
 *   "CANCELLED"       — cancelRef.cancelled set mid-download
 */
export const downloadManga = async (
  meta:       MangaMeta,
  edited:     EditedMeta,
  onProgress: (p: DownloadProgress) => void,
  cancelRef:  { cancelled: boolean }
): Promise<string> => {

  const canonicalName = (edited.name || meta.name).trim();
  const ep            = (edited.ep   || meta.ep  ).trim();

  // ── 1. Ensure manga root ───────────────────────────────────────────────────
  const root = new Directory(Paths.document, "manga");
  if (!root.exists) root.create({ intermediates: true });

  // ── 2. Registry lookup (locked against concurrent downloads) ──────────────
  const { uid, isNewTitle } = await withLock(async () => {
    const entries  = await readIndex(root);
    const normName = canonicalName.toLowerCase();
    const existing = entries.find(e => e.name.toLowerCase() === normName);

    if (existing) {
      // info.json only exists if that chapter completed successfully
      const done = new File(`${root.uri}/${existing.uid}/${ep}/info.json`);
      if (done.exists) throw new Error("ALREADY_EXISTS");
      return { uid: existing.uid, isNewTitle: false };
    }

    const newUid = uniqueUid(entries);
    entries.push({ uid: newUid, name: canonicalName, source: meta.source, addedAt: new Date().toISOString() });
    await writeIndex(root, entries);
    return { uid: newUid, isNewTitle: true };
  });

  // ── 3. Build directory tree ────────────────────────────────────────────────
  const titleDir   = new Directory(root,     uid);
  const chapterDir = new Directory(titleDir, ep);

  if (!titleDir.exists)   titleDir.create(  { intermediates: true });
  if (!chapterDir.exists) chapterDir.create({ intermediates: true });

  const titleFile = new File(`${titleDir.uri}/title.json`);
  if (!titleFile.exists) {
    await titleFile.write(JSON.stringify(
      { uid, name: canonicalName, source: meta.source, addedAt: new Date().toISOString() },
      null, 2
    ));
  }

  console.log(`📁 uid: ${uid}  («${canonicalName}»)`);
  console.log("📁 chapter path:", chapterDir.uri);
  console.log(IS_PRODUCTION ? "MODE: PRODUCTION" : "MODE: DEV");

  // ── 4. Download pages ──────────────────────────────────────────────────────
  try {
    for (let i = 0; i < meta.imageUrls.length; i++) {
      if (cancelRef.cancelled) throw new Error("CANCELLED");

      const url  = meta.imageUrls[i];
      const ext  = url.split(".").pop()?.split("?")[0] || "jpg";
      const file = new File(`${chapterDir.uri}/${i + 1}.${ext}`);

      // Skip pages already on disk — makes interrupted downloads resumable
      if (file.exists) {
        onProgress({ message: `${i + 1}.${ext} (resumed)`, current: i + 1, total: meta.imageUrls.length });
        continue;
      }

      let saved     = false;
      let lastError = "";

      for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
        try {
          const res = await fetch(url, { headers: HEADERS[meta.source] });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          const bytes = new Uint8Array(await res.arrayBuffer());
          await file.write(bytes);

          saved = true;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          console.warn(`⚠️  retry ${attempt + 1}/${MAX_RETRY} page ${i + 1}: ${lastError}`);
          if (attempt < MAX_RETRY - 1) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        }
      }

      if (!saved) throw new Error(`Failed page ${i + 1}: ${lastError}`);

      onProgress({ message: `${i + 1}.${ext}`, current: i + 1, total: meta.imageUrls.length });
      console.log(`✅ page ${i + 1}/${meta.imageUrls.length}`);
    }

    // ── 5. info.json last — marks chapter as complete ──────────────────────
    const infoFile = new File(`${chapterDir.uri}/info.json`);
    await infoFile.write(JSON.stringify({
      uid,
      name:    canonicalName,
      author:  edited.author  || meta.author,
      tags:    edited.tags  .split(",").map(t => t.trim()).filter(Boolean),
      genres:  edited.genres.split(",").map(t => t.trim()).filter(Boolean),
      ep,
      source:  meta.source,
      pages:   meta.imageUrls.length,
      savedAt: new Date().toISOString(),
    }, null, 2));

    console.log("🎉 Done:", chapterDir.uri);
    return chapterDir.uri;

  } catch (err) {
    const isCancelled = err instanceof Error && err.message === "CANCELLED";
    console.warn(isCancelled ? "🚫 Cancelled — cleaning up." : "❌ Failed — rolling back.", err);

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