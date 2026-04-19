-- ═══════════════════════════════════════════════════════
-- NEUROX Database Schema — Supabase PostgreSQL
-- Migration: 001_init
-- ═══════════════════════════════════════════════════════

-- Enable pgvector extension for embedding similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- ───────────────────────────────────────────────────────
-- Table: scans
-- Stores every scan result with full score breakdown
-- ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scans (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id       text          UNIQUE NOT NULL,
    image_hash    text          NOT NULL,
    input_type    text          NOT NULL,
    input_url     text,
    trust_score   integer       NOT NULL,
    risk_level    text          NOT NULL,
    verdict       text          NOT NULL,
    scores        jsonb         NOT NULL,
    flags         jsonb         NOT NULL DEFAULT '[]',
    recommendation text,
    ocr_text      text,
    created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scans_scan_id ON scans (scan_id);
CREATE INDEX IF NOT EXISTS idx_scans_image_hash ON scans (image_hash);

-- ───────────────────────────────────────────────────────
-- Table: embeddings
-- Stores CLIP visual embeddings for brand similarity
-- ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS embeddings (
    id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    label       text          NOT NULL,
    embedding   vector(512)   NOT NULL,
    source      text          NOT NULL,
    created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw
    ON embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_embeddings_source ON embeddings (source);

-- ───────────────────────────────────────────────────────
-- Function: match_embeddings
-- Used by brandOriginal.js for similarity search via RPC
-- ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_embeddings(
    query_embedding vector(512),
    match_count int DEFAULT 1
)
RETURNS TABLE (
    id uuid,
    label text,
    similarity float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        e.id,
        e.label,
        1 - (e.embedding <=> query_embedding) AS similarity
    FROM embeddings e
    WHERE e.source = 'known_project'
    ORDER BY e.embedding <=> query_embedding
    LIMIT match_count;
$$;
