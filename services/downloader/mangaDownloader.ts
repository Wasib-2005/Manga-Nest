import { Platform, PermissionsAndroid } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import type { MangaMeta, EditedMeta, DownloadProgress } from "./types/manga";
import { runSequentialScan } from "./scrape/sequential";
import {
  createManga,
  deleteManga,
  findMangaByName,
  initializeDatabase,
  upsertChapter,
} from "../reader/database";

const MAX_RETRY = 3;

const HEADERS: Record<MangaMeta["source"], Record<string, string>> = {
  mangadex: { "User-Agent": "Mozilla/5.0", Referer: "https://mangadex.org/" },
  nhentai: { "User-Agent": "Mozilla/5.0", Referer: "https://nhentai.net/" },
  sequential: { "User-Agent": "Mozilla/5.0" },
  hentaicity: {
    "User-Agent": "Mozilla/5.0",
    Referer: "https://www.hentaicity.com/",
  },
  hentaiera: { "User-Agent": "Mozilla/5.0", Referer: "https://hentaiera.com/" },
  local: { "User-Agent": "Mozilla/5.0" },
};

function decodeDataUrl(url: string): Uint8Array | null {
  const match = url.match(/^data:image\/[^;]+;base64,(.+)$/);
  if (!match) return null;
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Lock ─────────────────────────────────────────────────────────────────────

let _busy = false;

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  while (_busy) await new Promise((r) => setTimeout(r, 30));
  _busy = true;
  try {
    return await fn();
  } finally {
    _busy = false;
  }
}

// ─── UID helpers ──────────────────────────────────────────────────────────────

function generateUid(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(
    { length: 8 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

function uniqueUid(): string {
  return generateUid();
}

// ─── Permission ───────────────────────────────────────────────────────────────

export async function requestSdcardPermission() {
  if (Platform.OS !== "android") return;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      {
        title: "Storage Permission",
        message: "This app needs access to storage to download manga.",
        buttonNeutral: "Ask Me Later",
        buttonNegative: "Cancel",
        buttonPositive: "OK",
      },
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
  meta: MangaMeta,
  edited: EditedMeta,
  onProgress: (p: DownloadProgress) => void,
  cancelRef: { cancelled: boolean },
  onLog?: (msg: string) => void,
): Promise<string> => {
  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };

  const canonicalName = edited.name.trim();
  const ep = edited.ep.trim();

  // ── 1. Sequential scan ────────────────────────────────────────────────────
  let resolvedMeta = meta;
  if (meta.source === "sequential") {
    if (!meta.scanUrl)
      throw new Error("Missing scan URL for sequential source");
    onProgress({ message: "Scanning for images…", current: 0, total: 0 });
    const urls = await runSequentialScan(
      meta.scanUrl,
      (msg) => {
        log(msg);
        onProgress({ message: msg, current: 0, total: 0 });
      },
      cancelRef,
    );
    resolvedMeta = { ...meta, imageUrls: urls };
  }

  // ── 2. Ensure manga root ───────────────────────────────────────────────────
  const root = new Directory(Paths.document, "manga");
  if (!root.exists) root.create({ intermediates: true });
  await initializeDatabase();

  // ── 3. Registry lookup ────────────────────────────────────────────────────
  const { uid, isNewTitle } = await withLock(async () => {
    const existing = await findMangaByName(canonicalName);

    if (existing) {
      const chapterDir = new Directory(root, `${existing.uid}/${ep}`);
      if (chapterDir.exists) throw new Error("ALREADY_EXISTS");
      return { uid: existing.uid, isNewTitle: false };
    }

    const newUid = uniqueUid();
    await createManga({
      uid: newUid,
      name: canonicalName,
      author: edited.author.trim(),
      source: resolvedMeta.source,
      tags: edited.tags.split(",").map((t) => t.trim()).filter(Boolean),
      genres: edited.genres.split(",").map((t) => t.trim()).filter(Boolean),
      addedAt: new Date().toISOString(),
    });
    return { uid: newUid, isNewTitle: true };
  });

  // ── 4. Directory tree & Title Metadata ─────────────────────────────────────
  const titleDir = new Directory(root, uid);
  const chapterDir = new Directory(titleDir, ep);

  if (!titleDir.exists) titleDir.create({ intermediates: true });
  if (!chapterDir.exists) chapterDir.create({ intermediates: true });

  log(`📁 uid: ${uid}  («${canonicalName}»)`);
  log(`📁 path: ${chapterDir.uri}`);

  // ── 5. Download pages ─────────────────────────────────────────────────────
  try {
    for (let i = 0; i < resolvedMeta.imageUrls.length; i++) {
      if (cancelRef.cancelled) throw new Error("CANCELLED");

      const url = resolvedMeta.imageUrls[i];
      const dataUrlMatch = url.match(/^data:image\/([^;]+)/);
      const ext = dataUrlMatch?.[1] || url.split(".").pop()?.split("?")[0] || "jpg";
      const file = new File(`${chapterDir.uri}/${i + 1}.${ext}`);

      if (file.exists) {
        onProgress({
          message: `${i + 1}.${ext} (resumed)`,
          current: i + 1,
          total: resolvedMeta.imageUrls.length,
        });
        continue;
      }

      let saved = false;
      let lastError = "";

      for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
        try {
          const data = decodeDataUrl(url);
          if (data) {
            await file.write(data);
          } else {
            const res = await fetch(url, {
              headers: HEADERS[resolvedMeta.source],
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            await file.write(new Uint8Array(await res.arrayBuffer()));
          }
          saved = true;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          console.warn(
            `⚠️  retry ${attempt + 1}/${MAX_RETRY} page ${i + 1}: ${lastError}`,
          );
          if (attempt < MAX_RETRY - 1)
            await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }

      if (!saved) throw new Error(`Failed page ${i + 1}: ${lastError}`);

      onProgress({
        message: `${i + 1}.${ext}`,
        current: i + 1,
        total: resolvedMeta.imageUrls.length,
      });
    }

    await upsertChapter(uid, ep, resolvedMeta.imageUrls.length, new Date().toISOString());

    log(`🎉 Done: ${chapterDir.uri}`);
    return chapterDir.uri;
  } catch (err) {
    const isCancelled = err instanceof Error && err.message === "CANCELLED";
    console.warn(isCancelled ? "🚫 Cancelled." : "❌ Rolling back.", err);

    try {
      if (chapterDir.exists) chapterDir.delete();
    } catch {
      /* ignore */
    }

    if (isNewTitle) {
      try {
        await withLock(async () => {
          await deleteManga(uid);
        });
      } catch {
        /* best-effort */
      }
      try {
        if (titleDir.exists) titleDir.delete();
      } catch {
        /* ignore */
      }
    }

    throw err;
  }
};
