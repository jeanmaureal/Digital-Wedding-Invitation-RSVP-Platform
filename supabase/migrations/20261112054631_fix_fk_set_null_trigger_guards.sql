-- ============================================================================
-- Phase 1 Follow-Up: Allow Foreign-Key `ON DELETE SET NULL` Cleanup on Account Deletion
-- ============================================================================
-- Context:
--   When an organizer transfers workspace ownership to another member and then
--   deletes their `auth.users` account (P1-AC11), PostgreSQL referential integrity
--   executes `ON DELETE SET NULL` updates on:
--     1. `public.workspaces.created_by` (`REFERENCES auth.users(id) ON DELETE SET NULL`)
--     2. `public.workspace_members.invited_by` (`REFERENCES public.profiles(id) ON DELETE SET NULL`)
--
--   Core identity columns (`id`, `workspace_id`, `user_id`, `created_at`) remain
--   strictly immutable, and `created_by` / `invited_by` can never be reassigned to
--   another non-null UUID (`authenticated` holds zero UPDATE privilege on either column).
-- ============================================================================

CREATE OR REPLACE FUNCTION app_private.normalize_workspace_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL)
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
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (NEW.invited_by IS DISTINCT FROM OLD.invited_by AND NEW.invited_by IS NOT NULL)
  THEN
    RAISE EXCEPTION 'IMMUTABLE_MEMBERSHIP_IDENTITY: Membership identity fields cannot be modified after creation.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_private.enforce_workspace_member_immutable_identity() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.enforce_workspace_member_immutable_identity() FROM PUBLIC, anon, authenticated;
