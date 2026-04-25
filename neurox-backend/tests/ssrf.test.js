import { describe, it } from "node:test";
import assert from "node:assert";

describe("SSRF protection", () => {
  const isURLSafe = (url) => {
    const BLOCKED_HOSTS = new Set([
      "localhost",
      "127.0.0.1",
      "::1",
      "0.0.0.0",
      "metadata.google.internal",
      "metadata.google",
    ]);
    const BLOCKED_PROTOCOLS = new Set(["javascript:", "data:", "file:", "vbscript:"]);

    try {
      const parsed = new URL(url);
      if (BLOCKED_PROTOCOLS.has(parsed.protocol)) return false;

      const hostname = parsed.hostname.toLowerCase();
      if (BLOCKED_HOSTS.has(hostname)) return false;

      const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (ipMatch) {
        const first = parseInt(ipMatch[1], 10);
        const second = parseInt(ipMatch[2], 10);
        if (first === 10) return false;
        if (first === 172 && second >= 16 && second <= 31) return false;
        if (first === 192 && second === 168) return false;
        if (first === 127) return false;
      }

      if (hostname.includes(".internal.") || hostname === "169.254.169.254") return false;

      return true;
    } catch {
      return false;
    }
  };

  it("should allow public URLs", () => {
    assert.equal(isURLSafe("https://example.com/logo.png"), true);
    assert.equal(isURLSafe("https://google.com/image.jpg"), true);
  });

  it("should block localhost", () => {
    assert.equal(isURLSafe("http://localhost:3000"), false);
    assert.equal(isURLSafe("http://127.0.0.1:8080"), false);
    assert.equal(isURLSafe("http://::1"), false);
  });

  it("should block private IP ranges", () => {
    assert.equal(isURLSafe("http://10.0.0.1/image.png"), false);
    assert.equal(isURLSafe("http://172.16.0.1/image.png"), false);
    assert.equal(isURLSafe("http://192.168.1.1/image.png"), false);
  });

  it("should block AWS metadata", () => {
    assert.equal(isURLSafe("http://169.254.169.254/latest/meta-data/"), false);
    assert.equal(isURLSafe("http://metadata.google.internal"), false);
  });

  it("should block dangerous protocols", () => {
    assert.equal(isURLSafe("javascript:alert(1)"), false);
    assert.equal(isURLSafe("data:text/html,<script>alert(1)</script>"), false);
    assert.equal(isURLSafe("file:///etc/passwd"), false);
  });
});