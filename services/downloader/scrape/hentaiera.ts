import type { MangaMeta } from "../types/manga";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://hentaiera.com/",
  "Cache-Control": "no-cache",
};

export const HENTAIERA_PATTERN = /^https?:\/\/(?:www\.)?hentaiera\.com\/gallery\/(\d+)\/?$/i;

const EXTENSIONS = ["webp", "jpg", "png", "gif"] as const;
type ImageExt = typeof EXTENSIONS[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMeta(html: string, prop: string): string {
  for (const re of [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"),
  ]) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

function getTitle(html: string): string {
  const h1 = html.match(/<h1[^>]*>([^<]{2,200})<\/h1>/i);
  if (h1?.[1]) return h1[1].trim();
  return (
    getMeta(html, "og:title") ||
    getMeta(html, "twitter:title") ||
    (html.match(/<title[^>]*>([^<]{2,120})<\/title>/i)?.[1] ?? "").trim()
  );
}

function extractSection(html: string, label: string): string[] {
  const sectionRe = new RegExp(
    `<span[^>]*class=["']tags_text["'][^>]*>\\s*${label}\\s*<\\/span>[\\s\\S]*?<div[^>]*class=["']info_tags["'][^>]*>([\\s\\S]*?)<\\/div>`,
    "i"
  );
  const sectionM = html.match(sectionRe);
  if (!sectionM) return [];

  const block = sectionM[1];
  const items: string[] = [];
  const itemRe = /<span[^>]*class=["']item_name["'][^>]*>([\s\S]*?)<\/span>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(block)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, "").trim();
    if (text) items.push(text);
  }
  return items;
}

function getAuthor(html: string): string {
  const artists = extractSection(html, "Artists");
  if (artists.length > 0) return artists.join(", ");
  return getMeta(html, "author");
}

function getTags(html: string): string[] {
  return [
    ...extractSection(html, "Tags"),
    ...extractSection(html, "Characters"),
    ...extractSection(html, "Parodies"),
  ];
}

function getGenres(html: string): string[] {
  return extractSection(html, "Category");
}

// ─── Per-page extension probing ───────────────────────────────────────────────
//
// For each page n, try extensions in order until one returns 200.
// Last successful ext is tried FIRST on the next page (locality optimization —
// galleries usually don't change ext often, so this avoids redundant requests).
//
// page 58 → tries 58.webp ✓  (lastExt = webp)
// page 59 → tries 59.webp ✗ → tries 59.jpg ✓  (lastExt = jpg)
// page 60 → tries 60.jpg ✓  (lastExt = jpg)

async function probePageExt(
  base: string,
  n: number,
  lastExt: ImageExt
): Promise<{ url: string; ext: ImageExt } | null> {
  // Put lastExt first, then the rest in original order
  const ordered = [lastExt, ...EXTENSIONS.filter(e => e !== lastExt)];

  for (const ext of ordered) {
    const url = `${base}${n}.${ext}`;
    try {
      const r = await fetch(url, { method: "HEAD", headers: HEADERS });
      if (r.ok) return { url, ext };
    } catch { /* network blip — try next ext */ }
  }
  return null; // all exts failed for this page
}

async function buildImageUrls(
  base: string,
  totalPages: number
): Promise<string[]> {
  const urls: string[] = [];
  let lastExt: ImageExt = "webp"; // start with most common

  for (let n = 1; n <= totalPages; n++) {
    const result = await probePageExt(base, n, lastExt);
    if (result) {
      urls.push(result.url);
      lastExt = result.ext; // carry forward for next page
    } else {
      // All extensions failed — page might not exist (bonus cover page etc.)
      // Insert a placeholder so page numbering stays correct, skip silently
      console.warn(`[hentaiera] page ${n}: all extensions failed, skipping`);
    }
  }

  return urls;
}

// ─── Gallery info extraction ──────────────────────────────────────────────────

interface GalleryInfo {
  base: string;
  totalPages: number;
}

function extractGalleryInfo(html: string, galleryId: string): GalleryInfo | null {
  // Base CDN URL from thumbnail: https://m11.hentaiera.com/032/lu4acx31s2/7t.jpg
  const thumbRe = /(https?:\/\/[^"'\s]+\/)(\d+)t\.(jpg|jpeg|png|webp|gif)/i;
  const thumbM  = html.match(thumbRe);
  if (!thumbM) return null;
  const base = thumbM[1];

  let totalPages = 0;

  // a) id="pages_btn" — "94 Pages" — most reliable
  const pagesBtnM = html.match(/id=["']pages_btn["'][^>]*>[\s\S]*?(\d+)\s*Pages?<\/button>/i);
  if (pagesBtnM) totalPages = parseInt(pagesBtnM[1], 10);

  // b) Highest /view/{id}/{n}/ href
  if (totalPages < 2) {
    const viewLinkRe = new RegExp(`/view/${galleryId}/(\\d+)/`, "gi");
    let vm: RegExpExecArray | null;
    while ((vm = viewLinkRe.exec(html)) !== null) {
      const n = parseInt(vm[1], 10);
      if (n > totalPages) totalPages = n;
    }
  }

  // c) JS variable fallbacks
  if (totalPages < 2) {
    for (const re of [
      /(?:total_pages|page_count|num_pages|pageCount)\s*[=:]\s*["']?(\d{2,4})["']?/i,
      /data-(?:total|pages|count)=["'](\d{2,4})["']/i,
      /["']total["']\s*:\s*(\d{2,4})/i,
    ]) {
      const m = html.match(re);
      if (m) { totalPages = parseInt(m[1], 10); break; }
    }
  }

  // d) Generic "N pages" text
  if (totalPages < 2) {
    const m = html.match(/(\d{2,4})\s+pages?/i);
    if (m) totalPages = parseInt(m[1], 10);
  }

  if (totalPages < 1) return null;
  return { base, totalPages };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export const scrapeHentaiera = async (url: string): Promise<MangaMeta> => {
  const idMatch = url.match(HENTAIERA_PATTERN);
  if (!idMatch) {
    throw new Error("Invalid hentaiera URL.\nExpected: https://hentaiera.com/gallery/{id}/");
  }
  const galleryId = idMatch[1];

  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 403) throw new Error("hentaiera 403 — Cloudflare is blocking this request.");
  if (!res.ok) throw new Error(`hentaiera HTTP ${res.status}`);
  const html = await res.text();

  let info = extractGalleryInfo(html, galleryId);

  // ── Fallback: scrape /view/{id}/1/ directly ───────────────────────────────
  if (!info) {
    console.warn("[hentaiera] gallery info extraction failed — trying /view/1/ fallback");

    const viewRes = await fetch(`https://hentaiera.com/view/${galleryId}/1/`, { headers: HEADERS });
    if (!viewRes.ok) throw new Error(`hentaiera fallback HTTP ${viewRes.status}`);
    const viewHtml = await viewRes.text();

    const gimgM = viewHtml.match(
      /<img[^>]+id=["']gimg["'][^>]+(?:src|data-src)=["']([^"']+)["']/i
    );
    if (!gimgM) throw new Error("hentaiera: could not find #gimg on view page");

    const fullUrl    = gimgM[1];
    const base       = fullUrl.replace(/\d+\.[^./?]+(\?.*)?$/, "");
    const pagesBtnM  = viewHtml.match(/id=["']pages_btn["'][^>]*>[\s\S]*?(\d+)\s*Pages?<\/button>/i);
    const totalPages = pagesBtnM
      ? parseInt(pagesBtnM[1], 10)
      : (() => {
          const m = viewHtml.match(/(\d{2,4})\s+pages?/i);
          if (!m) throw new Error("hentaiera: could not determine total page count");
          return parseInt(m[1], 10);
        })();

    info = { base, totalPages };
  }

  console.log(`[hentaiera] base=${info.base} pages=${info.totalPages} — probing per page...`);

  const imageUrls = await buildImageUrls(info.base, info.totalPages);

  console.log(`[hentaiera] resolved ${imageUrls.length} URLs`);
  console.log(`[hentaiera] first: ${imageUrls[0]}`);
  console.log(`[hentaiera] last:  ${imageUrls[imageUrls.length - 1]}`);

  const extCounts = imageUrls.reduce<Record<string, number>>((acc, u) => {
    const ext = u.split(".").pop()!;
    acc[ext] = (acc[ext] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`[hentaiera] extensions:`, extCounts);

  const rawTitle = getTitle(html);
  const name = rawTitle
    .replace(/\s*[|—–]\s*(?:hentai\s*era|read\s*online|hentaiera).*/i, "")
    .trim() || `gallery-${galleryId}`;

  return {
    name,
    author:    getAuthor(html),
    tags:      getTags(html),
    genres:    getGenres(html),
    ep:        "1",
    source:    "hentaiera",
    imageUrls,
  };
};