-- ============================================================================
-- Add `gift_registry` value to `public.wedding_section_type` enum
-- ============================================================================
-- PostgreSQL requires new enum values to be committed before they are
-- referenced in DML statements, so this migration is intentionally isolated
-- from the seeding/backfill migration that follows.
-- ============================================================================

ALTER TYPE public.wedding_section_type ADD VALUE IF NOT EXISTS 'gift_registry';
