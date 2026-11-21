-- ============================================================================
-- Seed & Backfill `gift_registry` Section for Wedding Invitations
-- ============================================================================
-- 1. Updates `app_private.seed_wedding_design_defaults` so every newly created
--    wedding includes the `gift_registry` section (hidden by default until the
--    organizer configures their monetary gift / QR details).
-- 2. Idempotently backfills existing `public.weddings` rows with a
--    `gift_registry` section at `MAX(sort_order) + 1` so existing section
--    ordering and `wedding_sections_wedding_sort_order_key` are preserved.
-- ============================================================================

CREATE OR REPLACE FUNCTION app_private.seed_wedding_design_defaults(
  p_workspace_id uuid,
  p_wedding_id uuid,
  p_partner_one_name text,
  p_partner_two_name text,
  p_venue_name text,
  p_venue_location text,
  p_dress_code text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_p1 text := pg_catalog.btrim(COALESCE(p_partner_one_name, ''));
  v_p2 text := pg_catalog.btrim(COALESCE(p_partner_two_name, ''));
  v_venue text := pg_catalog.btrim(COALESCE(p_venue_name, ''));
  v_loc text := pg_catalog.btrim(COALESCE(p_venue_location, ''));
  v_dress text := pg_catalog.btrim(COALESCE(p_dress_code, ''));
  v_location_summary text;
BEGIN
  v_location_summary := CASE
    WHEN v_loc <> '' THEN v_loc
    WHEN v_venue <> '' THEN v_venue
    ELSE ''
  END;

  INSERT INTO public.wedding_themes (
    wedding_id,
    workspace_id,
    preset_id,
    schema_version,
    token_overrides
  )
  VALUES (
    p_wedding_id,
    p_workspace_id,
    'editorial_ivory'::public.wedding_theme_preset,
    1,
    '{}'::jsonb
  )
  ON CONFLICT (wedding_id) DO NOTHING;

  INSERT INTO public.wedding_sections (
    wedding_id,
    workspace_id,
    section_type,
    sort_order,
    is_visible,
    schema_version,
    content
  )
  VALUES
    (
      p_wedding_id,
      p_workspace_id,
      'hero'::public.wedding_section_type,
      0,
      true,
      1,
      pg_catalog.jsonb_build_object(
        'eyebrow', 'Together with their families',
        'coupleHeadline', v_p1 || ' & ' || v_p2,
        'celebrationSubtitle', 'Joyfully invite you to celebrate their wedding',
        'displayDateLabel', '',
        'locationSummary', v_location_summary,
        'primaryCtaLabel', 'Respond to Invitation',
        'showCountdownBadge', true,
        'alignment', 'center'
      )
    ),
    (
      p_wedding_id,
      p_workspace_id,
      'our_story'::public.wedding_section_type,
      1,
      true,
      1,
      pg_catalog.jsonb_build_object(
        'heading', 'Our Story',
        'leadQuote', 'Every chapter brought us closer to this day.',
        'narrative', 'We are so grateful to gather with our dearest family and friends as we begin this next chapter together.',
        'milestones', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'periodLabel', 'First Chapter',
            'title', 'Where It All Began',
            'description', 'A conversation that turned into years of shared adventures.'
          ),
          pg_catalog.jsonb_build_object(
            'periodLabel', 'The Proposal',
            'title', 'A Joyful Yes',
            'description', 'Surrounded by love and looking ahead to forever.'
          )
        )
      )
    ),
    (
      p_wedding_id,
      p_workspace_id,
      'event_schedule'::public.wedding_section_type,
      2,
      true,
      1,
      pg_catalog.jsonb_build_object(
        'heading', 'Order of Events',
        'timezoneNote', 'All times are shown in the celebration timezone.',
        'items', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'timeLabel', '4:00 PM',
            'title', 'Wedding Ceremony',
            'venueName', CASE WHEN v_venue <> '' THEN v_venue ELSE 'Ceremony Venue' END,
            'address', v_loc,
            'notes', 'Please arrive 20 minutes early to be seated.'
          ),
          pg_catalog.jsonb_build_object(
            'timeLabel', '6:00 PM',
            'title', 'Dinner & Reception',
            'venueName', CASE WHEN v_venue <> '' THEN v_venue ELSE 'Reception Pavilion' END,
            'address', v_loc,
            'notes', 'Cocktails, dinner, and dancing to follow.'
          )
        )
      )
    ),
    (
      p_wedding_id,
      p_workspace_id,
      'venue_travel'::public.wedding_section_type,
      3,
      true,
      1,
      pg_catalog.jsonb_build_object(
        'heading', 'Venue & Travel',
        'ceremonyVenueName', v_venue,
        'ceremonyAddress', v_loc,
        'receptionVenueName', v_venue,
        'receptionAddress', v_loc,
        'directionsNote', 'Complimentary guest parking and drop-off access will be available at the main entrance.',
        'mapUrl', NULL,
        'accommodations', pg_catalog.jsonb_build_array()
      )
    ),
    (
      p_wedding_id,
      p_workspace_id,
      'dress_code'::public.wedding_section_type,
      4,
      (v_dress <> ''),
      1,
      pg_catalog.jsonb_build_object(
        'heading', 'Attire & Palette',
        'dressCodeTitle', CASE WHEN v_dress <> '' THEN v_dress ELSE 'Formal Celebration Attire' END,
        'guidance', 'We invite guests to dress comfortably for an evening of celebration.',
        'swatchHexes', pg_catalog.jsonb_build_array('#C8B6A6', '#8D7B68', '#4A403A')
      )
    ),
    (
      p_wedding_id,
      p_workspace_id,
      'faq_notes'::public.wedding_section_type,
      5,
      false,
      1,
      pg_catalog.jsonb_build_object(
        'heading', 'Questions & Guest Notes',
        'items', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'question', 'When should I submit my RSVP?',
            'answer', 'Kindly respond before the RSVP deadline listed on your invitation.'
          ),
          pg_catalog.jsonb_build_object(
            'question', 'Can I bring an additional guest?',
            'answer', 'Attendance is reserved for the guests named on your household invitation.'
          )
        )
      )
    ),
    (
      p_wedding_id,
      p_workspace_id,
      'gift_registry'::public.wedding_section_type,
      6,
      false,
      1,
      pg_catalog.jsonb_build_object(
        'eyebrow', 'A Day Full of Love',
        'heading', 'We can''t wait to celebrate with you',
        'introMessage', 'Your presence will add joy to this beautiful occasion. Thank you for being part of ' || v_p1 || ' and ' || v_p2 || '''s special day.',
        'noteEyebrow', 'A Note from the Couple',
        'noteHeading', 'With all that we have, we are truly blessed.',
        'noteMessage', 'Your presence and prayers are more than enough. However, for those who wish to give a monetary gift, it would be greatly appreciated.',
        'accounts', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'id', 'starter-gift-account-1',
            'providerName', 'GCash',
            'accountLabel', 'GCash Number',
            'accountNumber', '',
            'accountHolderName', v_p1,
            'qrCodeImageUrl', NULL,
            'qrHeading', 'Scan to Send a Monetary Gift',
            'instructionsTitle', 'How to Send Your Gift',
            'instructions', E'Open your GCash app.\nTap Scan QR.\nScan the QR code above.\nCheck the recipient details before confirming.',
            'disclaimer', 'Please make sure the recipient name is correct before sending.'
          )
        ),
        'showReturnToTop', true,
        'returnToTopLabel', 'Return to the Invitation'
      )
    ),
    (
      p_wedding_id,
      p_workspace_id,
      'rsvp_banner'::public.wedding_section_type,
      7,
      true,
      1,
      pg_catalog.jsonb_build_object(
        'heading', 'Kindly Respond',
        'message', 'Please use your personal household invitation link to confirm attendance and share any dietary notes.',
        'buttonLabel', 'Respond to Invitation',
        'showDeadline', true
      )
    )
  ON CONFLICT (wedding_id, section_type) DO NOTHING;
END;
$$;

ALTER FUNCTION app_private.seed_wedding_design_defaults(uuid, uuid, text, text, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.seed_wedding_design_defaults(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;

-- Idempotently backfill `gift_registry` for all existing weddings without colliding on `sort_order`
DO $$
DECLARE
  v_row record;
  v_next_sort_order integer;
BEGIN
  FOR v_row IN
    SELECT
      w.id,
      w.workspace_id,
      pg_catalog.btrim(COALESCE(w.partner_one_name, '')) AS partner_one_name,
      pg_catalog.btrim(COALESCE(w.partner_two_name, '')) AS partner_two_name
    FROM public.weddings w
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.wedding_sections ws
      WHERE ws.wedding_id = w.id
        AND ws.section_type = 'gift_registry'::public.wedding_section_type
    )
  LOOP
    SELECT COALESCE(MAX(ws.sort_order) + 1, 7)
      INTO v_next_sort_order
      FROM public.wedding_sections ws
     WHERE ws.wedding_id = v_row.id;

    INSERT INTO public.wedding_sections (
      wedding_id,
      workspace_id,
      section_type,
      sort_order,
      is_visible,
      schema_version,
      content
    )
    VALUES (
      v_row.id,
      v_row.workspace_id,
      'gift_registry'::public.wedding_section_type,
      v_next_sort_order,
      false,
      1,
      pg_catalog.jsonb_build_object(
        'eyebrow', 'A Day Full of Love',
        'heading', 'We can''t wait to celebrate with you',
        'introMessage', 'Your presence will add joy to this beautiful occasion. Thank you for being part of ' || v_row.partner_one_name || ' and ' || v_row.partner_two_name || '''s special day.',
        'noteEyebrow', 'A Note from the Couple',
        'noteHeading', 'With all that we have, we are truly blessed.',
        'noteMessage', 'Your presence and prayers are more than enough. However, for those who wish to give a monetary gift, it would be greatly appreciated.',
        'accounts', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'id', 'starter-gift-account-1',
            'providerName', 'GCash',
            'accountLabel', 'GCash Number',
            'accountNumber', '',
            'accountHolderName', v_row.partner_one_name,
            'qrCodeImageUrl', NULL,
            'qrHeading', 'Scan to Send a Monetary Gift',
            'instructionsTitle', 'How to Send Your Gift',
            'instructions', E'Open your GCash app.\nTap Scan QR.\nScan the QR code above.\nCheck the recipient details before confirming.',
            'disclaimer', 'Please make sure the recipient name is correct before sending.'
          )
        ),
        'showReturnToTop', true,
        'returnToTopLabel', 'Return to the Invitation'
      )
    )
    ON CONFLICT (wedding_id, section_type) DO NOTHING;
  END LOOP;
END;
$$;
