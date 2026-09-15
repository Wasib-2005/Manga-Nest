import { Directory, File, Paths } from "expo-file-system";
import {
  openDatabaseAsync,
  deserializeDatabaseAsync,
  type SQLiteDatabase,
} from "expo-sqlite";
import type { MangaMeta } from "../downloader/types/manga";

export interface DbManga {
  uid: string;
  name: string;
  author: string;
  source: MangaMeta["source"];
  addedAt: string;
  titlePageEp: string | null;
  titlePageNum: number | null;
}

export interface DbChapter {
  uid: string;
  ep: string;
  pages: number;
  savedAt: string;
}

const root = () => new Directory(Paths.document, "manga");
const databaseName = "library.db";
let databasePromise: Promise<SQLiteDatabase> | null = null;
let initPromise: Promise<SQLiteDatabase> | null = null;

export async function serializeDatabase(): Promise<Uint8Array> {
  const db = await initializeDatabase();
  return db.serializeAsync();
}

export async function restoreSerializedDatabase(data: Uint8Array): Promise<void> {
  const source = await deserializeDatabaseAsync(data);
  const target = await initializeDatabase();
  await target.withTransactionAsync(async () => {
    await target.execAsync("PRAGMA foreign_keys = OFF");
    for (const table of ["manga_tags", "manga_genres", "chapters", "tags", "genres", "manga"]) {
      await target.runAsync(`DELETE FROM ${table}`);
    }

    const manga = await source.getAllAsync<Record<string, string | number | null>>("SELECT * FROM manga");
    for (const row of manga) {
      await target.runAsync(
        "INSERT INTO manga (uid, name, name_key, author, source, added_at, title_page_ep, title_page_num) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        row.uid, row.name, row.name_key, row.author, row.source, row.added_at, row.title_page_ep, row.title_page_num,
      );
    }
    for (const table of ["chapters", "tags", "genres", "manga_tags", "manga_genres"]) {
      const rows = await source.getAllAsync<Record<string, string | number | null>>(`SELECT * FROM ${table}`);
      for (const row of rows) {
        const columns = Object.keys(row);
        await target.runAsync(
          `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
          ...columns.map((column) => row[column]),
        );
      }
    }
    await target.execAsync("PRAGMA foreign_keys = ON");
  });
  await source.closeAsync();
}

const normalize = (value: string) => value.trim().toLowerCase();
async function getDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(databaseName);
  }
  return databasePromise;
}

async function migrateLegacyJson(db: SQLiteDatabase): Promise<void> {
  const mangaRoot = root();
  const indexFile = new File(`${mangaRoot.uri}/index.json`);
  if (!indexFile.exists) return;

  const existing = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM manga",
  );
  if ((existing?.count ?? 0) > 0) return;

  const index = JSON.parse(await indexFile.text()) as {
    uid: string;
    name: string;
    source: MangaMeta["source"];
    addedAt: string;
  }[];

  await db.withTransactionAsync(async () => {
    for (const entry of index) {
      const titleFile = new File(`${mangaRoot.uri}/${entry.uid}/title.json`);
      const title = titleFile.exists
        ? JSON.parse(await titleFile.text())
        : entry;
      const tags = Array.isArray(title.tags) ? title.tags : [];
      const genres = Array.isArray(title.genres) ? title.genres : [];

      await db.runAsync(
        `INSERT OR IGNORE INTO manga
          (uid, name, name_key, author, source, added_at, title_page_ep, title_page_num)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        entry.uid,
        title.name ?? entry.name,
        normalize(title.name ?? entry.name),
        title.author ?? "",
        title.source ?? entry.source,
        title.addedAt ?? entry.addedAt,
        title.titlePage?.ep ?? null,
        title.titlePage?.pageNum ?? null,
      );
      await replaceMangaRelations(db, entry.uid, "tag", tags);
      await replaceMangaRelations(db, entry.uid, "genre", genres);

      const titleDir = new Directory(mangaRoot, entry.uid);
      if (!titleDir.exists) continue;
      for (const item of titleDir.list()) {
        if (!(item instanceof Directory)) continue;
        const infoFile = new File(`${item.uri}/info.json`);
        if (!infoFile.exists) continue;
        const info = JSON.parse(await infoFile.text());
        await db.runAsync(
          `INSERT OR IGNORE INTO chapters (uid, ep, pages, saved_at)
           VALUES (?, ?, ?, ?)`,
          entry.uid,
          info.ep ?? item.name,
          info.pages ?? 0,
          info.savedAt ?? new Date().toISOString(),
        );
      }
    }
  });

  for (const entry of index) {
    const titleDir = new Directory(mangaRoot, entry.uid);
    const titleFile = new File(`${titleDir.uri}/title.json`);
    if (titleFile.exists) titleFile.delete();
    if (!titleDir.exists) continue;
    for (const item of titleDir.list()) {
      if (!(item instanceof Directory)) continue;
      const infoFile = new File(`${item.uri}/info.json`);
      if (infoFile.exists) infoFile.delete();
    }
  }
  indexFile.delete();
}

async function replaceMangaRelations(
  db: SQLiteDatabase,
  uid: string,
  kind: "tag" | "genre",
  values: string[],
): Promise<void> {
  const table = kind === "tag" ? "tags" : "genres";
  const joinTable = kind === "tag" ? "manga_tags" : "manga_genres";
  await db.runAsync(`DELETE FROM ${joinTable} WHERE uid = ?`, uid);
  if (!values || values.length === 0) return;
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = normalize(trimmed);
    await db.runAsync(
      `INSERT INTO ${table} (name, name_key) VALUES (?, ?)
       ON CONFLICT(name_key) DO UPDATE SET name = excluded.name`,
      trimmed,
      key,
    );
    const row = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM ${table} WHERE name_key = ?`,
      key,
    );
    if (!row) {
      throw new Error(`Could not resolve ${kind} "${value}" after upsert`);
    }
    await db.runAsync(
      `INSERT OR IGNORE INTO ${joinTable} (uid, ${kind}_id) VALUES (?, ?)`,
      uid,
      row.id,
    );
  }
}

export async function initializeDatabase(): Promise<SQLiteDatabase> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const mangaRoot = root();
    if (!mangaRoot.exists) mangaRoot.create({ intermediates: true });
    const db = await getDatabase();
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS manga (
        uid TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL UNIQUE,
        author TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL,
        added_at TEXT NOT NULL,
        title_page_ep TEXT,
        title_page_num INTEGER
      );
      CREATE TABLE IF NOT EXISTS chapters (
        uid TEXT NOT NULL REFERENCES manga(uid) ON DELETE CASCADE,
        ep TEXT NOT NULL,
        pages INTEGER NOT NULL DEFAULT 0,
        saved_at TEXT NOT NULL,
        PRIMARY KEY (uid, ep)
      );
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS genres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS manga_tags (
        uid TEXT NOT NULL REFERENCES manga(uid) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (uid, tag_id)
      );
      CREATE TABLE IF NOT EXISTS manga_genres (
        uid TEXT NOT NULL REFERENCES manga(uid) ON DELETE CASCADE,
        genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
        PRIMARY KEY (uid, genre_id)
      );
      CREATE INDEX IF NOT EXISTS chapters_uid_idx ON chapters(uid);
      CREATE INDEX IF NOT EXISTS chapters_uid_saved_at_idx ON chapters(uid, saved_at);
      CREATE INDEX IF NOT EXISTS manga_tags_uid_idx ON manga_tags(uid);
      CREATE INDEX IF NOT EXISTS manga_genres_uid_idx ON manga_genres(uid);
    `);
    await migrateLegacyJson(db);
    return db;
  })();
  return initPromise;
}

export async function closeDatabase(): Promise<void> {
  if (!databasePromise) return;
  const db = await databasePromise;
  await db.closeAsync();
  databasePromise = null;
  initPromise = null;
}

export async function findMangaByName(name: string): Promise<DbManga | null> {
  const db = await initializeDatabase();
  return db.getFirstAsync<DbManga>(
    `SELECT uid, name, author, source, added_at AS addedAt,
            title_page_ep AS titlePageEp, title_page_num AS titlePageNum
     FROM manga WHERE name_key = ?`,
    normalize(name),
  );
}

export async function createManga(input: {
  uid: string;
  name: string;
  author: string;
  source: MangaMeta["source"];
  addedAt: string;
  tags: string[];
  genres: string[];
}): Promise<void> {
  const db = await initializeDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO manga (uid, name, name_key, author, source, added_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      input.uid,
      input.name,
      normalize(input.name),
      input.author,
      input.source,
      input.addedAt,
    );
    await replaceMangaRelations(db, input.uid, "tag", input.tags);
    await replaceMangaRelations(db, input.uid, "genre", input.genres);
  });
}

export async function updateManga(
  uid: string,
  updates: Partial<Pick<DbManga, "name" | "author" | "titlePageEp" | "titlePageNum">>,
  tags?: string[],
  genres?: string[],
): Promise<void> {
  const db = await initializeDatabase();
  await db.withTransactionAsync(async () => {
    const fields: string[] = [];
    const args: (string | number | null)[] = [];
    if (updates.name !== undefined) {
      fields.push("name = ?", "name_key = ?");
      args.push(updates.name, normalize(updates.name));
    }
    if (updates.author !== undefined) {
      fields.push("author = ?");
      args.push(updates.author);
    }
    if (updates.titlePageEp !== undefined) {
      fields.push("title_page_ep = ?", "title_page_num = ?");
      args.push(updates.titlePageEp, updates.titlePageNum ?? null);
    }
    if (fields.length) {
      args.push(uid);
      await db.runAsync(`UPDATE manga SET ${fields.join(", ")} WHERE uid = ?`, ...args);
    }
    if (tags) await replaceMangaRelations(db, uid, "tag", tags);
    if (genres) await replaceMangaRelations(db, uid, "genre", genres);
  });
}

export async function clearTitlePage(uid: string): Promise<void> {
  const db = await initializeDatabase();
  await db.runAsync(
    "UPDATE manga SET title_page_ep = NULL, title_page_num = NULL WHERE uid = ?",
    uid,
  );
}

export async function upsertChapter(
  uid: string,
  ep: string,
  pages: number,
  savedAt: string,
): Promise<void> {
  const db = await initializeDatabase();
  await db.withTransactionAsync(async () => {
    const parent = await db.getFirstAsync<{ uid: string }>(
      "SELECT uid FROM manga WHERE uid = ?",
      uid,
    );
    if (!parent) {
      throw new Error(`Cannot save chapter "${ep}": manga "${uid}" does not exist`);
    }
    await db.runAsync(
      `INSERT INTO chapters (uid, ep, pages, saved_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(uid, ep) DO UPDATE SET pages = excluded.pages, saved_at = excluded.saved_at`,
      uid,
      ep,
      pages,
      savedAt,
    );
  });
}

export async function renameChapter(
  uid: string,
  oldEp: string,
  newEp: string,
): Promise<void> {
  const db = await initializeDatabase();
  await db.runAsync("UPDATE chapters SET ep = ? WHERE uid = ? AND ep = ?", newEp, uid, oldEp);
  await db.runAsync(
    "UPDATE manga SET title_page_ep = ? WHERE uid = ? AND title_page_ep = ?",
    newEp,
    uid,
    oldEp,
  );
}

export async function deleteChapter(uid: string, ep: string): Promise<boolean> {
  const db = await initializeDatabase();
  await db.runAsync("DELETE FROM chapters WHERE uid = ? AND ep = ?", uid, ep);
  await db.runAsync(
    "UPDATE manga SET title_page_ep = NULL, title_page_num = NULL WHERE uid = ? AND title_page_ep = ?",
    uid,
    ep,
  );
  const count = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM chapters WHERE uid = ?",
    uid,
  );
  if ((count?.count ?? 0) > 0) return false;
  await db.runAsync("DELETE FROM manga WHERE uid = ?", uid);
  return true;
}

export async function deleteManga(uid: string): Promise<void> {
  const db = await initializeDatabase();
  await db.runAsync("DELETE FROM manga WHERE uid = ?", uid);
}

export async function listManga(): Promise<(DbManga & { tags: string[]; genres: string[]; chapters: DbChapter[] })[]> {
  const db = await initializeDatabase();
  const mangas = await db.getAllAsync<DbManga>(
    `SELECT uid, name, author, source, added_at AS addedAt,
            title_page_ep AS titlePageEp, title_page_num AS titlePageNum
     FROM manga ORDER BY added_at ASC`,
  );
  const [tagRows, genreRows, chapters] = await Promise.all([
    db.getAllAsync<{ uid: string; name: string }>(
      `SELECT mt.uid, t.name FROM tags t
       JOIN manga_tags mt ON mt.tag_id = t.id ORDER BY mt.uid, t.name`,
    ),
    db.getAllAsync<{ uid: string; name: string }>(
      `SELECT mg.uid, g.name FROM genres g
       JOIN manga_genres mg ON mg.genre_id = g.id ORDER BY mg.uid, g.name`,
    ),
    db.getAllAsync<DbChapter>(
      `SELECT uid, ep, pages, saved_at AS savedAt FROM chapters
       ORDER BY uid, saved_at ASC`,
    ),
  ]);
  const tagsByUid = new Map<string, string[]>();
  const genresByUid = new Map<string, string[]>();
  const chaptersByUid = new Map<string, DbChapter[]>();
  for (const row of tagRows) {
    const values = tagsByUid.get(row.uid) ?? [];
    values.push(row.name);
    tagsByUid.set(row.uid, values);
  }
  for (const row of genreRows) {
    const values = genresByUid.get(row.uid) ?? [];
    values.push(row.name);
    genresByUid.set(row.uid, values);
  }
  for (const chapter of chapters) {
    const values = chaptersByUid.get(chapter.uid) ?? [];
    values.push(chapter);
    chaptersByUid.set(chapter.uid, values);
  }
  return mangas.map((manga) => ({
    ...manga,
    tags: tagsByUid.get(manga.uid) ?? [],
    genres: genresByUid.get(manga.uid) ?? [],
    chapters: chaptersByUid.get(manga.uid) ?? [],
  }));
}
