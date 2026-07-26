CREATE OR REPLACE FUNCTION v12_test.create_organization_fixture(p_fixture_key text)
RETURNS TABLE (fixture_district_id uuid, fixture_club_id uuid)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_digest text := md5(p_fixture_key);
  v_district_id uuid := md5('district:' || p_fixture_key)::uuid;
  v_club_id uuid := md5('club:' || p_fixture_key)::uuid;
BEGIN
  INSERT INTO public.districts (
    district_id,
    district_code,
    district_name,
    district_country_code
  )
  VALUES (
    v_district_id,
    'TF-' || substr(v_digest, 1, 8),
    'pgTAP 合成測試地區',
    'TW'
  );

  INSERT INTO public.clubs (
    club_id,
    club_district_id,
    club_rotary_number,
    club_name
  )
  VALUES (
    v_club_id,
    v_district_id,
    'TC-' || substr(v_digest, 1, 8),
    'pgTAP 合成測試扶輪社'
  );

  RETURN QUERY SELECT v_district_id, v_club_id;
END;
$$;

COMMENT ON FUNCTION v12_test.create_organization_fixture(text) IS 'Creates deterministic synthetic District and Club rows inside a pgTAP rollback transaction.';
