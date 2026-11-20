-- ============================================================================
-- Increase `wedding-assets` Storage Bucket File Size Limit to 50 MiB
-- ============================================================================
-- Supports high-resolution wedding photography (backgrounds & story milestones)
-- up to 50 MiB per file.
-- ============================================================================

UPDATE storage.buckets
SET file_size_limit = 52428800
WHERE id = 'wedding-assets';
