-- ============================================================================
-- Phase 1: Authentication, Self-Scoped Profiles & Multi-Workspace RBAC
-- ============================================================================
-- Security & Concurrency Invariants:
--   1. Zero `anon` privileges on organizer tables, schemas, or Phase 1 RPCs.
--   2. Internal triggers and RLS helpers reside in unexposed `app_private`.
--   3. All functions enforce `SET search_path = ''`, schema-qualified names,
--      `OWNER TO postgres`, and explicit `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.
--   4. Every workspace retains >= 1 `owner` across role updates, member removals,
--      and `auth.users` account deletions (serialized under READ COMMITTED via
--      parent `public.workspaces` FOR UPDATE + `auth.users` FOR UPDATE / FOR KEY SHARE).
--   5. `public.profiles` is strictly self-readable; workspace co-member email
--      visibility is restricted to `owner` and `admin` via `list_workspace_members`.
-- ============================================================================

-- 1. Harden Phase 0 public functions & schema CREATE privileges
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.set_updated_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.health_check() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.health_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.health_check() TO anon, authenticated;

-- 2. Private internal schema (never exposed via PostgREST `db_schemas`)
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO authenticated;

-- 3. Workspace role enum
CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'editor', 'viewer');

-- 4. Tables & structural constraints
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT profiles_email_normalized_chk CHECK (
    email = pg_catalog.lower(pg_catalog.btrim(email))
    AND pg_catalog.char_length(email) BETWEEN 3 AND 320
    AND pg_catalog.strpos(email, '@') > 1
  ),
  CONSTRAINT profiles_full_name_trimmed_chk CHECK (
    full_name = pg_catalog.btrim(full_name)
    AND pg_catalog.char_length(full_name) <= 120
  )
);

CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT workspaces_slug_key UNIQUE (slug),
  CONSTRAINT workspaces_name_chk CHECK (
    name = pg_catalog.btrim(name)
    AND pg_catalog.char_length(name) BETWEEN 2 AND 80
  ),
  CONSTRAINT workspaces_slug_chk CHECK (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    AND pg_catalog.char_length(slug) BETWEEN 2 AND 63
  )
);

CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.workspace_role NOT NULL,
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT workspace_members_workspace_user_key UNIQUE (workspace_id, user_id)
);

-- 5. Indexes for foreign keys, RLS subqueries & member lookup
CREATE INDEX profiles_email_idx
  ON public.profiles (email);

CREATE INDEX workspaces_created_by_idx
  ON public.workspaces (created_by);

CREATE INDEX workspace_members_user_id_idx
  ON public.workspace_members (user_id);

CREATE INDEX workspace_members_workspace_id_role_idx
  ON public.workspace_members (workspace_id, role);

CREATE INDEX workspace_members_invited_by_idx
  ON public.workspace_members (invited_by);

-- 6. Normalization & immutability triggers (`app_private`)
CREATE OR REPLACE FUNCTION app_private.normalize_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Profile identity and creation timestamp are immutable.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  NEW.email := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.email, '')));
  IF pg_catalog.char_length(NEW.email) < 3
     OR pg_catalog.char_length(NEW.email) > 320
     OR pg_catalog.strpos(NEW.email, '@') <= 1
  THEN
    RAISE EXCEPTION 'PROFILE_EMAIL_REQUIRED: Organizer accounts must have a valid email address.'
      USING ERRCODE = '22023';
  END IF;

  NEW.full_name := pg_catalog.btrim(COALESCE(NEW.full_name, ''));
  IF pg_catalog.char_length(NEW.full_name) > 120 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Full name must be 120 characters or fewer.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.normalize_profile_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.normalize_profile_fields() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER profiles_normalize_fields
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION app_private.normalize_profile_fields();

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION app_private.normalize_workspace_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Workspace identity and creator metadata are immutable.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  NEW.name := pg_catalog.btrim(COALESCE(NEW.name, ''));
  NEW.slug := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.slug, '')));

  IF pg_catalog.char_length(NEW.name) < 2 OR pg_catalog.char_length(NEW.name) > 80 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Workspace name must be between 2 and 80 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(NEW.slug) < 2
     OR pg_catalog.char_length(NEW.slug) > 63
     OR NEW.slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Workspace slug must be 2 to 63 lowercase letters, numbers, or single hyphens.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.normalize_workspace_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.normalize_workspace_fields() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER workspaces_normalize_fields
  BEFORE INSERT OR UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION app_private.normalize_workspace_fields();

CREATE TRIGGER workspaces_set_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION app_private.enforce_workspace_member_immutable_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.invited_by IS DISTINCT FROM OLD.invited_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'IMMUTABLE_MEMBERSHIP_IDENTITY: Membership identity fields cannot be modified after creation.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.enforce_workspace_member_immutable_identity() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.enforce_workspace_member_immutable_identity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER workspace_members_enforce_immutable_identity
  BEFORE UPDATE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION app_private.enforce_workspace_member_immutable_identity();

CREATE TRIGGER workspace_members_set_updated_at
  BEFORE UPDATE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 7. `auth.users` profile sync & sole-owner deletion guard triggers (`app_private`)
CREATE OR REPLACE FUNCTION app_private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_full_name text;
BEGIN
  v_email := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.email, '')));
  IF pg_catalog.char_length(v_email) < 3
     OR pg_catalog.char_length(v_email) > 320
     OR pg_catalog.strpos(v_email, '@') <= 1
  THEN
    RAISE EXCEPTION 'PROFILE_EMAIL_REQUIRED: Organizer accounts must have a valid email address.'
      USING ERRCODE = '22023';
  END IF;

  -- `raw_user_meta_data` is user-editable display input only; never used for authorization.
  v_full_name := pg_catalog.left(
    pg_catalog.btrim(COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')),
    120
  );

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, v_email, v_full_name)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = pg_catalog.now();

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.handle_new_user() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.handle_auth_user_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    v_email := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.email, '')));
    IF pg_catalog.char_length(v_email) < 3
       OR pg_catalog.char_length(v_email) > 320
       OR pg_catalog.strpos(v_email, '@') <= 1
    THEN
      RAISE EXCEPTION 'PROFILE_EMAIL_REQUIRED: Organizer accounts must have a valid email address.'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.profiles
       SET email = v_email
     WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.handle_auth_user_updated() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.handle_auth_user_updated() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.prevent_sole_workspace_owner_user_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Statement 1 (READ COMMITTED): Explicitly acquire FOR UPDATE on `auth.users(OLD.id)`
  -- before PostgreSQL's tuple-delete phase. Any concurrent transaction adding or promoting
  -- `OLD.id` as a workspace member holds FOR KEY SHARE on `auth.users(OLD.id)` and must
  -- finish before Statement 2 takes its command snapshot.
  PERFORM 1
    FROM auth.users u
   WHERE u.id = OLD.id
   FOR UPDATE;

  -- Statement 2 (fresh READ COMMITTED snapshot): Lock all workspaces owned by `OLD.id`
  -- in deterministic UUID order to prevent multi-workspace lock cycles.
  PERFORM 1
    FROM public.workspaces w
   WHERE w.id IN (
     SELECT wm.workspace_id
       FROM public.workspace_members wm
      WHERE wm.user_id = OLD.id
        AND wm.role = 'owner'::public.workspace_role
   )
   ORDER BY w.id ASC
   FOR UPDATE;

  -- Statement 3 (fresh READ COMMITTED snapshot after workspace locks are acquired):
  -- Reject deletion if `OLD.id` remains the sole `owner` of any existing workspace.
  IF EXISTS (
    SELECT 1
      FROM public.workspace_members wm_self
      INNER JOIN public.workspaces w
        ON w.id = wm_self.workspace_id
     WHERE wm_self.user_id = OLD.id
       AND wm_self.role = 'owner'::public.workspace_role
       AND NOT EXISTS (
         SELECT 1
           FROM public.workspace_members wm_other
          WHERE wm_other.workspace_id = wm_self.workspace_id
            AND wm_other.user_id <> OLD.id
            AND wm_other.role = 'owner'::public.workspace_role
       )
  ) THEN
    RAISE EXCEPTION 'SOLE_WORKSPACE_OWNER_DELETE_BLOCKED: Transfer ownership to another member or delete sole-owned workspaces before deleting this account.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$$;

ALTER FUNCTION app_private.prevent_sole_workspace_owner_user_delete() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.prevent_sole_workspace_owner_user_delete() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION app_private.handle_new_user();

CREATE OR REPLACE TRIGGER on_auth_user_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION app_private.handle_auth_user_updated();

CREATE OR REPLACE TRIGGER on_auth_user_before_delete_check_workspaces
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION app_private.prevent_sole_workspace_owner_user_delete();

-- Backfill any pre-existing `auth.users` rows (rejecting missing/invalid emails explicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM auth.users u
     WHERE u.email IS NULL
        OR pg_catalog.char_length(pg_catalog.btrim(u.email)) < 3
        OR pg_catalog.char_length(pg_catalog.btrim(u.email)) > 320
        OR pg_catalog.strpos(pg_catalog.btrim(u.email), '@') <= 1
  ) THEN
    RAISE EXCEPTION 'PROFILE_EMAIL_REQUIRED: Cannot backfill auth.users row with missing or invalid email.'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

INSERT INTO public.profiles (id, email, full_name)
SELECT
  u.id,
  pg_catalog.lower(pg_catalog.btrim(u.email)),
  pg_catalog.left(pg_catalog.btrim(COALESCE(u.raw_user_meta_data ->> 'full_name', '')), 120)
FROM auth.users u
ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      updated_at = pg_catalog.now();

-- 8. Set-returning RLS helper functions (`app_private`)
CREATE OR REPLACE FUNCTION app_private.user_workspace_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT wm.workspace_id
    FROM public.workspace_members wm
   WHERE wm.user_id = (SELECT auth.uid());
$$;

ALTER FUNCTION app_private.user_workspace_ids() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.user_workspace_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.user_workspace_ids() TO authenticated;

CREATE OR REPLACE FUNCTION app_private.user_workspace_ids_with_roles(
  p_roles public.workspace_role[]
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT wm.workspace_id
    FROM public.workspace_members wm
   WHERE wm.user_id = (SELECT auth.uid())
     AND wm.role = ANY(p_roles);
$$;

ALTER FUNCTION app_private.user_workspace_ids_with_roles(public.workspace_role[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.user_workspace_ids_with_roles(public.workspace_role[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.user_workspace_ids_with_roles(public.workspace_role[]) TO authenticated;

-- 9. Explicit table privileges & Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.workspaces FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.workspace_members FROM PUBLIC, anon, authenticated;

GRANT SELECT, UPDATE (full_name) ON TABLE public.profiles TO authenticated;
GRANT SELECT, UPDATE (name, slug), DELETE ON TABLE public.workspaces TO authenticated;
GRANT SELECT ON TABLE public.workspace_members TO authenticated;

-- `public.profiles` policies (strictly self-only)
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- `public.workspaces` policies
CREATE POLICY workspaces_select_member
  ON public.workspaces
  FOR SELECT
  TO authenticated
  USING (id IN (SELECT app_private.user_workspace_ids()));

CREATE POLICY workspaces_update_owner_or_admin
  ON public.workspaces
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT app_private.user_workspace_ids_with_roles(
        ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]
      )
    )
  )
  WITH CHECK (
    id IN (
      SELECT app_private.user_workspace_ids_with_roles(
        ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]
      )
    )
  );

CREATE POLICY workspaces_delete_owner_only
  ON public.workspaces
  FOR DELETE
  TO authenticated
  USING (
    id IN (
      SELECT app_private.user_workspace_ids_with_roles(
        ARRAY['owner'::public.workspace_role]
      )
    )
  );

-- `public.workspace_members` policies (read-only via table; mutations run through atomic RPCs)
CREATE POLICY workspace_members_select_member
  ON public.workspace_members
  FOR SELECT
  TO authenticated
  USING (workspace_id IN (SELECT app_private.user_workspace_ids()));

-- 10. Atomic RBAC RPCs (`public`)

-- 10.1 `create_workspace`: Atomically creates workspace + initial `owner` membership
CREATE OR REPLACE FUNCTION public.create_workspace(
  p_name text,
  p_slug text DEFAULT NULL
)
RETURNS public.workspaces
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_trimmed_name text;
  v_explicit_slug text;
  v_base_slug text;
  v_candidate_slug text;
  v_suffix text;
  v_attempt int;
  v_workspace public.workspaces;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication is required to create a workspace.'
      USING ERRCODE = '42501';
  END IF;

  -- Coordinate with concurrent account deletion (`FOR KEY SHARE` conflicts with `FOR UPDATE`).
  PERFORM 1
    FROM auth.users u
   WHERE u.id = v_caller_id
   FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORGANIZER_NOT_REGISTERED: Organizer account does not exist.'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_caller_id) THEN
    RAISE EXCEPTION 'ORGANIZER_NOT_REGISTERED: Organizer profile does not exist.'
      USING ERRCODE = 'P0002';
  END IF;

  v_trimmed_name := pg_catalog.btrim(COALESCE(p_name, ''));
  IF pg_catalog.char_length(v_trimmed_name) < 2 OR pg_catalog.char_length(v_trimmed_name) > 80 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Workspace name must be between 2 and 80 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF p_slug IS NOT NULL AND pg_catalog.btrim(p_slug) <> '' THEN
    v_explicit_slug := pg_catalog.lower(pg_catalog.btrim(p_slug));
    IF pg_catalog.char_length(v_explicit_slug) < 2
       OR pg_catalog.char_length(v_explicit_slug) > 63
       OR v_explicit_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Workspace slug must be 2 to 63 lowercase letters, numbers, or single hyphens.'
        USING ERRCODE = '22023';
    END IF;

    BEGIN
      INSERT INTO public.workspaces (name, slug, created_by)
      VALUES (v_trimmed_name, v_explicit_slug, v_caller_id)
      RETURNING * INTO v_workspace;
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'WORKSPACE_SLUG_TAKEN: That workspace URL slug is already in use.'
          USING ERRCODE = '23505';
    END;
  ELSE
    v_base_slug := pg_catalog.regexp_replace(
      pg_catalog.lower(v_trimmed_name),
      '[^a-z0-9]+',
      '-',
      'g'
    );
    v_base_slug := pg_catalog.regexp_replace(v_base_slug, '(^-+|-+$)', '', 'g');
    IF pg_catalog.char_length(v_base_slug) < 2 THEN
      v_base_slug := 'workspace';
    END IF;

    v_base_slug := pg_catalog.left(v_base_slug, 54);
    v_base_slug := pg_catalog.regexp_replace(v_base_slug, '-+$', '', 'g');
    IF pg_catalog.char_length(v_base_slug) < 2 THEN
      v_base_slug := 'workspace';
    END IF;

    FOR v_attempt IN 1..8 LOOP
      IF v_attempt = 1 THEN
        v_candidate_slug := v_base_slug;
      ELSE
        v_suffix := pg_catalog.substr(
          pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
          1,
          6
        );
        v_candidate_slug := v_base_slug || '-' || v_suffix;
      END IF;

      BEGIN
        INSERT INTO public.workspaces (name, slug, created_by)
        VALUES (v_trimmed_name, v_candidate_slug, v_caller_id)
        RETURNING * INTO v_workspace;
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          IF v_attempt = 8 THEN
            RAISE EXCEPTION 'WORKSPACE_SLUG_TAKEN: Unable to allocate a unique workspace slug. Please specify a custom slug.'
              USING ERRCODE = '23505';
          END IF;
      END;
    END LOOP;
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
  VALUES (v_workspace.id, v_caller_id, 'owner'::public.workspace_role, v_caller_id);

  RETURN v_workspace;
END;
$$;

ALTER FUNCTION public.create_workspace(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_workspace(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace(text, text) TO authenticated;

-- 10.2 `list_workspace_members`: Member directory with `owner`/`admin`-scoped co-member email visibility
CREATE OR REPLACE FUNCTION public.list_workspace_members(
  p_workspace_id uuid
)
RETURNS TABLE (
  member_id uuid,
  workspace_id uuid,
  user_id uuid,
  role public.workspace_role,
  full_name text,
  email text,
  joined_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role public.workspace_role;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication is required.'
      USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Workspace ID is required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT wm.role
    INTO v_caller_role
    FROM public.workspace_members wm
   WHERE wm.workspace_id = p_workspace_id
     AND wm.user_id = v_caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED: You do not have access to this workspace.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    wm.id AS member_id,
    wm.workspace_id,
    wm.user_id,
    wm.role,
    p.full_name,
    CASE
      WHEN v_caller_role IN ('owner'::public.workspace_role, 'admin'::public.workspace_role)
           OR wm.user_id = v_caller_id
      THEN p.email
      ELSE NULL
    END AS email,
    wm.created_at AS joined_at
  FROM public.workspace_members wm
  INNER JOIN public.profiles p
    ON p.id = wm.user_id
  WHERE wm.workspace_id = p_workspace_id
  ORDER BY
    CASE wm.role
      WHEN 'owner'::public.workspace_role THEN 1
      WHEN 'admin'::public.workspace_role THEN 2
      WHEN 'editor'::public.workspace_role THEN 3
      WHEN 'viewer'::public.workspace_role THEN 4
    END ASC,
    wm.created_at ASC,
    wm.id ASC;
END;
$$;

ALTER FUNCTION public.list_workspace_members(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_workspace_members(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_workspace_members(uuid) TO authenticated;

-- 10.3 `add_workspace_member_by_email`: Adds an existing registered organizer (pending invitations deferred)
CREATE OR REPLACE FUNCTION public.add_workspace_member_by_email(
  p_workspace_id uuid,
  p_email text,
  p_role public.workspace_role
)
RETURNS public.workspace_members
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role public.workspace_role;
  v_normalized_email text;
  v_target_user_id uuid;
  v_inserted_member public.workspace_members;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication is required.'
      USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL OR p_role IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Workspace ID and target role are required.'
      USING ERRCODE = '22023';
  END IF;

  v_normalized_email := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email, '')));
  IF pg_catalog.char_length(v_normalized_email) < 3
     OR pg_catalog.char_length(v_normalized_email) > 320
     OR pg_catalog.strpos(v_normalized_email, '@') <= 1
  THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Enter a valid organizer email address.'
      USING ERRCODE = '22023';
  END IF;

  -- Step 1: Lock parent workspace row first as serialization point.
  PERFORM 1
    FROM public.workspaces w
   WHERE w.id = p_workspace_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED: You do not have access to this workspace.'
      USING ERRCODE = '42501';
  END IF;

  -- Step 2: Re-read caller's committed role under the workspace lock.
  SELECT wm.role
    INTO v_caller_role
    FROM public.workspace_members wm
   WHERE wm.workspace_id = p_workspace_id
     AND wm.user_id = v_caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED: You do not have access to this workspace.'
      USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('owner'::public.workspace_role, 'admin'::public.workspace_role) THEN
    RAISE EXCEPTION 'INSUFFICIENT_WORKSPACE_ROLE: Only workspace owners and admins can add members.'
      USING ERRCODE = '42501';
  END IF;

  IF v_caller_role = 'admin'::public.workspace_role
     AND p_role IN ('owner'::public.workspace_role, 'admin'::public.workspace_role)
  THEN
    RAISE EXCEPTION 'INSUFFICIENT_WORKSPACE_ROLE: Workspace admins can only assign editor or viewer roles.'
      USING ERRCODE = '42501';
  END IF;

  -- Step 3: Resolve registered organizer profile & coordinate with `auth.users` deletion.
  SELECT p.id
    INTO v_target_user_id
    FROM public.profiles p
   WHERE p.email = v_normalized_email;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORGANIZER_NOT_REGISTERED: No registered organizer account matches that email yet.'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1
    FROM auth.users u
   WHERE u.id = v_target_user_id
   FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORGANIZER_NOT_REGISTERED: No registered organizer account matches that email yet.'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.workspace_members wm
     WHERE wm.workspace_id = p_workspace_id
       AND wm.user_id = v_target_user_id
  ) THEN
    RAISE EXCEPTION 'MEMBER_ALREADY_EXISTS: That organizer is already a member of this workspace.'
      USING ERRCODE = '23505';
  END IF;

  BEGIN
    INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
    VALUES (p_workspace_id, v_target_user_id, p_role, v_caller_id)
    RETURNING * INTO v_inserted_member;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'MEMBER_ALREADY_EXISTS: That organizer is already a member of this workspace.'
        USING ERRCODE = '23505';
  END;

  RETURN v_inserted_member;
END;
$$;

ALTER FUNCTION public.add_workspace_member_by_email(uuid, text, public.workspace_role) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.add_workspace_member_by_email(uuid, text, public.workspace_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_workspace_member_by_email(uuid, text, public.workspace_role) TO authenticated;

-- 10.4 `update_workspace_member_role`: Serialized role mutation enforcing last-owner invariant
CREATE OR REPLACE FUNCTION public.update_workspace_member_role(
  p_workspace_id uuid,
  p_member_user_id uuid,
  p_new_role public.workspace_role
)
RETURNS public.workspace_members
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role public.workspace_role;
  v_target_member public.workspace_members;
  v_updated_member public.workspace_members;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication is required.'
      USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL OR p_member_user_id IS NULL OR p_new_role IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Workspace ID, member user ID, and new role are required.'
      USING ERRCODE = '22023';
  END IF;

  -- Step 1: Lock parent workspace row first.
  PERFORM 1
    FROM public.workspaces w
   WHERE w.id = p_workspace_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED: You do not have access to this workspace.'
      USING ERRCODE = '42501';
  END IF;

  -- Step 2: Re-read caller's committed role.
  SELECT wm.role
    INTO v_caller_role
    FROM public.workspace_members wm
   WHERE wm.workspace_id = p_workspace_id
     AND wm.user_id = v_caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED: You do not have access to this workspace.'
      USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('owner'::public.workspace_role, 'admin'::public.workspace_role) THEN
    RAISE EXCEPTION 'INSUFFICIENT_WORKSPACE_ROLE: Only workspace owners and admins can change member roles.'
      USING ERRCODE = '42501';
  END IF;

  -- Step 3: Lock target membership row & coordinate with `auth.users` deletion.
  SELECT wm.*
    INTO v_target_member
    FROM public.workspace_members wm
   WHERE wm.workspace_id = p_workspace_id
     AND wm.user_id = p_member_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKSPACE_MEMBER_NOT_FOUND: Workspace member not found.'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1
    FROM auth.users u
   WHERE u.id = p_member_user_id
   FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKSPACE_MEMBER_NOT_FOUND: Workspace member account no longer exists.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Step 4: Enforce RBAC hierarchy.
  IF v_caller_role = 'admin'::public.workspace_role
     AND (
       v_target_member.role IN ('owner'::public.workspace_role, 'admin'::public.workspace_role)
       OR p_new_role IN ('owner'::public.workspace_role, 'admin'::public.workspace_role)
     )
  THEN
    RAISE EXCEPTION 'INSUFFICIENT_WORKSPACE_ROLE: Workspace admins cannot modify or assign owner or admin roles.'
      USING ERRCODE = '42501';
  END IF;

  -- Step 5: Enforce last-owner invariant before demoting an owner.
  IF v_target_member.role = 'owner'::public.workspace_role
     AND p_new_role <> 'owner'::public.workspace_role
     AND NOT EXISTS (
       SELECT 1
         FROM public.workspace_members wm_other
        WHERE wm_other.workspace_id = p_workspace_id
          AND wm_other.user_id <> p_member_user_id
          AND wm_other.role = 'owner'::public.workspace_role
     )
  THEN
    RAISE EXCEPTION 'LAST_WORKSPACE_OWNER_REQUIRED: At least one workspace owner must remain. Promote another owner first.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.workspace_members
     SET role = p_new_role
   WHERE id = v_target_member.id
   RETURNING * INTO v_updated_member;

  RETURN v_updated_member;
END;
$$;

ALTER FUNCTION public.update_workspace_member_role(uuid, uuid, public.workspace_role) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_workspace_member_role(uuid, uuid, public.workspace_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_workspace_member_role(uuid, uuid, public.workspace_role) TO authenticated;

-- 10.5 `remove_workspace_member`: Serialized member removal / leave enforcing last-owner invariant
CREATE OR REPLACE FUNCTION public.remove_workspace_member(
  p_workspace_id uuid,
  p_member_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role public.workspace_role;
  v_target_member public.workspace_members;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication is required.'
      USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL OR p_member_user_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Workspace ID and member user ID are required.'
      USING ERRCODE = '22023';
  END IF;

  -- Step 1: Lock parent workspace row first.
  PERFORM 1
    FROM public.workspaces w
   WHERE w.id = p_workspace_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED: You do not have access to this workspace.'
      USING ERRCODE = '42501';
  END IF;

  -- Step 2: Re-read caller's committed role.
  SELECT wm.role
    INTO v_caller_role
    FROM public.workspace_members wm
   WHERE wm.workspace_id = p_workspace_id
     AND wm.user_id = v_caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED: You do not have access to this workspace.'
      USING ERRCODE = '42501';
  END IF;

  -- Step 3: Lock target membership row.
  SELECT wm.*
    INTO v_target_member
    FROM public.workspace_members wm
   WHERE wm.workspace_id = p_workspace_id
     AND wm.user_id = p_member_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKSPACE_MEMBER_NOT_FOUND: Workspace member not found.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Step 4: Enforce RBAC (self-leave OR authorized admin/owner removal).
  IF p_member_user_id <> v_caller_id THEN
    IF v_caller_role = 'owner'::public.workspace_role THEN
      NULL;
    ELSIF v_caller_role = 'admin'::public.workspace_role
          AND v_target_member.role IN ('editor'::public.workspace_role, 'viewer'::public.workspace_role)
    THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'INSUFFICIENT_WORKSPACE_ROLE: You do not have permission to remove this workspace member.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Step 5: Enforce last-owner invariant (applies to both self-leave and owner removal).
  IF v_target_member.role = 'owner'::public.workspace_role
     AND NOT EXISTS (
       SELECT 1
         FROM public.workspace_members wm_other
        WHERE wm_other.workspace_id = p_workspace_id
          AND wm_other.user_id <> p_member_user_id
          AND wm_other.role = 'owner'::public.workspace_role
     )
  THEN
    RAISE EXCEPTION 'LAST_WORKSPACE_OWNER_REQUIRED: At least one workspace owner must remain. Transfer ownership or delete the workspace instead.'
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.workspace_members
   WHERE id = v_target_member.id;
END;
$$;

ALTER FUNCTION public.remove_workspace_member(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.remove_workspace_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_workspace_member(uuid, uuid) TO authenticated;
