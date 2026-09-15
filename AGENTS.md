# AGENTS.md

This repository is Manga Nest, a React Native + Expo app for downloading and reading manga from several sources. The project stores relational manga metadata in SQLite and downloaded chapter images in the app's document directory. Lightweight reading settings and progress state use AsyncStorage.

Use this file as the first stop for any code change or feature work.

## 1) Project overview

- App type: React Native / Expo app (`expo-router`)
- Primary language: TypeScript
- Main architecture: tab-based app with a downloader flow and a reader/library flow
- Persistent data model: SQLite + local filesystem + AsyncStorage
- Supported sources today:
  - MangaDex (`mangadex.org`)
  - nhentai (`nhentai.net`)
  - HentaiCity (`hentaicity.com`)
  - Hentaiera (`hentaiera.com`)
  - Sequential image URLs (`.../01.jpg`, `.../02.jpg`, etc.)

The app is designed around a simple pattern:

1. scrape metadata from URL
2. user reviews/edits metadata in a modal
3. downloader saves chapter pages into `Paths.document/manga/<uid>/<ep>/`
4. library reads SQLite rows and chapter image folders to rebuild a UI catalog
5. reader opens a chapter from filesystem and tracks progress in AsyncStorage

## 2) Key repository structure

- `app/` — Expo router entry points and tab screens
  - `app/_layout.tsx` — root navigation wrapper
  - `app/(tabs)/index.tsx` — main reader/library screen and state machine
  - `app/(tabs)/downloader.tsx` — URL queue, scrapers, metadata modal, download flow
  - `app/(tabs)/backup.tsx` — backup/restore tooling
  - `app/(tabs)/checkUpdate.tsx` — self-update checker screen

- `components/ui/` — most of the UI
  - `components/ui/mangaDownloader/*` — URL input, modal, progress UI
  - `components/ui/reader/*` — library grid, chapter picker, edit metadata, reader controls, page viewer

- `services/` — business logic and storage
  - `services/downloader/downloaderIndex.ts` — source router and exported API
  - `services/downloader/mangaDownloader.ts` — main download pipeline and filesystem writes
  - `services/downloader/scrape/*` — site-specific scrapers
  - `services/downloader/types/manga.ts` — core metadata types
  - `services/reader/database.ts` — SQLite schema, legacy JSON migration, and relational CRUD
  - `services/reader/libraryService.ts` — library reading, title metadata, chapter management
  - `services/reader/readingProgressService.ts` — AsyncStorage reading history, hidden manga, progress
  - `services/reader/deleteManga.ts` — delete manga/chapter logic

- `constants/`, `hooks/`, `scripts/` — app config and utility code

## 3) Core data and filesystem conventions

### Downloaded manga layout

The app stores image files under the app document root, typically:

- `SQLite/library.db` — relational database containing manga, chapters, tags, genres, and title-page relations
- `manga/<uid>/<ep>/<pageNum>.jpg|png|webp|gif` — actual image pages

Important:

- `services/reader/database.ts` performs a one-time import from old `index.json`, `title.json`, and `info.json` files, then removes those metadata JSON files.
- The database uses foreign keys and normalized many-to-many tables for tags and genres.
- Deleting a chapter can delete the whole manga if it was the final remaining chapter.

### Reading progress and state

Progress and hidden-manga state are managed in AsyncStorage, not a database.

Relevant patterns:

- `progress:<uid>:<ep>` — fast key for individual chapter progress
- legacy `manga_reading_progress` array kept for compatibility
- `recentlyRead` — newest-first recent entries
- `manga_hidden_list` — hidden manga IDs

When editing reading/progress logic, preserve compatibility with legacy keys.

## 4) How the app works

### Download flow

- The user pastes a chapter URL in `app/(tabs)/downloader.tsx`.
- `lookupManga()` in `services/downloader/downloaderIndex.ts` routes by domain/source.
- Each scraper returns a `MangaMeta` object with the fields defined in `services/downloader/types/manga.ts`.
- The downloader copies metadata into an edit modal, then calls `downloadManga()` in `services/downloader/mangaDownloader.ts`.
- `downloadManga()` ensures the SQLite database is initialized, creates/updates relational manga and chapter rows, and writes each image page to the chapter folder.

Scraper contract:

```ts
export interface MangaMeta {
  name: string;
  author: string;
  tags: string[];
  genres: string[];
  ep: string;
  source: "nhentai" | "mangadex" | "sequential" | "hentaicity" | "hentaiera";
  imageUrls: string[];
  scanUrl?: string;
}
```

### Reader/library flow

- `app/(tabs)/index.tsx` holds the state machine for library vs. reader screens.
- `LibraryScreen` reads the filesystem library via `readMangaLibrary()` and sorts/filter-displays entries.
- Opening a chapter loads `getChapterPages()` and the saved reading progress, then renders `ReaderScreen`.
- Page progress is saved on page changes through `saveReadingProgress()`.
- `deleteManga.ts` and `renameChapterEp()` update both folder structure and metadata when the user changes the library.

## 5) Source-specific implementation notes

### `scrape/sequential.ts`

This is the generic sequential-image URL scanner. It accepts a URL like:

- `https://example.com/manga/001.jpg` or `https://example.com/.../10.jpg`

It looks for `base + index + extension` and keeps scanning forward until two consecutive misses occur. This is used when the source has direct numbered image pages.

### `scrape/mangadex.ts`

- Extracts chapter ID from a MangaDex chapter URL.
- Queries the MangaDex API for chapter metadata and manga metadata.
- Builds a direct-image list from the at-home server data.
- Returns `source: "mangadex"`.

### `scrape/nhentai.ts`

This scraper is more defensive and has fallback parsing logic:

- tries embedded `window._gallery` JSON
- falls back to `__NEXT_DATA__`
- recovers tags from raw HTML when structured fields are missing

Do not simplify this scraper without checking the parsing fallbacks. It is intentionally resilient to site HTML changes.

## 6) Development commands

From the repo root:

```bash
npm install
npx expo start
npm run lint
```

Additional app commands:

```bash
npm run android
npm run ios
npm run web
```

This project is an Expo app, so the expected dev workflow is via `npx expo start` and then running on Android/iOS or emulator.

## 7) Coding conventions

- Prefer TypeScript and explicit types for new data structures.
- Keep scrapers modular and self-contained; do not put site-specific logic in the screen components.
- Keep file-system logic inside `services/` rather than UI components.
- Preserve compatibility with existing stored metadata format when changing serialization.
- When adding a new source, update:
  1. `services/downloader/scrape/<source>.ts`
  2. `services/downloader/downloaderIndex.ts`
  3. `services/downloader/types/manga.ts` if the source enum or metadata shape changes

## 8) Adding a new scraper

Follow the repo’s established pattern:

```ts
import type { MangaMeta } from "../types/manga";

export async function scrapeMySource(url: string): Promise<MangaMeta> {
  // fetch + parse metadata
  return {
    name: "Manga Title",
    author: "Author",
    tags: ["action"],
    genres: ["shonen"],
    ep: "Chapter 1",
    source: "sequential", // or the appropriate source string
    imageUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
  };
}
```

Then register it in `services/downloader/downloaderIndex.ts`:

```ts
if (url.includes("mysource.com")) return scrapeMySource(url);
```

## 9) Common pitfalls

- Do not assume a database exists. The app is built around local files and AsyncStorage.
- The library reads metadata from SQLite and page files from the directory structure. Keep the legacy JSON migration path when changing the schema.
- If you change metadata fields, update the read/write logic in `libraryService.ts` and any UI consumer.
- The reader keeps the library mounted to preserve scroll state; the screen toggles visibility rather than remounting aggressively.
- `downloadManga()` uses a global lock (`_busy`) to prevent parallel library writes; do not bypass it casually.

## 10) Suggested validation checklist before shipping

- Confirm the app still starts with `npx expo start`.
- Confirm the new or modified scraper returns valid `MangaMeta`.
- Confirm SQLite initialization, legacy migration, and library reads still work after your changes.
- Check that the library screen can still read and display stored manga after a refresh.
- Confirm chapter deletion/rename still works and does not leave orphaned files.

## 11) Good default behavior for AI agents

When working in this repo:

- read the relevant service before editing UI
- keep browser/UI code separate from file I/O logic
- respect the local filesystem storage model
- prefer minimal, surgical edits
- test via the app flow or `npm run lint` when practical

This project is a compact but opinionated app; most bugs will be at the boundary between scraper output, file-system state, and UI reading logic. Make changes with that boundary in mind.
