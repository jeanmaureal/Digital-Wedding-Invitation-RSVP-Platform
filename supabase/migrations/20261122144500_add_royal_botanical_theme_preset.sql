-- ============================================================================
-- Add `royal_botanical` value to `public.wedding_theme_preset` enum
-- ============================================================================
-- Enables the Royal Botanical Envelope & Pearl Stationery theme preset in
-- `public.wedding_themes` and published snapshots.
-- ============================================================================

ALTER TYPE public.wedding_theme_preset ADD VALUE IF NOT EXISTS 'royal_botanical';
