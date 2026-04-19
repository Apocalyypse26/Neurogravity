// ═══════════════════════════════════════════════════════
// Playwright Scraper — Extracts visual assets from URLs
// ═══════════════════════════════════════════════════════
import { chromium } from "playwright";

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
