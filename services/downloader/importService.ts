/**
 * importService.ts — Expo SDK 56
 *
 * Stores imported manga in the SAME structure as downloader.ts:
 *   Paths.document/manga/{uid}/{ep}/
 *
 * Uses the same index.json registry so the library screen finds imports.
 * 
 * PDF read: legacy copyAsync (content:// → cache) then legacy readAsStringAsync
 * Everything else: new expo-file-system API matching downloader.ts exactly
 */

import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystemLegacy from "expo-file-system/legacy";
import { Directory, File, Paths } from "expo-file-system";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImportMeta {
  name: string;
  author: string;
  tags: string;
  genres: string;
  ep: string;
}

export interface ImportProgress {
  message: string;
  current: number;
  total: number;
}

export interface ChapterDir {
  uri: string;
  delete: () => void;
}

// ─── Index types (mirrors downloader.ts) ─────────────────────────────────────

interface IndexEntry {
  uid: string;
  name: string;
  source: string;
  addedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
}

function generateUid(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(
    { length: 8 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

function uniqueUid(existing: IndexEntry[]): string {
  const taken = new Set(existing.map((e) => e.uid));
  let uid: string;
  do { uid = generateUid(); } while (taken.has(uid));
  return uid;
}

// ─── Get manga root (same as downloader.ts) ───────────────────────────────────

function getMangaRoot(): Directory {
  const root = new Directory(Paths.document, "manga");
  if (!root.exists) root.create({ intermediates: true });
  return root;
}

// ─── Index read/write (mirrors downloader.ts exactly) ────────────────────────

async function readIndex(root: Directory): Promise<IndexEntry[]> {
  try {
    const f = new File(`${root.uri}/index.json`);
    if (!f.exists) return [];
    const parsed = JSON.parse(await f.text());
    if (!Array.isArray(parsed)) throw new Error("not an array");
    return parsed.filter((e: IndexEntry) => {
      try { return new Directory(root, e.uid).exists; } catch { return false; }
    });
  } catch (err) {
    console.warn("⚠️ index.json unreadable — rebuilding:", err);
    return rebuildIndex(root);
  }
}

async function rebuildIndex(root: Directory): Promise<IndexEntry[]> {
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
  const tmp = new File(`${root.uri}/index.json.tmp`);
  const real = new File(`${root.uri}/index.json`);
  await tmp.write(JSON.stringify(entries, null, 2));
  if (real.exists) real.delete();
  await tmp.move(real);
}

// ─── Lock (mirrors downloader.ts) ────────────────────────────────────────────

let _busy = false;
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  while (_busy) await new Promise((r) => setTimeout(r, 30));
  _busy = true;
  try { return await fn(); } finally { _busy = false; }
}

// ─── PDF picker ───────────────────────────────────────────────────────────────

export async function pickPDF(): Promise<{ uri: string; name: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    copyToCacheDirectory: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, name: asset.name ?? "document.pdf" };
}

// ─── Read PDF as base64 ───────────────────────────────────────────────────────
// content:// URIs can't be read by the new API — copy via legacy first.

export async function readPdfAsBase64(contentUri: string): Promise<string> {
  const cacheDir = FileSystemLegacy.cacheDirectory;
  if (!cacheDir) throw new Error("cacheDirectory is null");
  const tmpUri = cacheDir + "import_pdf_tmp.pdf";
  await FileSystemLegacy.copyAsync({ from: contentUri, to: tmpUri });
  const base64 = await FileSystemLegacy.readAsStringAsync(tmpUri, {
    encoding: FileSystemLegacy.EncodingType.Base64,
  });
  try { await FileSystemLegacy.deleteAsync(tmpUri, { idempotent: true }); } catch {}
  return base64;
}

// ─── Image picker ─────────────────────────────────────────────────────────────

export async function pickImages(): Promise<string[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("Media library permission denied");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    quality: 1,
    orderedSelection: true,
  });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets
    .slice()
    .sort((a, b) =>
      (a.fileName ?? "").localeCompare(b.fileName ?? "", undefined, { numeric: true }),
    )
    .map((a) => a.uri);
}

// ─── Resolve or create entry (same registry as downloader.ts) ────────────────

export interface LibraryEntry {
  uid: string;
  titleDir: Directory;
  mkChapterDir: (ep: string) => Promise<ChapterDir>;
}

export async function resolveOrCreateEntry(
  titleName: string,
  _type: "pdf" | "images",
): Promise<LibraryEntry> {
  const root = getMangaRoot();
  const canonicalName = titleName.trim();

  const uid = await withLock(async () => {
    const entries = await readIndex(root);
    const normName = canonicalName.toLowerCase();
    const existing = entries.find((e) => e.name.toLowerCase() === normName);

    if (existing) {
      // Title already exists — reuse uid, just add a new chapter
      return existing.uid;
    }

    const newUid = uniqueUid(entries);
    entries.push({
      uid: newUid,
      name: canonicalName,
      source: "local",
      addedAt: new Date().toISOString(),
    });
    await writeIndex(root, entries);
    return newUid;
  });

  const titleDir = new Directory(root, uid);
  if (!titleDir.exists) titleDir.create({ intermediates: true });

  const mkChapterDir = async (ep: string): Promise<ChapterDir> => {
    // ✅ Same path as downloader.ts: manga/{uid}/{ep}/
    const chapterDir = new Directory(titleDir, ep);
    if (!chapterDir.exists) chapterDir.create({ intermediates: true });
    console.log("✅ chapterDir created:", chapterDir.uri);
    return {
      uri: chapterDir.uri,
      delete: () => {
        try { if (chapterDir.exists) chapterDir.delete(); } catch {}
      },
    };
  };

  return { uid, titleDir, mkChapterDir };
}

// ─── Write title.json (same format as downloader.ts) ─────────────────────────

export async function writeTitleJson(
  titleDir: Directory,
  uid: string,
  meta: ImportMeta,
  source: "pdf" | "images",
): Promise<void> {
  const f = new File(`${titleDir.uri}/title.json`);
  await f.write(
    JSON.stringify(
      {
        uid,
        name: meta.name.trim(),
        author: meta.author.trim(),
        tags: meta.tags.split(",").map((t) => t.trim()).filter(Boolean),
        genres: meta.genres.split(",").map((g) => g.trim()).filter(Boolean),
        source,
        addedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

// ─── Write info.json (same format as downloader.ts) ──────────────────────────

export async function writeInfoJson(
  chapterDir: ChapterDir,
  uid: string,
  meta: ImportMeta,
  source: "pdf" | "images",
  pageCount: number,
): Promise<void> {
  const f = new File(`${chapterDir.uri}/info.json`);
  await f.write(
    JSON.stringify(
      {
        uid,
        name: meta.name.trim(),
        author: meta.author.trim(),
        tags: meta.tags.split(",").map((t) => t.trim()).filter(Boolean),
        genres: meta.genres.split(",").map((g) => g.trim()).filter(Boolean),
        ep: meta.ep.trim(),
        source,
        pages: pageCount,
        savedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

// ─── Save one PDF page ────────────────────────────────────────────────────────

export async function savePageFromDataUrl(
  chapterDirUri: string,
  page: number,
  dataUrl: string,
): Promise<void> {
  if (!chapterDirUri || chapterDirUri === "undefined") {
    throw new Error(`chapterDirUri is invalid: "${chapterDirUri}"`);
  }
  const [header, base64Data] = dataUrl.split(",");
  if (!base64Data) throw new Error(`Page ${page}: malformed dataUrl`);

  const ext = header.includes("png") ? "png" : "jpg";
  // Match downloader.ts naming: "1.jpg", "2.jpg" etc (no zero-padding)
  const fileName = `${page}.${ext}`;
  
  const fileUri = chapterDirUri + fileName;

  console.log(`writing page ${page} → ${fileUri}`);

  // Use legacy writeAsStringAsync — handles large base64 reliably
  await FileSystemLegacy.writeAsStringAsync(fileUri, base64Data, {
    encoding: FileSystemLegacy.EncodingType.Base64,
  });
}

// ─── Import from images ───────────────────────────────────────────────────────

export async function importFromImages(
  uris: string[],
  meta: ImportMeta,
  onProgress: (p: ImportProgress) => void,
  cancel: { cancelled: boolean },
  log: (msg: string) => void,
): Promise<string> {
  const { uid, titleDir, mkChapterDir } = await resolveOrCreateEntry(
    meta.name.trim(),
    "images",
  );

  await writeTitleJson(titleDir, uid, meta, "images");

  const chapterDir = await mkChapterDir(meta.ep.trim());
  const total = uris.length;

  for (let i = 0; i < uris.length; i++) {
    if (cancel.cancelled) throw new Error("CANCELLED");

    const src = uris[i];
    const page = i + 1;
    // Match downloader.ts naming: "1.jpg", "2.jpg"
    const ext = src.match(/\.(png|webp|gif)$/i)
      ? src.split(".").pop()!.toLowerCase()
      : "jpg";
    const destUri = chapterDir.uri + `${page}.${ext}`;

    try {
      // legacy copyAsync handles both content:// and file:// sources
      await FileSystemLegacy.copyAsync({ from: src, to: destUri });
      log(`  ✓ image ${page}/${total}`);
    } catch (e: any) {
      log(`  ✗ image ${page}: ${e.message}`);
    }

    onProgress({ message: `Copied ${page} / ${total}`, current: page, total });
  }

  await writeInfoJson(chapterDir, uid, meta, "images", total);
  return chapterDir.uri;
}