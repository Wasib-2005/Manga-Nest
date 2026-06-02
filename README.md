# Manga-Nest

A lightweight, extensible manga downloader supporting sequential chapter downloads from MangaDex and other image-based manga sources.

---

## Quick Links

- **Non-developers:** Download the latest APK from the [Releases](https://github.com/Wasib-2005/Manga-Nest/releases/tag) page 
- **Developers:** See the [Development](#development) section below

---

## Features

- **Sequential chapter downloads** — grab entire series automatically
- **MangaDex support** — should work
- **Generic image scraper** — works with any site serving images in sequential URLs (e.g., `example.com/mangatitle/1.jpg`)
- **Extensible architecture** — easily add new manga sources
- **Cross-platform** — available as APK for Android and Node.js CLI for desktop

---

## For Users (APK)

No setup required. Simply download the latest APK from the [Releases](https://github.com/Wasib-2005/Manga-Nest/releases) page and install it on your Android device.

---

## For Developers

### Prerequisites

- **Node.js** `20.x` or higher
- **npm** `10.x` or higher

### Installation

```bash
git clone https://github.com/yourusername/manga-nest.git
cd manga-nest
npm install
```

### Run the Development Server

```bash
npx expo start
```

### Adding New Download Sources

To add support for additional manga websites:

1. Create a new scraper in `./services/downloader/scrape/`
2. Register it in `./services/downloader/downloaderIndex.ts`

#### Scraper Interface

Your scraper must return an object matching the `MangaMeta` type:

```ts
{
	name: string;        // Manga title
	author: string;      // Author name
	tags: string[];      // Content tags
	genres: string[];    // Genre classifications
	ep: number;          // Chapter/episode number
	source: string;      // Source website identifier
	imageUrls: string[]; // Array of direct image URLs (in reading order)
}
```

##### Example Scraper

```ts
// ./services/downloader/scrape/myNewSource.ts

export async function scrapeMyNewSource(url: string): Promise<any> {
  // Your scraping logic here
  return {
    name: "Manga Title",
    author: "Author Name",
    tags: ["action", "fantasy"],
    genres: ["shonen", "adventure"],
    ep: 1,
    source: "myNewSource",
    imageUrls: [
      "https://example.com/manga/1.jpg",
      "https://example.com/manga/2.jpg",
    ],
  };
}
```

Register it in `./services/downloader/downloaderIndex.ts`:

```ts
import { scrapeMangaDex } from "./scrape/mangadex";
import { scrapeSequential, SEQUENTIAL_PATTERN } from "./scrape/sequential";
import { scrapeMyNewSource } from "./scrape/myNewSource";

export async function scrapeFromUrl(url: string) {
  if (url.includes("mangadex.org")) return scrapeMangaDex(url);
  if (url.includes("mynewsource.com")) return scrapeMyNewSource(url);
  if (SEQUENTIAL_PATTERN.test(url)) return scrapeSequential(url);
  throw new Error("No scraper available for this URL");
}
```

---

## Development

- Follow the Installation and Run sections above.
- Keep scrapers small and well-tested. Prefer returning full image URLs to avoid additional requests.

---

If you find bugs or want to contribute, open an issue or submit a pull request on the repository.

## Disclaimer

**I am not responsible for any legal issues or consequences resulting from the use of this software. This is a hobby project created solely for my personal use with no intention of earning any profit.**

**Note:** This is my first app. It is built using JavaScript (React Native/Expo), so performance may be laggy. The app was primarily created using AI. I do not use a database, which may cause unexpected issues, and I do not plan to provide ongoing bug fixes.

---
