// ═══════════════════════════════════════════════════════
// Playwright Scraper — Extracts visual assets from URLs
// ═══════════════════════════════════════════════════════
import { chromium } from "playwright";

// SSRF Protection: Block dangerous URLs
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "metadata.google.internal",
  "metadata.google",
]);

const BLOCKED_PROTOCOLS = new Set(["javascript:", "data:", "file:", "vbscript:"]);

function isURLSafe(url) {
  try {
    const parsed = new URL(url);

    // Block dangerous protocols
    if (BLOCKED_PROTOCOLS.has(parsed.protocol)) {
      return false;
    }

    // Block internal/private IPs
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost variants
    if (BLOCKED_HOSTS.has(hostname)) {
      return false;
    }

    // Block private IP ranges (RFC 1918)
    const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      const first = parseInt(ipMatch[1], 10);
      const second = parseInt(ipMatch[2], 10);

      // 10.0.0.0/8
      if (first === 10) return false;
      // 172.16.0.0/12
      if (first === 172 && second >= 16 && second <= 31) return false;
      // 192.168.0.0/16
      if (first === 192 && second === 168) return false;
      // 127.0.0.0/8 (already blocked, but double-check)
      if (first === 127) return false;
    }

    // Block AWS metadata endpoints
    if (hostname.includes(".internal.") || hostname === "169.254.169.254") {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

let browser = null;

/**
 * Get or launch a shared browser instance.
 */
async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browser;
}

/**
 * Scrape visual assets from a given URL.
 * Extracts: logo, banner/og:image, and up to 3 social post images.
 *
 * @param {string} url - The URL to scrape
 * @returns {Promise<{ images: Buffer[], metadata: object }>}
 */
export async function scrapeUrl(url) {
  if (!url || typeof url !== "string") {
    return { images: [], metadata: { error: "Invalid URL" } };
  }

  if (!isURLSafe(url)) {
    return { images: [], metadata: { error: "URL blocked: internal or unsafe URLs not allowed" } };
  }

  const instance = await getBrowser();
  const context = await instance.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();
  const collectedUrls = new Set();
  const metadata = { url, scrapedAt: new Date().toISOString(), assetCount: 0 };

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(2000);

    // 1. Extract og:image (banner)
    const ogImage = await page.$eval('meta[property="og:image"]', (el) => el.content).catch(() => null);
    if (ogImage) collectedUrls.add(ogImage);

    // 2. Extract logo candidates
    const logoSelectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
      'img[alt*="logo" i]',
      'img[class*="logo" i]',
      'img[id*="logo" i]',
      'header img',
      'nav img',
    ];

    for (const sel of logoSelectors) {
      const src = await page
        .$eval(sel, (el) => el.href || el.src || el.content)
        .catch(() => null);
      if (src && src.startsWith("http")) {
        collectedUrls.add(src);
        break;
      }
    }

    // 3. Extract social post images (first 3 large images on page)
    const allImages = await page.$$eval("img", (imgs) =>
      imgs
        .map((img) => ({
          src: img.src,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
        }))
        .filter((img) => img.src && img.src.startsWith("http") && img.width >= 100 && img.height >= 100)
        .slice(0, 5)
        .map((img) => img.src)
    );

    for (const src of allImages) {
      if (collectedUrls.size >= 5) break;
      collectedUrls.add(src);
    }

    // Download all images as buffers
    const images = [];
    for (const imgUrl of collectedUrls) {
      try {
        const response = await page.request.get(imgUrl, { timeout: 8000 });
        if (response.ok()) {
          const buffer = await response.body();
          if (buffer.length > 0) {
            images.push(buffer);
          }
        }
      } catch {
        // skip failed downloads silently
      }
    }

    metadata.assetCount = images.length;
    return { images, metadata };
  } catch (err) {
    console.error("[SCRAPER] Error scraping", url, err.message);
    return { images: [], metadata: { ...metadata, error: err.message } };
  } finally {
    await context.close();
  }
}

/**
 * Gracefully close the shared browser instance.
 */
export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
