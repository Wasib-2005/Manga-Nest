/**
 * scrapeHentaiCity.ts
 *
 * Scraper for hentaicity.com gallery pages.
 * URL format: https://www.hentaicity.com/gallery/[slug]-[id].html
 *
 * HOW TO TEST before shipping:
 *   Open a browser console on any hentaicity gallery page and run:
 *
 *   copy(document.documentElement.outerHTML)
 *
 *   Paste into a .html file, then run the diagnostic:
 *   Set DIAGNOSTIC = true below and call scrapeHentaiCity(url) once.
 *   Check the console for which extraction strategy fired.
 */

import type { MangaMeta } from "../types/manga";

// ─── Toggle to true if images aren't being found ─────────────────────────────
const DIAGNOSTIC = false;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.hentaicity.com/",
  "Cache-Control": "no-cache",
};

// ─── URL validation ───────────────────────────────────────────────────────────

export const HENTAICITY_PATTERN =
  /^https?:\/\/(?:www\.)?hentaicity\.com\/gallery\/.+\.html/i;

// ─── Mini HTML parsers (no DOM dependency — works in React Native) ────────────

function getMeta(html: string, prop: string): string {
  // property="og:x" content="..."  OR  content="..." property="og:x"
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
  return (
    getMeta(html, "og:title") ||
    getMeta(html, "twitter:title") ||
    (html.match(/<title[^>]*>([^<]{2,120})<\/title>/i)?.[1] ?? "").trim()
  );
}

function getCover(html: string): string {
  return getMeta(html, "og:image") || getMeta(html, "twitter:image");
}

function getAuthor(html: string): string {
  // <meta name="author" ...>
  const meta = getMeta(html, "author");
  if (meta) return meta;

  // Artist / Author label followed by a link
  for (const re of [
    /(?:artist|author|by)[^<]*?<a[^>]*>([^<]{2,60})<\/a>/i,
    /<span[^>]*class=["'][^"']*(?:artist|author)[^"']*["'][^>]*>([^<]{2,60})<\/span>/i,
  ]) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

function getTags(html: string): string[] {
  const tags = new Set<string>();
  // <a href="/tag/xxx">Label</a>  or  /tags/xxx
  const re = /<a[^>]+href=["'][^"']*\/tags?\/[^"']+["'][^>]*>([^<]{1,50})<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = m[1].trim();
    if (t) tags.add(t);
  }
  return Array.from(tags);
}

function getEpisode(url: string, html: string): string {
  // Slug pattern: /gallery/title-NAME-2-more-words-SHORTID.html  → "2"
  // The number before the short alphanumeric ID at the end
  const slugM = url.match(/\/gallery\/.+-(\d+(?:\.\d+)?)-[a-z0-9]{6,}\.html$/i);
  if (slugM) return slugM[1];

  // Title may say "Chapter N" or "Vol. N"
  const title = getTitle(html);
  const chM = title.match(/(?:ch(?:apter)?|vol(?:ume)?|ep(?:isode)?)\s*\.?\s*(\d+(?:\.\d+)?)/i);
  if (chM) return chM[1];

  return "1";
}

// ─── Image URL extraction — tries multiple strategies ────────────────────────

function getImageUrls(html: string): { urls: string[]; strategy: string } {
  // ── Strategy A: JSON array in a var / property assignment ────────────────
  const jsonVarPatterns: RegExp[] = [
    /(?:var\s+|window\.)(?:pages|images?|gallery|urls?|data)\s*=\s*(\[[^\]]{10,}\])/i,
    /"(?:pages|images?|gallery|urls?|imageList)"\s*:\s*(\[[^\]]{10,}\])/i,
    /data-(?:images?|pages?|gallery)\s*=\s*["'](\[[^\]]+\])["']/i,
  ];

  for (const re of jsonVarPatterns) {
    const m = html.match(re);
    if (m) {
      try {
        // The captured group might be the array literal itself
        const raw = m[1].startsWith("[") ? m[1] : `[${m[1]}]`;
        const parsed: unknown = JSON.parse(raw.replace(/'/g, '"'));
        if (Array.isArray(parsed)) {
          const urls = (parsed as string[]).filter(
            (u) => typeof u === "string" && /^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)/i.test(u)
          );
          if (urls.length > 0) return { urls, strategy: "A-json-var" };
        }
      } catch { /* try next */ }

      // Fallback: pull quoted URLs out of the raw match
      const quoted = m[1].match(/"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif)[^"]*)"/gi);
      if (quoted && quoted.length > 0) {
        const urls = quoted.map((q) => q.replace(/"/g, "").trim());
        if (urls.length > 0) return { urls, strategy: "A-json-quoted" };
      }
    }
  }

  // ── Strategy B: __NEXT_DATA__ or __NUXT__ embedded JSON ──────────────────
  for (const scriptRe of [
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    /window\.__(?:NUXT|INITIAL_STATE|STATE)__\s*=\s*(\{[\s\S]{20,}?\});?\s*\n/i,
  ]) {
    const sm = html.match(scriptRe);
    if (sm) {
      try {
        const data = JSON.parse(sm[1]);
        const allUrls: string[] = [];
        // Recursively pull all image-looking string values
        const walk = (obj: unknown) => {
          if (typeof obj === "string") {
            if (/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)/i.test(obj) &&
                !obj.includes("thumb") && !obj.includes("avatar") && !obj.includes("icon")) {
              allUrls.push(obj);
            }
          } else if (Array.isArray(obj)) {
            obj.forEach(walk);
          } else if (obj && typeof obj === "object") {
            Object.values(obj).forEach(walk);
          }
        };
        walk(data);
        if (allUrls.length > 0) return { urls: [...new Set(allUrls)], strategy: "B-next-data" };
      } catch { /* continue */ }
    }
  }

  // ── Strategy C: <img> data-src / src attributes ───────────────────────────
  const imgRe =
    /<img[^>]+(?:data-src|data-lazy-src|data-original|src)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|gif)[^"']*)["']/gi;
  const cUrls: string[] = [];
  let im: RegExpExecArray | null;
  while ((im = imgRe.exec(html)) !== null) {
    const u = im[1];
    // Skip obvious non-page images
    if (!u.includes("thumb") && !u.includes("avatar") &&
        !u.includes("icon") && !u.includes("logo") &&
        !u.includes("banner") && !u.includes("ad")) {
      cUrls.push(u);
    }
  }
  if (cUrls.length > 0) {
    // HentaiCity thumbnails end in "-t.jpg" / "-t.webp" etc.
    // Full-res is the same URL with "-t" removed before the extension.
    const fullRes = [...new Set(cUrls)].map((u) =>
      u.replace(/-t(\.(jpg|jpeg|png|webp|gif))(\?.*)?$/i, "$1$3")
    );
    return { urls: fullRes, strategy: "C-img-tags" };
  }

  // ── Strategy D: all https image URLs anywhere in the page ─────────────────
  const allUrlRe = /["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))['"]/gi;
  const dUrls: string[] = [];
  let am: RegExpExecArray | null;
  while ((am = allUrlRe.exec(html)) !== null) {
    const u = am[1];
    if (!u.includes("thumb") && !u.includes("avatar") &&
        !u.includes("icon") && !u.includes("logo") && !u.includes(".css")) {
      dUrls.push(u);
    }
  }
  const deduped = [...new Set(dUrls)];
  if (deduped.length > 0) return { urls: deduped, strategy: "D-all-urls" };

  return { urls: [], strategy: "none" };
}

// ─── Diagnostic logger ────────────────────────────────────────────────────────

function diagnose(html: string): void {
  console.log("\n════════ HENTAICITY DIAGNOSTIC ════════");
  console.log(`HTML length: ${html.length} chars`);

  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]{0,400})/gi)];
  console.log(`\n▸ ${scripts.length} <script> tags found:`);
  scripts.slice(0, 6).forEach((s, i) =>
    console.log(`  [${i}] attrs="${s[1].trim()}" body="${s[2].slice(0, 200).replace(/\s+/g, " ")}"`)
  );

  const imgs = [...html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi)];
  console.log(`\n▸ ${imgs.length} <img> tags found:`);
  imgs.slice(0, 10).forEach((m, i) => console.log(`  [${i}] ${m[1]}`));

  const metas = [...html.matchAll(/<meta[^>]+(?:og:|twitter:)[^>]+>/gi)];
  console.log(`\n▸ ${metas.length} og/twitter meta tags:`);
  metas.forEach((m, i) => console.log(`  [${i}] ${m[0]}`));

  const varMatches = [...html.matchAll(
    /(?:var\s+|window\.)(pages?|images?|gallery|urls?)\s*=/gi
  )];
  console.log(`\n▸ JS variable assignments that look like image lists:`);
  varMatches.forEach((m, i) => {
    const ctx = html.slice(m.index!, m.index! + 200).replace(/\s+/g, " ");
    console.log(`  [${i}] ${ctx}`);
  });

  console.log("════════ END DIAGNOSTIC ════════\n");
}

// ─── Main export ──────────────────────────────────────────────────────────────

export const scrapeHentaiCity = async (url: string): Promise<MangaMeta> => {
  if (!HENTAICITY_PATTERN.test(url)) {
    throw new Error(
      "Invalid HentaiCity URL.\n" +
        "Expected: https://www.hentaicity.com/gallery/[slug].html"
    );
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────
  let html: string;
  try {
    const res = await fetch(url, { headers: HEADERS });

    if (res.status === 403) {
      throw new Error(
        "HentaiCity returned 403 Forbidden.\n" +
          "The site uses Cloudflare bot protection. This scraper may not work " +
          "without a real browser session / cookies.\n" +
          "Try opening the page in a browser once to get a CF cookie, then retry."
      );
    }
    if (!res.ok) {
      throw new Error(`HentaiCity HTTP ${res.status} for ${url}`);
    }

    html = await res.text();
  } catch (err: any) {
    if (err.message.startsWith("HentaiCity")) throw err;
    throw new Error(`Network error: ${err.message}`);
  }

  if (DIAGNOSTIC) diagnose(html);

  // ── Parse ─────────────────────────────────────────────────────────────────
  const { urls: imageUrls, strategy } = getImageUrls(html);

  if (imageUrls.length === 0) {
    // Auto-diagnose on failure even if DIAGNOSTIC is false
    diagnose(html);
    throw new Error(
      "HentaiCity: could not find any image URLs on this page.\n" +
        "The site structure may have changed, or the page requires JS rendering.\n" +
        "Check the console for diagnostic output and report the HTML structure."
    );
  }

  console.log(`[HentaiCity] strategy=${strategy} images=${imageUrls.length}`);

  const rawTitle = getTitle(html);
  const slug     = url.match(/\/gallery\/(.+)\.html/i)?.[1] ?? "";

  // Strip site suffix from title
  const name = rawTitle
    .replace(/\s*[|—–]\s*(?:hentai\s*city|read\s*online|hentaicity)[^]*/i, "")
    .trim() ||
    slug
      .replace(/-[a-z0-9]{8,}$/i, "")   // strip the short ID at end
      .replace(/-/g, " ")
      .trim();

  return {
    name,
    author:    getAuthor(html),
    tags:      getTags(html),
    genres:    [],
    ep:        getEpisode(url, html),
    source:    "hentaicity",
    imageUrls,
  };
};