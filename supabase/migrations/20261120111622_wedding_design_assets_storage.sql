-- ============================================================================
-- Wedding Design Assets Storage Bucket & Workspace-Scoped RLS Policies
-- ============================================================================
-- Supports organizer-uploaded invitation background images, custom TrueType /
-- OpenType / WOFF fonts, and Our Story milestone photographs.
--
-- Path convention:
--   {workspace_id}/{wedding_id}/{category}/{uuid}.{ext}
--   where category IN ('backgrounds', 'fonts', 'milestones')
--
-- Security invariants:
--   1. Public read-only SELECT on `wedding-assets` so published invitations
--      (`/w/:slug`, `/i/:token`) load backgrounds, fonts, and milestone photos
--      without leaking private tables or requiring guest authentication.
--   2. INSERT, UPDATE, and DELETE require `authenticated` membership with
--      `owner`, `admin`, or `editor` role in the leading `{workspace_id}` folder.
--   3. File size capped at 10 MiB at the bucket level.
-- ============================================================================

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'wedding-assets',
  'wedding-assets',
  true,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
    'font/ttf',
    'font/otf',
    'font/woff',
    'font/woff2',
    'application/font-sfnt',
    'application/x-font-ttf',
    'application/x-font-truetype',
    'application/x-font-opentype',
    'application/font-woff',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read access for published invitation rendering
CREATE POLICY wedding_assets_public_select
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'wedding-assets');

-- Workspace editors, admins, and owners can upload assets into their workspace prefix
CREATE POLICY wedding_assets_workspace_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'wedding-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT ws_id::text
      FROM app_private.user_workspace_ids_with_roles(
        ARRAY[
          'owner'::public.workspace_role,
          'admin'::public.workspace_role,
          'editor'::public.workspace_role
        ]
      ) AS ws_id
    )
  );

-- Workspace editors, admins, and owners can update/upsert assets within their workspace prefix
CREATE POLICY wedding_assets_workspace_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'wedding-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT ws_id::text
      FROM app_private.user_workspace_ids_with_roles(
        ARRAY[
          'owner'::public.workspace_role,
          'admin'::public.workspace_role,
          'editor'::public.workspace_role
        ]
      ) AS ws_id
    )
  )
  WITH CHECK (
    bucket_id = 'wedding-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT ws_id::text
      FROM app_private.user_workspace_ids_with_roles(
        ARRAY[
          'owner'::public.workspace_role,
          'admin'::public.workspace_role,
          'editor'::public.workspace_role
        ]
      ) AS ws_id
    )
  );

-- Workspace editors, admins, and owners can delete assets within their workspace prefix
CREATE POLICY wedding_assets_workspace_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'wedding-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT ws_id::text
      FROM app_private.user_workspace_ids_with_roles(
        ARRAY[
          'owner'::public.workspace_role,
          'admin'::public.workspace_role,
          'editor'::public.workspace_role
        ]
      ) AS ws_id
    )
  );
