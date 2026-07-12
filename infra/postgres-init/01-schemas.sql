-- Medallion layering: raw (bronze archive) -> core (normalized) -> marts (precomputed reads)
CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS marts;
