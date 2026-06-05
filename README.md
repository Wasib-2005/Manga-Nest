# 📚 Manga-Nest

A lightweight, extensible manga downloader supporting sequential chapter downloads from MangaDex and other image-based manga sources. Built using React Native and Expo. 🚀

---

## 🔗 Quick Links

* 📱 **Non-developers:** Download the latest APK from the [Releases](https://github.com/Wasib-2005/Manga-Nest/releases) page 
* 💻 **Developers:** See the [Development](#-for-developers) section below

---

## ✨ Features

* 📥 **Sequential Chapter Downloads** — Automatically grab entire series or consecutive chapters seamlessly.
* 🦊 **MangaDex Support** — Built-in native scrapers for MangaDex URLs.
* 🌐 **Generic Image Scraper** — Works out-of-the-box with any site serving images using sequential URLs (e.g., `example.com/mangatitle/1.jpg`).
* 🔄 **Backup & Restore** — Easily export your library data to a backup file and restore it whenever needed.
* 🔔 **Version Checker** — Stay updated with the latest releases directly within the app.
* 🖼️ **Custom Cover Art** — Change the title page photo of any manga in your library.
  * *⚡ **Note:** Due to caching, you will usually need to completely close and restart the app to see the updated cover art in realtime.*
* 🧩 **Extensible Architecture** — Simple, clean module system to add your own website scrapers.

---

## 📖 How to Download (URL Requirements)

To download successfully, ensure you are copying the direct manga reference, chapter, or gallery page URL.

### ✅ Supported URL Formats:
* **MangaDex Chapters:** `https://mangadex.org/chapter/89ca0955-0afa-40e0-b0ec-64bfbf54c301`
* **Gallery Pages:** Any URL containing a `/g/` or `/gallery/` path that represents the root collection.
* **Sequential Direct Image Links:** You can download a chapter if the target site serves image assets in a continuous numerical sequence. If the first page returns a valid image (e.g., ending in `.../1.jpg` or `.../1.webp`) and continues sequentially with page numbers like `.../2.jpg`, `.../3.webp`, `4`, `5`, etc., the app can grab the sequence automatically!

### ❌ Unsupported URL Formats:
Do **NOT** copy page-specific reader links. The downloader will fail if the URL looks like any of these:
* `.../g/[manga-name]/1`
* `.../t/[manga-name]/1`
* `.../r/[manga-name]/1`
* `.../reader/[manga-name]/1`

---

## 📱 For Users (APK)

No complicated setup required! 🥳
1. Head over to the [Releases](https://github.com/Wasib-2005/Manga-Nest/releases) page.
2. Download the latest `.apk` file.
3. Install it on your Android device (ensure "Install from Unknown Sources" is enabled in your browser/file manager settings).

---

## 🛠️ For Developers

### 📋 Prerequisites

* **Node.js:** `20.x` or higher
* **npm:** `10.x` or higher

### ⚙️ Installation

Clone the repository and install the dependencies:

```bash
git clone [https://github.com/Wasib-2005/manga-nest.git](https://github.com/Wasib-2005/manga-nest.git)
cd manga-nest
npm install
```

### 🏃‍♂️ Run the Development Server

Start the local development server using Expo:

```bash
npx expo start
```

---

## 🧩 Adding New Download Sources

Manga-Nest is designed to make adding new manga scrapers straightforward.

1. Create a new scraper file in `./services/downloader/scrape/` (e.g., `myNewSource.ts`).
2. Register your new scraper module inside `./services/downloader/downloaderIndex.ts`.

### 🗂️ Scraper Interface

Your custom scraper function must return a `Promise` that resolves to an object matching the `MangaMeta` type:

```ts
{
  name: string;        // Manga title
  author: string;      // Author name
  tags: string[];      // Content tags
  genres: string[];    // Genre classifications
  ep: number;          // Chapter/episode number
  source: string;      // Source website identifier
  imageUrls: string[]; // Array of direct image URLs (in consecutive reading order)
}
```

### 💻 Example Scraper Implementation

```ts
// ./services/downloader/scrape/myNewSource.ts

export async function scrapeMyNewSource(url: string): Promise<any> {
  // Insert your fetching and DOM parsing / API logic here
  return {
    name: "Manga Title",
    author: "Author Name",
    tags: ["action", "fantasy"],
    genres: ["shonen", "adventure"],
    ep: 1,
    source: "myNewSource",
    imageUrls: [
      "[https://example.com/manga/1.jpg](https://example.com/manga/1.jpg)",
      "[https://example.com/manga/2.jpg](https://example.com/manga/2.jpg)",
    ],
  };
}
```

### 📝 Registering Your Scraper

Update `./services/downloader/downloaderIndex.ts` to include your new file:

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

## 🤝 Contributing & Guidelines

* Keep your scrapers localized, modular, and well-tested.
* **Optimization tip:** Prefer returning direct, full-resolution image URLs within the scraper payload to avoid cascading network overhead later.
* If you find breaking bugs or want to share features, feel free to open an issue or submit a pull request!

---

## ⚠️ Disclaimer & Creator Notes

**Legal Notice:** I am not responsible for any legal issues, copyright claims, or consequences resulting from the use of this software. This is an entirely experimental hobby project created solely for personal use and learning, with absolutely no commercial intent or profit-earning mechanisms.

**Development Context:** This is my very first application! It is entirely built using JavaScript (React Native/Expo Framework), which means execution and interface transitions may feel laggy or unoptimized at times. The code architecture was heavily assisted by AI tools. Additionally, **this app does not utilize a database setup**, which might occasionally cause unexpected state behavior. **I do not plan to provide ongoing support, regular updates, or bug fixes.** Please fork and modify as needed!