// ═══════════════════════════════════════════════════════
// Validation Middleware — Zod schema validation
// ═══════════════════════════════════════════════════════
import { z } from "zod";

// ── Common Schemas ──────────────────────────────────────
export const ScanIdSchema = z
  .string()
  .regex(/^NRX-\d{8}-[A-Z0-9]{4}$/, "Invalid scan ID format");

export const URLSchema = z
  .string()
  .url("Invalid URL")
  .max(2048, "URL too long");

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

// ── Request Schemas ─────────────────────────────────────
export const scanUrlSchema = z.object({
  url: URLSchema,
});

export const scanHistoryQuerySchema = PaginationSchema;

// ── Validation Helper ──────────────────────────────────
/**
 * Create validation middleware for a schema.
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {string} source - "body" | "query" | "params"
 */
export function validate(schema, source = "body") {
  return async function (req, res, next) {
    try {
      const data = req[source];
      const validated = await schema.parseAsync(data);
      req[source] = validated;
      next();
    } catch (err) {
      if (err.name === "ZodError") {
        return res.status(400).json({
          error: "Validation failed",
          details: err.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          })),
        });
      }
      return res.status(500).json({ error: "Validation error" });
    }
  };
}

/**
 * Validate and return early if invalid.
 */
export function validateSync(schema, source = "body") {
  return async function (req, res, next) {
    try {
      const data = req[source];
      req[source] = schema.parse(data);
      next();
    } catch (err) {
      if (err.name === "ZodError") {
        return res.status(400).json({
          error: "Validation failed",
          details: err.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          })),
        });
      }
      return res.status(500).json({ error: "Validation error" });
    }
  };
}