# 📚 Manga Nest

> A lightweight, extensible manga downloader for Android. Download full series from MangaDex and other image-based sources — built with React Native & Expo.

<div>
  <img src="https://img.shields.io/badge/React_Native-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React Native" />
  <img src="https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white" alt="Expo" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js_20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Android_APK-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Android" />
</div>

---

## 🔗 Quick Links

| | |
|---|---|
| 📱 **Non-developers** | Download the latest APK from the [Releases](https://github.com/Wasib-2005/Manga-Nest/releases) page |
| 💻 **Developers** | See the [Development](#️-for-developers) section below |

---

## ✨ Features

| Feature | Description |
|---|---|
| 📥 **Sequential Downloads** | Automatically grab entire ep |
| 🦊 **MangaDex Support** | Native built-in scraper for MangaDex chapter URLs |
| 🌐 **Generic Image Scraper** | Works with any site serving images via sequential URLs |
| 🔄 **Backup & Restore** | Export your library and restore it anytime or on a new device |
| 🔔 **Version Checker** | Get notified of new releases from within the app |
| 🖼️ **Custom Cover Art** | Set any page as the cover image for any manga |
| 🧩 **Extensible Architecture** | Add new scrapers in minutes with a clean module system |
| 📱 **Cross-Platform Core** | Available as an Android APK; adaptable to a Node.js CLI |

> [!NOTE]
> **Cover art caching:** After changing a cover, fully close the app from your background tasks and reopen it to see the updated image render correctly.

---

## 📖 How to Download (URL Guide)

Always copy the **chapter root URL** from your browser's address bar — not a page-specific reader link.

### Step-by-step

1. **Navigate** to the chapter on MangaDex or a compatible source.
2. **Copy the full URL** from the address bar.
3. **Paste it** into the app's URL field and tap Fetch. A metadata modal will appear — verify the details before continuing.
4. **Set the chapter number manually.** Automatic episode counters are not yet available. For consecutive chapters of the same series, keep the title field *exactly* identical — chapters with matching titles are grouped as a single series.
5. **Refresh your library** once the background download completes to see the new entry.

### Supported URL formats

✅ **These work:**
- `mangadex.org/chapter/[id]` — MangaDex chapter pages
- `site.com/.../g/[title]` or `.../gallery/[id]` — gallery root pages
- `site.com/manga/1.jpg` — sequential direct image links (the app auto-detects `1.jpg → 2.jpg → …`)

❌ **These do not work (page-specific reader URLs):**
- `.../g/[manga-name]/1`
- `.../t/[manga-name]/1`
- `.../r/[manga-name]/1`
- `.../reader/[manga-name]/1`

---

## 🔄 Backup & Restore Guide

### Creating a backup

1. Go to the **Utilities** screen and choose **Backup**.
2. Select a destination directory. The app creates a timestamped subfolder inside it, so multiple rolling backups are preserved safely.

### Restoring a backup

1. Go to **Utilities** and choose **Restore**.
2. Navigate to and select the exact backup folder you want to restore.

### Required backup folder structure

For restoration to succeed, the selected folder must contain:

```
your-backup-folder/
├── 7a916.../          ← Hash-named subfolders holding manga image assets
├── jg4.../
└── index.json         ← REQUIRED — maps library metadata
```

> [!IMPORTANT]
> `index.json` is mandatory. Without it, the restore will fail. `.nomedia` files are optional and will not interfere.

---

## 🛠️ For Developers

### Prerequisites

- **Node.js** `20.x` or higher
- **npm** `10.x` or higher

### Installation

```bash
git clone https://github.com/Wasib-2005/manga-nest.git
cd manga-nest
npm install
```

### Running the dev server

```bash
npx expo start
```

---

## 🧩 Adding a New Scraper

Manga Nest's architecture makes adding sources straightforward — two files to touch.

### 1. Create your scraper

Add a new file at `./services/downloader/scrape/mySource.ts`. Your function must return a `Promise` resolving to a `MangaMeta` object:

```ts
// ./services/downloader/scrape/mySource.ts

export async function scrapeMySource(url: string): Promise<MangaMeta> {
  // Your fetch + DOM parsing / API logic here
  return {
    name: "Manga Title",       // string  — manga title
    author: "Author Name",     // string  — author name
    tags: ["action"],          // string[] — content tags
    genres: ["shonen"],        // string[] — genre classifications
    ep: 1,                     // number  — chapter/episode number
    source: "mySource",        // string  — source site identifier
    imageUrls: [               // string[] — direct image URLs in reading order
      "https://example.com/manga/1.jpg",
      "https://example.com/manga/2.jpg",
    ],
  };
}
```

> [!TIP]
> Return direct, full-resolution image URLs to avoid cascading network overhead during download.

### 2. Register your scraper

Update `./services/downloader/downloaderIndex.ts`:

```ts
import { scrapeMangaDex } from "./scrape/mangadex";
import { scrapeSequential, SEQUENTIAL_PATTERN } from "./scrape/sequential";
import { scrapeMySource } from "./scrape/mySource";    // ← add this

export async function scrapeFromUrl(url: string) {
  if (url.includes("mangadex.org"))  return scrapeMangaDex(url);
  if (url.includes("mysource.com"))  return scrapeMySource(url);   // ← add this
  if (SEQUENTIAL_PATTERN.test(url))  return scrapeSequential(url);
  throw new Error("No scraper available for this URL");
}
```

---

## 🤝 Contributing

- Keep scrapers **modular and self-contained**.
- Prefer returning **direct, full-resolution image URLs** in your scraper payload.
- Found a bug or want to add a feature? Open an issue or submit a pull request!

---

## ⚠️ Disclaimer

> [!WARNING]
> **Legal notice:** I am not responsible for any legal issues, copyright claims, or consequences resulting from the use of this software. This is an experimental hobby project created solely for personal use and learning, with no commercial intent.

> [!CAUTION]
> **Development context:** This is my first app, built with React Native/Expo and AI assistance. No database is used, which may occasionally cause unexpected state behavior. I do not plan to provide ongoing support or regular updates. Fork and modify freely.
