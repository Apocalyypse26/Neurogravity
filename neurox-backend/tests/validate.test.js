import { describe, it } from "node:test";
import assert from "node:assert";
import { scanUrlSchema, scanHistoryQuerySchema } from "../src/middleware/validate.js";

describe("validate middleware", () => {
  it("should validate URL schema", () => {
    const result = scanUrlSchema.parse({ url: "https://example.com" });
    assert.equal(result.url, "https://example.com");
  });

  it("should reject invalid URL", () => {
    assert.throws(() => {
      scanUrlSchema.parse({ url: "not-a-url" });
    });
  });

  it("should coerce pagination query params", () => {
    const result = scanHistoryQuerySchema.parse({ page: "2", limit: "20" });
    assert.equal(result.page, 2);
    assert.equal(result.limit, 20);
  });

  it("should apply defaults to pagination", () => {
    const result = scanHistoryQuerySchema.parse({});
    assert.equal(result.page, 1);
    assert.equal(result.limit, 10);
  });

  it("should reject limit over 50", () => {
    assert.throws(() => {
      scanHistoryQuerySchema.parse({ limit: "100" });
    });
  });
});

describe("URL validation", () => {
  it("should reject URLs over 2048 chars", () => {
    const longUrl = "https://example.com/" + "a".repeat(2048);
    assert.throws(() => {
      scanUrlSchema.parse({ url: longUrl });
    });
  });
});