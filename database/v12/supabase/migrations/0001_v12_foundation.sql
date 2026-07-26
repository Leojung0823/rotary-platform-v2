-- ============================================================================
-- Rotary Platform Database Foundation V1.2
-- Scope: Identity & Admin core schema
-- Database: PostgreSQL / Supabase
-- Generated: 2026-07-22
--
-- This isolated migration supersedes prior V1.0/V1.1 schema design notes.
-- It contains tables, columns, constraints, indexes, comments, and timestamp
-- triggers. RLS policies and cross-table transaction functions are intentionally
-- outside this Database Foundation change and belong in later reviewed work.
--
-- Security decisions reflected here:
--   1. accounts.account_auth_user_id is an external weak reference; no FK.
--   2. account_sessions.account_session_auth_session_id is a weak reference.
--   3. Invitation plaintext tokens and HMAC secrets are never stored here.
--      HMAC-SHA-256 is calculated only in a trusted backend / Edge Function.
--   4. Person matching uses plaintext only inside a controlled function at
--      request time; only a request digest for deduplication is persisted.
--   5. Person merge is unsupported. Human account anonymization preserves
--      account_person_id while the Person row is anonymized in place.
--   6. Devices are separated from Account Devices to support shared devices.
-- ============================================================================

BEGIN;
SET TIME ZONE 'UTC';

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS v12_meta;
REVOKE ALL ON SCHEMA v12_meta FROM PUBLIC;
SET search_path = public, extensions, pg_catalog;

CREATE TABLE v12_meta.seed_versions (
  seed_version text CONSTRAINT pk_seed_versions PRIMARY KEY,
  seed_description text NOT NULL,
  seed_applied_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_seed_versions__version CHECK (
    seed_version ~ '^[0-9]{4}_[a-z0-9_]+$'
  )
);

COMMENT ON TABLE v12_meta.seed_versions IS 'Records each deterministic V1.2 seed unit that has been applied successfully.';
COMMENT ON COLUMN v12_meta.seed_versions.seed_version IS 'Stable ordered seed identifier matching the seed filename without its extension.';
COMMENT ON COLUMN v12_meta.seed_versions.seed_description IS 'Non-sensitive description of the deterministic seed unit.';
COMMENT ON COLUMN v12_meta.seed_versions.seed_applied_at IS 'Timestamp of the first successful application; reruns do not rewrite it.';
REVOKE ALL ON TABLE v12_meta.seed_versions FROM PUBLIC;

-- --------------------------------------------------------------------------
-- Mutable tables use table-specific typed updated_at trigger functions.
-- Event/ledger tables intentionally do not use updated_at triggers.
-- --------------------------------------------------------------------------

-- ============================================================================
-- 1. ORGANIZATION DOMAIN
-- ============================================================================

CREATE TABLE public.districts (
  district_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_dis PRIMARY KEY,
  district_code text NOT NULL,
  district_name text NOT NULL,
  district_english_name text,
  district_country_code text NOT NULL,
  district_timezone text NOT NULL DEFAULT 'Asia/Taipei',
  district_status text NOT NULL DEFAULT 'active',
  district_created_at timestamptz NOT NULL DEFAULT now(),
  district_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_districts__code UNIQUE (district_code),
  CONSTRAINT ck_districts__country_code CHECK (district_country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT ck_districts__status CHECK (district_status IN ('active', 'inactive'))
);

COMMENT ON TABLE public.districts IS 'Stores Rotary district organizations, such as Rotary International District 3490.';
COMMENT ON COLUMN public.districts.district_id IS 'Permanent unique identifier of the Rotary district.';
COMMENT ON COLUMN public.districts.district_code IS 'Official district number or code, such as 3490.';
COMMENT ON COLUMN public.districts.district_name IS 'Official Chinese display name of the district.';
COMMENT ON COLUMN public.districts.district_english_name IS 'Official English display name of the district.';
COMMENT ON COLUMN public.districts.district_country_code IS 'ISO 3166-1 alpha-2 country or region code, such as TW.';
COMMENT ON COLUMN public.districts.district_timezone IS 'Default IANA timezone used for district-level dates and scheduling.';
COMMENT ON COLUMN public.districts.district_status IS 'Lifecycle status of the district: active or inactive.';
COMMENT ON COLUMN public.districts.district_created_at IS 'Timestamp when the district row was created.';
COMMENT ON COLUMN public.districts.district_updated_at IS 'Timestamp when the district row was last modified.';

CREATE OR REPLACE FUNCTION public.set_dis_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.district_updated_at := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_districts__updated_at
BEFORE UPDATE ON public.districts
FOR EACH ROW EXECUTE FUNCTION public.set_dis_updated_at();

CREATE TABLE public.clubs (
  club_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_club PRIMARY KEY,
  club_district_id uuid NOT NULL,
  club_rotary_number text NOT NULL,
  club_name text NOT NULL,
  club_english_name text,
  club_short_name text,
  club_charter_date date,
  club_timezone text NOT NULL DEFAULT 'Asia/Taipei',
  club_locale text NOT NULL DEFAULT 'zh-TW',
  club_status text NOT NULL DEFAULT 'active',
  club_created_by_account_id uuid,
  club_updated_by_account_id uuid,
  club_created_at timestamptz NOT NULL DEFAULT now(),
  club_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_clubs__districts FOREIGN KEY (club_district_id)
    REFERENCES public.districts(district_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uq_clubs__rotary_number UNIQUE (club_rotary_number),
  CONSTRAINT ck_clubs__status CHECK (club_status IN ('active', 'inactive', 'suspended')),
  CONSTRAINT ck_clubs__locale CHECK (char_length(club_locale) BETWEEN 2 AND 20)
);

COMMENT ON TABLE public.clubs IS 'Stores Rotary clubs and their district affiliation.';
COMMENT ON COLUMN public.clubs.club_id IS 'Permanent unique identifier of the Rotary club.';
COMMENT ON COLUMN public.clubs.club_district_id IS 'District to which the club belongs.';
COMMENT ON COLUMN public.clubs.club_rotary_number IS 'Official Rotary club number used for organization identification and integration.';
COMMENT ON COLUMN public.clubs.club_name IS 'Official Chinese name of the club.';
COMMENT ON COLUMN public.clubs.club_english_name IS 'Official English name of the club.';
COMMENT ON COLUMN public.clubs.club_short_name IS 'Short display name used in compact interfaces and notifications.';
COMMENT ON COLUMN public.clubs.club_charter_date IS 'Official charter date of the club.';
COMMENT ON COLUMN public.clubs.club_timezone IS 'Default IANA timezone of the club.';
COMMENT ON COLUMN public.clubs.club_locale IS 'Default locale of the club, such as zh-TW.';
COMMENT ON COLUMN public.clubs.club_status IS 'Lifecycle status of the club: active, inactive, or suspended.';
COMMENT ON COLUMN public.clubs.club_created_by_account_id IS 'Account that created the club record; FK is added after accounts exists.';
COMMENT ON COLUMN public.clubs.club_updated_by_account_id IS 'Account that last modified the club record; FK is added after accounts exists.';
COMMENT ON COLUMN public.clubs.club_created_at IS 'Timestamp when the club row was created.';
COMMENT ON COLUMN public.clubs.club_updated_at IS 'Timestamp when the club row was last modified.';

CREATE INDEX ix_clubs__district ON public.clubs (club_district_id);
CREATE OR REPLACE FUNCTION public.set_club_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.club_updated_at := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_clubs__updated_at
BEFORE UPDATE ON public.clubs
FOR EACH ROW EXECUTE FUNCTION public.set_club_updated_at();

CREATE TABLE public.club_terms (
  club_term_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_ct PRIMARY KEY,
  club_term_club_id uuid NOT NULL,
  club_term_start_year smallint NOT NULL,
  club_term_end_year smallint NOT NULL,
  club_term_starts_on date NOT NULL,
  club_term_ends_on date NOT NULL,
  club_term_status text NOT NULL DEFAULT 'draft',
  club_term_created_at timestamptz NOT NULL DEFAULT now(),
  club_term_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_club_terms__clubs FOREIGN KEY (club_term_club_id)
    REFERENCES public.clubs(club_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uq_club_terms__club_start_year UNIQUE (club_term_club_id, club_term_start_year),
  CONSTRAINT ck_club_terms__years CHECK (club_term_end_year = club_term_start_year + 1),
  CONSTRAINT ck_club_terms__dates CHECK (club_term_ends_on > club_term_starts_on),
  CONSTRAINT ck_club_terms__status CHECK (
    club_term_status IN ('draft', 'confirmed', 'active', 'closed', 'cancelled', 'invalid')
  ),
  CONSTRAINT ex_club_terms__no_overlap EXCLUDE USING gist (
    club_term_club_id WITH =,
    daterange(club_term_starts_on, club_term_ends_on + 1, '[)') WITH &&
  ) WHERE (club_term_status IN ('confirmed', 'active', 'closed'))
);

COMMENT ON TABLE public.club_terms IS 'Stores one Rotary year for a club and prevents overlap among confirmed, active, and closed terms.';
COMMENT ON COLUMN public.club_terms.club_term_id IS 'Permanent unique identifier of the club term.';
COMMENT ON COLUMN public.club_terms.club_term_club_id IS 'Club to which the Rotary year belongs.';
COMMENT ON COLUMN public.club_terms.club_term_start_year IS 'Calendar year in which the Rotary year starts.';
COMMENT ON COLUMN public.club_terms.club_term_end_year IS 'Calendar year in which the Rotary year ends; must equal start year plus one.';
COMMENT ON COLUMN public.club_terms.club_term_starts_on IS 'Inclusive business start date of the Rotary year.';
COMMENT ON COLUMN public.club_terms.club_term_ends_on IS 'Inclusive business end date of the Rotary year.';
COMMENT ON COLUMN public.club_terms.club_term_status IS 'Lifecycle status: draft, confirmed, active, closed, cancelled, or invalid.';
COMMENT ON COLUMN public.club_terms.club_term_created_at IS 'Timestamp when the club term row was created.';
COMMENT ON COLUMN public.club_terms.club_term_updated_at IS 'Timestamp when the club term row was last modified.';

CREATE INDEX ix_club_terms__club ON public.club_terms (club_term_club_id);
CREATE OR REPLACE FUNCTION public.set_ct_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.club_term_updated_at := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_club_terms__updated_at
BEFORE UPDATE ON public.club_terms
FOR EACH ROW EXECUTE FUNCTION public.set_ct_updated_at();

-- ============================================================================
-- 2. PERSON AND ACCOUNT CORE
-- ============================================================================

CREATE TABLE public.people (
  person_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_person PRIMARY KEY,
  person_chinese_name text,
  person_english_name text,
  person_birthday date,
  person_gender text NOT NULL DEFAULT 'unknown',
  person_avatar_url text,
  person_status text NOT NULL DEFAULT 'active',
  person_created_by_account_id uuid,
  person_updated_by_account_id uuid,
  person_created_at timestamptz NOT NULL DEFAULT now(),
  person_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_people__gender CHECK (
    person_gender IN ('female', 'male', 'nonbinary', 'other', 'unknown')
  ),
  CONSTRAINT ck_people__status CHECK (
    person_status IN ('active', 'inactive', 'anonymized')
  ),
  CONSTRAINT ck_people__name_required CHECK (
    person_status = 'anonymized' OR person_chinese_name IS NOT NULL
  ),
  CONSTRAINT ck_people__anonymized CHECK (
    person_status <> 'anonymized' OR (
      person_chinese_name IS NULL AND person_english_name IS NULL
      AND person_birthday IS NULL AND person_avatar_url IS NULL
      AND person_gender = 'unknown'
    )
  ),
  CONSTRAINT ck_people__avatar_url CHECK (
    person_avatar_url IS NULL OR char_length(person_avatar_url) <= 2048
  )
);

COMMENT ON TABLE public.people IS 'Represents real-world natural persons independently from club memberships, platform accounts, and login identities.';
COMMENT ON COLUMN public.people.person_id IS 'Permanent unique identifier of the natural person.';
COMMENT ON COLUMN public.people.person_chinese_name IS 'Official Chinese name. It may be cleared when the person is anonymized.';
COMMENT ON COLUMN public.people.person_english_name IS 'English name or preferred English display name.';
COMMENT ON COLUMN public.people.person_birthday IS 'Birthday stored as a date without time.';
COMMENT ON COLUMN public.people.person_gender IS 'Gender value used only where needed; unknown is the default.';
COMMENT ON COLUMN public.people.person_avatar_url IS 'URL of the person avatar; image bytes are not stored in this table.';
COMMENT ON COLUMN public.people.person_status IS 'Lifecycle status: active, inactive, or anonymized. Person merge is intentionally unsupported.';
COMMENT ON COLUMN public.people.person_created_by_account_id IS 'Account that created the Person record; FK is added after accounts exists.';
COMMENT ON COLUMN public.people.person_updated_by_account_id IS 'Account that last modified the Person record; FK is added after accounts exists.';
COMMENT ON COLUMN public.people.person_created_at IS 'Timestamp when the Person row was created.';
COMMENT ON COLUMN public.people.person_updated_at IS 'Timestamp when the Person row was last modified.';

CREATE INDEX ix_people__birthday ON public.people (person_birthday);
CREATE OR REPLACE FUNCTION public.set_person_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.person_updated_at := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_people__updated_at
BEFORE UPDATE ON public.people
FOR EACH ROW EXECUTE FUNCTION public.set_person_updated_at();

CREATE TABLE public.accounts (
  account_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_account PRIMARY KEY,
  account_kind text NOT NULL DEFAULT 'human',
  account_person_id uuid,
  account_auth_user_id uuid,
  account_status text NOT NULL DEFAULT 'active',
  account_creation_source text NOT NULL,
  account_activated_at timestamptz,
  account_suspended_at timestamptz,
  account_suspension_reason text,
  account_locked_at timestamptz,
  account_lock_reason text,
  account_closed_at timestamptz,
  account_closed_by_account_id uuid,
  account_close_reason text,
  account_merged_into_account_id uuid,
  account_merged_at timestamptz,
  account_anonymized_at timestamptz,
  account_last_login_at timestamptz,
  account_updated_by_account_id uuid,
  account_created_at timestamptz NOT NULL DEFAULT now(),
  account_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_accounts__people FOREIGN KEY (account_person_id)
    REFERENCES public.people(person_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_accounts__merged_account FOREIGN KEY (account_merged_into_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_accounts__closed_by FOREIGN KEY (account_closed_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_accounts__updated_by FOREIGN KEY (account_updated_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_accounts__kind CHECK (account_kind IN ('human', 'system')),
  CONSTRAINT ck_accounts__status CHECK (
    account_status IN ('active', 'suspended', 'locked', 'closed', 'merged', 'anonymized')
  ),
  CONSTRAINT ck_accounts__creation_source CHECK (
    account_creation_source IN ('invitation_onboarding', 'data_migration', 'administrative_repair')
  ),
  CONSTRAINT ck_accounts__kind_links CHECK (
    (account_kind = 'system' AND account_status = 'active'
      AND account_person_id IS NULL AND account_auth_user_id IS NULL)
    OR
    (account_kind = 'human' AND account_person_id IS NOT NULL)
  ),
  CONSTRAINT ck_accounts__auth_ref CHECK (
    account_kind = 'system' OR (
      (account_status IN ('active', 'suspended', 'locked') AND account_auth_user_id IS NOT NULL)
      OR account_status = 'closed'
      OR (account_status IN ('merged', 'anonymized') AND account_auth_user_id IS NULL)
    )
  ),
  CONSTRAINT ck_accounts__suspended_state CHECK (
    (account_status = 'suspended' AND account_suspended_at IS NOT NULL AND account_suspension_reason IS NOT NULL)
    OR
    (account_status <> 'suspended' AND account_suspended_at IS NULL AND account_suspension_reason IS NULL)
  ),
  CONSTRAINT ck_accounts__locked_state CHECK (
    (account_status = 'locked' AND account_locked_at IS NOT NULL AND account_lock_reason IS NOT NULL)
    OR
    (account_status <> 'locked' AND account_locked_at IS NULL AND account_lock_reason IS NULL)
  ),
  CONSTRAINT ck_accounts__closed_state CHECK (
    (account_status = 'closed' AND account_closed_at IS NOT NULL AND account_close_reason IS NOT NULL
      AND account_merged_into_account_id IS NULL AND account_merged_at IS NULL AND account_anonymized_at IS NULL)
    OR
    (account_status <> 'closed' AND account_closed_at IS NULL AND account_closed_by_account_id IS NULL
      AND account_close_reason IS NULL)
  ),
  CONSTRAINT ck_accounts__merged_state CHECK (
    (account_status = 'merged' AND account_merged_into_account_id IS NOT NULL
      AND account_merged_into_account_id <> account_id AND account_merged_at IS NOT NULL
      AND account_anonymized_at IS NULL)
    OR
    (account_status <> 'merged' AND account_merged_into_account_id IS NULL AND account_merged_at IS NULL)
  ),
  CONSTRAINT ck_accounts__anonymized_state CHECK (
    (account_status = 'anonymized' AND account_anonymized_at IS NOT NULL
      AND account_merged_into_account_id IS NULL AND account_merged_at IS NULL)
    OR
    (account_status <> 'anonymized' AND account_anonymized_at IS NULL)
  )
);

COMMENT ON TABLE public.accounts IS 'Represents platform accounts independently from persons, memberships, and authentication-provider identities.';
COMMENT ON COLUMN public.accounts.account_id IS 'Permanent unique identifier of the platform account.';
COMMENT ON COLUMN public.accounts.account_kind IS 'Account kind: human is login-capable; system is a non-login actor for controlled database operations.';
COMMENT ON COLUMN public.accounts.account_person_id IS 'Person owning a human account. It remains populated after anonymization; system accounts must not reference a Person.';
COMMENT ON COLUMN public.accounts.account_auth_user_id IS 'External Supabase Auth user UUID. This is a weak reference with no FK; it is unique when non-null and reconciled by a controlled backend job.';
COMMENT ON COLUMN public.accounts.account_status IS 'Lifecycle status: active, suspended, locked, closed, merged, or anonymized.';
COMMENT ON COLUMN public.accounts.account_creation_source IS 'How the account was created: invitation_onboarding, data_migration, or administrative_repair.';
COMMENT ON COLUMN public.accounts.account_activated_at IS 'Timestamp when the account first became usable.';
COMMENT ON COLUMN public.accounts.account_suspended_at IS 'Timestamp when the account entered suspended status.';
COMMENT ON COLUMN public.accounts.account_suspension_reason IS 'Reason the account was suspended.';
COMMENT ON COLUMN public.accounts.account_locked_at IS 'Timestamp when the account entered locked status.';
COMMENT ON COLUMN public.accounts.account_lock_reason IS 'Reason the account was locked.';
COMMENT ON COLUMN public.accounts.account_closed_at IS 'Timestamp when the account entered the terminal closed status.';
COMMENT ON COLUMN public.accounts.account_closed_by_account_id IS 'Account that performed the close operation.';
COMMENT ON COLUMN public.accounts.account_close_reason IS 'Reason the account was closed.';
COMMENT ON COLUMN public.accounts.account_merged_into_account_id IS 'Existing canonical Account receiving this source Account during merge.';
COMMENT ON COLUMN public.accounts.account_merged_at IS 'Timestamp when the Account merge completed.';
COMMENT ON COLUMN public.accounts.account_anonymized_at IS 'Timestamp when account-linked personal data was anonymized and the Auth reference was removed.';
COMMENT ON COLUMN public.accounts.account_last_login_at IS 'Timestamp of the latest successful login for the account.';
COMMENT ON COLUMN public.accounts.account_updated_by_account_id IS 'Account that last modified the account business state.';
COMMENT ON COLUMN public.accounts.account_created_at IS 'Timestamp when the account row was created.';
COMMENT ON COLUMN public.accounts.account_updated_at IS 'Timestamp when the account row was last modified.';

CREATE UNIQUE INDEX uq_accounts__auth_user
ON public.accounts (account_auth_user_id)
WHERE account_auth_user_id IS NOT NULL;

CREATE UNIQUE INDEX uq_accounts__person_live
ON public.accounts (account_person_id)
WHERE account_kind = 'human' AND account_status IN ('active', 'suspended', 'locked');

CREATE INDEX ix_accounts__person ON public.accounts (account_person_id);
CREATE INDEX ix_accounts__merged_into ON public.accounts (account_merged_into_account_id);
CREATE OR REPLACE FUNCTION public.set_account_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.account_updated_at := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_accounts__updated_at
BEFORE UPDATE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.set_account_updated_at();

-- Add circular audit/ownership FKs now that accounts exists.
ALTER TABLE public.people
  ADD CONSTRAINT fk_people__created_by FOREIGN KEY (person_created_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_people__updated_by FOREIGN KEY (person_updated_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public.clubs
  ADD CONSTRAINT fk_clubs__created_by FOREIGN KEY (club_created_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_clubs__updated_by FOREIGN KEY (club_updated_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX ix_people__created_by ON public.people (person_created_by_account_id);
CREATE INDEX ix_people__updated_by ON public.people (person_updated_by_account_id);
CREATE INDEX ix_clubs__created_by ON public.clubs (club_created_by_account_id);
CREATE INDEX ix_clubs__updated_by ON public.clubs (club_updated_by_account_id);

CREATE TABLE public.person_contacts (
  person_contact_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_pc PRIMARY KEY,
  person_contact_person_id uuid NOT NULL,
  person_contact_type text NOT NULL,
  person_contact_value text NOT NULL,
  person_contact_normalized_value text,
  person_contact_search_value text,
  person_contact_normalization_version smallint NOT NULL DEFAULT 1,
  person_contact_country_code text,
  person_contact_extension text,
  person_contact_label text,
  person_contact_is_primary boolean NOT NULL DEFAULT false,
  person_contact_is_verified boolean NOT NULL DEFAULT false,
  person_contact_verified_at timestamptz,
  person_contact_verification_method text,
  person_contact_status text NOT NULL DEFAULT 'active',
  person_contact_created_by_account_id uuid,
  person_contact_updated_by_account_id uuid,
  person_contact_created_at timestamptz NOT NULL DEFAULT now(),
  person_contact_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_person_contacts__people FOREIGN KEY (person_contact_person_id)
    REFERENCES public.people(person_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_person_contacts__created_by FOREIGN KEY (person_contact_created_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_person_contacts__updated_by FOREIGN KEY (person_contact_updated_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_person_contacts__type CHECK (
    person_contact_type IN ('mobile', 'phone', 'email')
  ),
  CONSTRAINT ck_person_contacts__status CHECK (
    person_contact_status IN ('active', 'inactive', 'invalid')
  ),
  CONSTRAINT ck_person_contacts__norm_version CHECK (person_contact_normalization_version > 0),
  CONSTRAINT ck_person_contacts__country CHECK (
    person_contact_country_code IS NULL OR person_contact_country_code ~ '^[A-Z]{2}$'
  ),
  CONSTRAINT ck_person_contacts__active_norm CHECK (
    person_contact_status <> 'active' OR person_contact_normalized_value IS NOT NULL
  ),
  CONSTRAINT ck_person_contacts__verification CHECK (
    (person_contact_is_verified AND person_contact_verified_at IS NOT NULL)
    OR
    (NOT person_contact_is_verified AND person_contact_verified_at IS NULL)
  ),
  CONSTRAINT ck_person_contacts__extension CHECK (
    person_contact_extension IS NULL OR person_contact_type IN ('mobile', 'phone')
  )
);

COMMENT ON TABLE public.person_contacts IS 'Stores phones and email addresses separately from People, including original, normalized, and search representations.';
COMMENT ON COLUMN public.person_contacts.person_contact_id IS 'Permanent unique identifier of the contact method.';
COMMENT ON COLUMN public.person_contacts.person_contact_person_id IS 'Person who owns this contact method.';
COMMENT ON COLUMN public.person_contacts.person_contact_type IS 'Contact type: mobile, phone, or email.';
COMMENT ON COLUMN public.person_contacts.person_contact_value IS 'Original user-facing value used for display and actual contact.';
COMMENT ON COLUMN public.person_contacts.person_contact_normalized_value IS 'Canonical normalized value used for structured matching, such as E.164 for phone or NFC/IDNA-normalized email domain.';
COMMENT ON COLUMN public.person_contacts.person_contact_search_value IS 'Search-only representation, such as a lowercased email candidate value; it must not replace the official delivery address or become a global identity key.';
COMMENT ON COLUMN public.person_contacts.person_contact_normalization_version IS 'Version of the normalization rules used to produce normalized and search values.';
COMMENT ON COLUMN public.person_contacts.person_contact_country_code IS 'ISO alpha-2 country context used when normalizing a phone number.';
COMMENT ON COLUMN public.person_contacts.person_contact_extension IS 'Telephone extension stored separately from the E.164 normalized phone value.';
COMMENT ON COLUMN public.person_contacts.person_contact_label IS 'User-facing label such as personal mobile, office phone, or primary email.';
COMMENT ON COLUMN public.person_contacts.person_contact_is_primary IS 'Whether this is the primary active contact of its type for the Person.';
COMMENT ON COLUMN public.person_contacts.person_contact_is_verified IS 'Whether ownership or validity of this contact method has been verified.';
COMMENT ON COLUMN public.person_contacts.person_contact_verified_at IS 'Timestamp when verification completed.';
COMMENT ON COLUMN public.person_contacts.person_contact_verification_method IS 'Method used for verification, such as email_link, sms_otp, or administrative_confirmation.';
COMMENT ON COLUMN public.person_contacts.person_contact_status IS 'Lifecycle status: active, inactive, or invalid.';
COMMENT ON COLUMN public.person_contacts.person_contact_created_by_account_id IS 'Account that created the contact record.';
COMMENT ON COLUMN public.person_contacts.person_contact_updated_by_account_id IS 'Account that last modified the contact record.';
COMMENT ON COLUMN public.person_contacts.person_contact_created_at IS 'Timestamp when the contact row was created.';
COMMENT ON COLUMN public.person_contacts.person_contact_updated_at IS 'Timestamp when the contact row was last modified.';

CREATE INDEX ix_person_contacts__person ON public.person_contacts (person_contact_person_id);
CREATE INDEX ix_person_contacts__type_norm
  ON public.person_contacts (person_contact_type, person_contact_normalized_value);
CREATE INDEX ix_person_contacts__type_search
  ON public.person_contacts (person_contact_type, person_contact_search_value);
CREATE UNIQUE INDEX uq_person_contacts__primary
  ON public.person_contacts (person_contact_person_id, person_contact_type)
  WHERE person_contact_is_primary = true AND person_contact_status = 'active';
CREATE OR REPLACE FUNCTION public.set_pc_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.person_contact_updated_at := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_person_contacts__updated_at
BEFORE UPDATE ON public.person_contacts
FOR EACH ROW EXECUTE FUNCTION public.set_pc_updated_at();

CREATE OR REPLACE FUNCTION public.guard_anonymized_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.person_contact_status = 'active' AND EXISTS (
    SELECT 1 FROM public.people AS person
    WHERE person.person_id = NEW.person_contact_person_id
      AND person.person_status = 'anonymized'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'anonymized_person_cannot_have_active_contact';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_pc__guard_anonymized
BEFORE INSERT OR UPDATE OF person_contact_person_id, person_contact_status
ON public.person_contacts FOR EACH ROW
EXECUTE FUNCTION public.guard_anonymized_contact();

CREATE OR REPLACE FUNCTION public.guard_person_anonymization()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.person_status = 'anonymized' AND EXISTS (
    SELECT 1 FROM public.person_contacts AS contact
    WHERE contact.person_contact_person_id = NEW.person_id
      AND contact.person_contact_status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'active_contacts_must_be_invalidated_before_anonymization';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_people__guard_anonymized
BEFORE UPDATE OF person_status ON public.people FOR EACH ROW
EXECUTE FUNCTION public.guard_person_anonymization();

CREATE TABLE public.person_match_cases (
  person_match_case_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_pmc PRIMARY KEY,
  person_match_case_requested_by_account_id uuid NOT NULL,
  person_match_case_requested_club_id uuid NOT NULL,
  person_match_case_request_digest bytea NOT NULL,
  person_match_case_candidate_person_id uuid,
  person_match_case_result text NOT NULL,
  person_match_case_status text NOT NULL DEFAULT 'pending',
  person_match_case_reviewed_by_account_id uuid,
  person_match_case_reviewed_at timestamptz,
  person_match_case_resolution_code text,
  person_match_case_resolution_detail text,
  person_match_case_created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_person_match_cases__requester FOREIGN KEY (person_match_case_requested_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_person_match_cases__clubs FOREIGN KEY (person_match_case_requested_club_id)
    REFERENCES public.clubs(club_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_person_match_cases__candidate FOREIGN KEY (person_match_case_candidate_person_id)
    REFERENCES public.people(person_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_person_match_cases__reviewer FOREIGN KEY (person_match_case_reviewed_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_person_match_cases__result CHECK (
    person_match_case_result IN (
      'use_existing_person', 'create_new_person',
      'manual_review_required', 'reject_auto_create'
    )
  ),
  CONSTRAINT ck_person_match_cases__status CHECK (
    person_match_case_status IN ('pending', 'reviewing', 'resolved', 'dismissed')
  ),
  CONSTRAINT ck_person_match_cases__review CHECK (
    (person_match_case_status IN ('resolved', 'dismissed')
      AND person_match_case_reviewed_at IS NOT NULL
      AND person_match_case_reviewed_by_account_id IS NOT NULL
      AND person_match_case_resolution_code IS NOT NULL)
    OR
    (person_match_case_status IN ('pending', 'reviewing'))
  )
);

COMMENT ON TABLE public.person_match_cases IS 'Privacy-preserving pre-creation checks for suspected duplicate People; records are never used to merge existing People.';
COMMENT ON COLUMN public.person_match_cases.person_match_case_id IS 'Permanent unique identifier of the duplicate-match review case.';
COMMENT ON COLUMN public.person_match_cases.person_match_case_requested_by_account_id IS 'Account that requested the cross-club match check.';
COMMENT ON COLUMN public.person_match_cases.person_match_case_requested_club_id IS 'Club scope from which the match request originated.';
COMMENT ON COLUMN public.person_match_cases.person_match_case_request_digest IS 'Digest used only to deduplicate the same match request. Fuzzy matching inputs are evaluated in plaintext inside a controlled SECURITY DEFINER function and are not persisted.';
COMMENT ON COLUMN public.person_match_cases.person_match_case_candidate_person_id IS 'Candidate existing Person visible only to authorized platform review roles.';
COMMENT ON COLUMN public.person_match_cases.person_match_case_result IS 'Outcome: use an existing Person, create a new Person, require platform review, or reject automatic creation.';
COMMENT ON COLUMN public.person_match_cases.person_match_case_status IS 'Workflow status: pending, reviewing, resolved, or dismissed.';
COMMENT ON COLUMN public.person_match_cases.person_match_case_reviewed_by_account_id IS 'Platform account that completed manual review.';
COMMENT ON COLUMN public.person_match_cases.person_match_case_reviewed_at IS 'Timestamp when manual review completed.';
COMMENT ON COLUMN public.person_match_cases.person_match_case_resolution_code IS 'Structured review resolution. It may select an existing Person or allow a new Person, but never merges People.';
COMMENT ON COLUMN public.person_match_cases.person_match_case_resolution_detail IS 'Additional internal explanation of the resolution.';
COMMENT ON COLUMN public.person_match_cases.person_match_case_created_at IS 'Timestamp when the match case was created.';

CREATE INDEX ix_person_match_cases__requester ON public.person_match_cases (person_match_case_requested_by_account_id);
CREATE INDEX ix_person_match_cases__club ON public.person_match_cases (person_match_case_requested_club_id);
CREATE INDEX ix_person_match_cases__request_digest ON public.person_match_cases (person_match_case_request_digest);
CREATE INDEX ix_person_match_cases__status ON public.person_match_cases (person_match_case_status, person_match_case_created_at);
CREATE INDEX ix_pmc__candidate ON public.person_match_cases (person_match_case_candidate_person_id);

-- ============================================================================
-- 3. MEMBERSHIP DOMAIN
-- ============================================================================

CREATE TABLE public.memberships (
  membership_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_membership PRIMARY KEY,
  membership_person_id uuid NOT NULL,
  membership_club_id uuid NOT NULL,
  membership_member_number text,
  membership_type text NOT NULL DEFAULT 'active',
  membership_joined_on date,
  membership_ended_on date,
  membership_status text NOT NULL DEFAULT 'pending',
  membership_source text NOT NULL DEFAULT 'secretary_created',
  membership_onboarding_status text NOT NULL DEFAULT 'not_started',
  membership_created_by_account_id uuid,
  membership_updated_by_account_id uuid,
  membership_created_at timestamptz NOT NULL DEFAULT now(),
  membership_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_memberships__people FOREIGN KEY (membership_person_id)
    REFERENCES public.people(person_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_memberships__clubs FOREIGN KEY (membership_club_id)
    REFERENCES public.clubs(club_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_memberships__created_by FOREIGN KEY (membership_created_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_memberships__updated_by FOREIGN KEY (membership_updated_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_memberships__type CHECK (
    membership_type IN ('active', 'honorary', 'corporate', 'associate')
  ),
  CONSTRAINT ck_memberships__status CHECK (
    membership_status IN ('pending', 'active', 'inactive', 'resigned', 'transferred', 'deceased')
  ),
  CONSTRAINT ck_memberships__source CHECK (
    membership_source IN ('secretary_created', 'import', 'transfer', 'administrative_repair')
  ),
  CONSTRAINT ck_memberships__onboarding CHECK (
    membership_onboarding_status IN ('not_started', 'in_progress', 'completed', 'waived', 'cancelled')
  ),
  CONSTRAINT ck_memberships__dates CHECK (
    membership_ended_on IS NULL OR membership_joined_on IS NULL OR membership_ended_on >= membership_joined_on
  ),
  CONSTRAINT ck_memberships__terminal_end CHECK (
    membership_status NOT IN ('resigned', 'transferred', 'deceased') OR membership_ended_on IS NOT NULL
  )
);

COMMENT ON TABLE public.memberships IS 'Represents the relationship between one Person and one Rotary club; transfers create a new Membership rather than overwriting the old one.';
COMMENT ON COLUMN public.memberships.membership_id IS 'Permanent unique identifier of the Person-to-Club relationship.';
COMMENT ON COLUMN public.memberships.membership_person_id IS 'Person who holds this membership.';
COMMENT ON COLUMN public.memberships.membership_club_id IS 'Club to which this membership belongs.';
COMMENT ON COLUMN public.memberships.membership_member_number IS 'Club or Rotary member number, when available.';
COMMENT ON COLUMN public.memberships.membership_type IS 'Membership category: active, honorary, corporate, or associate.';
COMMENT ON COLUMN public.memberships.membership_joined_on IS 'Business date when the person formally joined the club.';
COMMENT ON COLUMN public.memberships.membership_ended_on IS 'Business date when the membership ended; required for terminal membership states.';
COMMENT ON COLUMN public.memberships.membership_status IS 'Current membership-status snapshot used for normal queries and authorization.';
COMMENT ON COLUMN public.memberships.membership_source IS 'How the membership record was created.';
COMMENT ON COLUMN public.memberships.membership_onboarding_status IS 'Current onboarding-status snapshot only. Detailed timestamps, reasons, and transitions are stored in membership_onboarding_events.';
COMMENT ON COLUMN public.memberships.membership_created_by_account_id IS 'Account that created the Membership.';
COMMENT ON COLUMN public.memberships.membership_updated_by_account_id IS 'Account that last modified the current Membership snapshot.';
COMMENT ON COLUMN public.memberships.membership_created_at IS 'Timestamp when the Membership row was created.';
COMMENT ON COLUMN public.memberships.membership_updated_at IS 'Timestamp when the Membership snapshot was last modified.';

CREATE INDEX ix_memberships__person ON public.memberships (membership_person_id);
CREATE INDEX ix_memberships__club ON public.memberships (membership_club_id);
CREATE UNIQUE INDEX uq_memberships__person_club_live
  ON public.memberships (membership_person_id, membership_club_id)
  WHERE membership_status IN ('pending', 'active', 'inactive');
CREATE UNIQUE INDEX uq_memberships__club_member_no
  ON public.memberships (membership_club_id, membership_member_number)
  WHERE membership_member_number IS NOT NULL;
CREATE OR REPLACE FUNCTION public.set_membership_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.membership_updated_at := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_memberships__updated_at
BEFORE UPDATE ON public.memberships
FOR EACH ROW EXECUTE FUNCTION public.set_membership_updated_at();

CREATE TABLE public.membership_onboarding_events (
  membership_onboarding_event_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_moe PRIMARY KEY,
  membership_onboarding_event_sequence bigint GENERATED ALWAYS AS IDENTITY
    (SEQUENCE NAME public.seq_moe__sequence),
  membership_onboarding_event_membership_id uuid NOT NULL,
  membership_onboarding_event_previous_status text,
  membership_onboarding_event_new_status text NOT NULL,
  membership_onboarding_event_type text NOT NULL,
  membership_onboarding_event_actor_account_id uuid,
  membership_onboarding_event_reason_code text,
  membership_onboarding_event_reason_detail text,
  membership_onboarding_event_request_id uuid,
  membership_onboarding_event_metadata jsonb,
  membership_onboarding_event_occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_onboarding_events__membership FOREIGN KEY (membership_onboarding_event_membership_id)
    REFERENCES public.memberships(membership_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_onboarding_events__actor FOREIGN KEY (membership_onboarding_event_actor_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uq_moe__sequence UNIQUE (membership_onboarding_event_sequence),
  CONSTRAINT ck_onboarding_events__previous CHECK (
    membership_onboarding_event_previous_status IS NULL OR
    membership_onboarding_event_previous_status IN ('not_started', 'in_progress', 'completed', 'waived', 'cancelled')
  ),
  CONSTRAINT ck_onboarding_events__new CHECK (
    membership_onboarding_event_new_status IN ('not_started', 'in_progress', 'completed', 'waived', 'cancelled')
  ),
  CONSTRAINT ck_onboarding_events__type CHECK (
    membership_onboarding_event_type IN ('started', 'profile_confirmed', 'completed', 'waived', 'cancelled', 'resumed', 'corrected')
  )
);

COMMENT ON TABLE public.membership_onboarding_events IS 'Append-only history of onboarding transitions and profile-confirmation events for each Membership.';
COMMENT ON COLUMN public.membership_onboarding_events.membership_onboarding_event_id IS 'Permanent unique identifier of the onboarding event.';
COMMENT ON COLUMN public.membership_onboarding_events.membership_onboarding_event_sequence IS 'Global monotonic sequence used only for deterministic export and debugging order; it does not participate in business-state decisions.';
COMMENT ON COLUMN public.membership_onboarding_events.membership_onboarding_event_membership_id IS 'Membership whose onboarding process changed.';
COMMENT ON COLUMN public.membership_onboarding_events.membership_onboarding_event_previous_status IS 'Onboarding status immediately before the event, when applicable.';
COMMENT ON COLUMN public.membership_onboarding_events.membership_onboarding_event_new_status IS 'Onboarding status immediately after the event.';
COMMENT ON COLUMN public.membership_onboarding_events.membership_onboarding_event_type IS 'Business event type such as started, profile_confirmed, completed, waived, or cancelled.';
COMMENT ON COLUMN public.membership_onboarding_events.membership_onboarding_event_actor_account_id IS 'Account responsible for the event; null is allowed for controlled system events.';
COMMENT ON COLUMN public.membership_onboarding_events.membership_onboarding_event_reason_code IS 'Structured reason code for waiver, cancellation, resumption, or correction.';
COMMENT ON COLUMN public.membership_onboarding_events.membership_onboarding_event_reason_detail IS 'Additional human-readable reason detail.';
COMMENT ON COLUMN public.membership_onboarding_events.membership_onboarding_event_request_id IS 'Request identifier used to correlate the event with API and audit logs.';
COMMENT ON COLUMN public.membership_onboarding_events.membership_onboarding_event_metadata IS 'Whitelisted non-secret metadata for the event.';
COMMENT ON COLUMN public.membership_onboarding_events.membership_onboarding_event_occurred_at IS 'Timestamp when the onboarding event occurred.';

CREATE INDEX ix_onboarding_events__membership
  ON public.membership_onboarding_events (membership_onboarding_event_membership_id, membership_onboarding_event_occurred_at);
CREATE INDEX ix_onboarding_events__request
  ON public.membership_onboarding_events (membership_onboarding_event_request_id);

CREATE TABLE public.membership_status_histories (
  membership_status_history_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_msh PRIMARY KEY,
  membership_status_history_sequence bigint GENERATED ALWAYS AS IDENTITY
    (SEQUENCE NAME public.seq_msh__sequence),
  membership_status_history_membership_id uuid NOT NULL,
  membership_status_history_previous_status text,
  membership_status_history_new_status text NOT NULL,
  membership_status_history_effective_at timestamptz NOT NULL,
  membership_status_history_recorded_at timestamptz NOT NULL DEFAULT now(),
  membership_status_history_reason_code text NOT NULL,
  membership_status_history_reason_detail text,
  membership_status_history_changed_by_account_id uuid,
  membership_status_history_supersedes_id uuid,
  membership_status_history_voided_at timestamptz,
  membership_status_history_voided_by_account_id uuid,
  membership_status_history_void_reason text,
  membership_status_history_created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_msh__membership FOREIGN KEY (membership_status_history_membership_id)
    REFERENCES public.memberships(membership_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_msh__changed_by FOREIGN KEY (membership_status_history_changed_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_msh__supersedes FOREIGN KEY (membership_status_history_supersedes_id)
    REFERENCES public.membership_status_histories(membership_status_history_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_msh__voided_by FOREIGN KEY (membership_status_history_voided_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uq_msh__sequence UNIQUE (membership_status_history_sequence),
  CONSTRAINT ck_msh__previous_status CHECK (
    membership_status_history_previous_status IS NULL OR
    membership_status_history_previous_status IN ('pending', 'active', 'inactive', 'resigned', 'transferred', 'deceased')
  ),
  CONSTRAINT ck_msh__new_status CHECK (
    membership_status_history_new_status IN ('pending', 'active', 'inactive', 'resigned', 'transferred', 'deceased')
  ),
  CONSTRAINT ck_msh__supersedes_self CHECK (
    membership_status_history_supersedes_id IS NULL OR membership_status_history_supersedes_id <> membership_status_history_id
  ),
  CONSTRAINT ck_msh__void_state CHECK (
    (membership_status_history_voided_at IS NULL
      AND membership_status_history_voided_by_account_id IS NULL
      AND membership_status_history_void_reason IS NULL)
    OR
    (membership_status_history_voided_at IS NOT NULL
      AND membership_status_history_voided_by_account_id IS NOT NULL
      AND membership_status_history_void_reason IS NOT NULL)
  )
);

COMMENT ON TABLE public.membership_status_histories IS 'Append-only membership-status history. The Membership row stores the current snapshot; this table records every transition.';
COMMENT ON COLUMN public.membership_status_histories.membership_status_history_id IS 'Permanent unique identifier of the membership-status event.';
COMMENT ON COLUMN public.membership_status_histories.membership_status_history_sequence IS 'Global monotonic sequence used only for deterministic export, debugging, and tie-breaking after effective and recorded timestamps; it is not a business version number.';
COMMENT ON COLUMN public.membership_status_histories.membership_status_history_membership_id IS 'Membership whose status changed.';
COMMENT ON COLUMN public.membership_status_histories.membership_status_history_previous_status IS 'Membership status before the event.';
COMMENT ON COLUMN public.membership_status_histories.membership_status_history_new_status IS 'Membership status after the event.';
COMMENT ON COLUMN public.membership_status_histories.membership_status_history_effective_at IS 'Business-effective timestamp of the new status, which may be backdated.';
COMMENT ON COLUMN public.membership_status_histories.membership_status_history_recorded_at IS 'Timestamp when the event was recorded by the system.';
COMMENT ON COLUMN public.membership_status_histories.membership_status_history_reason_code IS 'Structured reason for the status change.';
COMMENT ON COLUMN public.membership_status_histories.membership_status_history_reason_detail IS 'Additional detail explaining the status change.';
COMMENT ON COLUMN public.membership_status_histories.membership_status_history_changed_by_account_id IS 'Account that initiated the status change; null is allowed for controlled system migration events.';
COMMENT ON COLUMN public.membership_status_histories.membership_status_history_supersedes_id IS 'Earlier history event corrected or superseded by this event.';
COMMENT ON COLUMN public.membership_status_histories.membership_status_history_voided_at IS 'Timestamp when an incorrect history event was voided.';
COMMENT ON COLUMN public.membership_status_histories.membership_status_history_voided_by_account_id IS 'Account that voided the event.';
COMMENT ON COLUMN public.membership_status_histories.membership_status_history_void_reason IS 'Reason the event was voided.';
COMMENT ON COLUMN public.membership_status_histories.membership_status_history_created_at IS 'Timestamp when the history row was created.';

CREATE UNIQUE INDEX uq_msh__membership_effective_live
  ON public.membership_status_histories (
    membership_status_history_membership_id,
    membership_status_history_effective_at
  )
  WHERE membership_status_history_voided_at IS NULL;
CREATE INDEX ix_msh__membership_order
  ON public.membership_status_histories (
    membership_status_history_membership_id,
    membership_status_history_effective_at,
    membership_status_history_recorded_at,
    membership_status_history_sequence
  );
CREATE INDEX ix_msh__supersedes ON public.membership_status_histories (membership_status_history_supersedes_id);

-- ============================================================================
-- 4. ACCOUNT SECURITY, DEVICE, AND SESSION DOMAIN
-- ============================================================================

CREATE TABLE public.account_merge_events (
  account_merge_event_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_ame PRIMARY KEY,
  account_merge_event_source_account_id uuid NOT NULL,
  account_merge_event_target_account_id uuid NOT NULL,
  account_merge_event_merged_by_account_id uuid NOT NULL,
  account_merge_event_reason_code text NOT NULL,
  account_merge_event_reason_detail text,
  account_merge_event_transfer_summary jsonb,
  account_merge_event_conflict_summary jsonb,
  account_merge_event_occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_account_merge_events__source FOREIGN KEY (account_merge_event_source_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_account_merge_events__target FOREIGN KEY (account_merge_event_target_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_account_merge_events__actor FOREIGN KEY (account_merge_event_merged_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_account_merge_events__different CHECK (
    account_merge_event_source_account_id <> account_merge_event_target_account_id
  )
);

COMMENT ON TABLE public.account_merge_events IS 'Append-only record of merging an existing source Account into an existing canonical target Account.';
COMMENT ON COLUMN public.account_merge_events.account_merge_event_id IS 'Permanent unique identifier of the account-merge event.';
COMMENT ON COLUMN public.account_merge_events.account_merge_event_source_account_id IS 'Source Account that entered merged status.';
COMMENT ON COLUMN public.account_merge_events.account_merge_event_target_account_id IS 'Existing canonical target Account retained after the merge.';
COMMENT ON COLUMN public.account_merge_events.account_merge_event_merged_by_account_id IS 'Authorized Account that executed the merge.';
COMMENT ON COLUMN public.account_merge_events.account_merge_event_reason_code IS 'Structured reason code for the merge.';
COMMENT ON COLUMN public.account_merge_events.account_merge_event_reason_detail IS 'Additional explanation for the merge.';
COMMENT ON COLUMN public.account_merge_events.account_merge_event_transfer_summary IS 'Whitelisted summary of relationships successfully transferred; historical login, audit, session, and invitation actor links remain on the source Account.';
COMMENT ON COLUMN public.account_merge_events.account_merge_event_conflict_summary IS 'Whitelisted summary of conflicts, skipped transfers, or manual-review outcomes.';
COMMENT ON COLUMN public.account_merge_events.account_merge_event_occurred_at IS 'Timestamp when the merge transaction completed.';

CREATE INDEX ix_account_merge_events__source ON public.account_merge_events (account_merge_event_source_account_id);
CREATE INDEX ix_account_merge_events__target ON public.account_merge_events (account_merge_event_target_account_id);

CREATE TABLE public.devices (
  device_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_device PRIMARY KEY,
  device_fingerprint_scope text NOT NULL DEFAULT 'platform',
  device_fingerprint_hash bytea NOT NULL,
  device_fingerprint_hash_version smallint NOT NULL DEFAULT 1,
  device_platform text,
  device_browser_family text,
  device_user_agent_hash bytea,
  device_first_seen_at timestamptz NOT NULL DEFAULT now(),
  device_last_seen_at timestamptz NOT NULL DEFAULT now(),
  device_status text NOT NULL DEFAULT 'active',
  device_created_at timestamptz NOT NULL DEFAULT now(),
  device_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_devices__fingerprint UNIQUE (
    device_fingerprint_scope,
    device_fingerprint_hash_version,
    device_fingerprint_hash
  ),
  CONSTRAINT ck_devices__scope CHECK (length(btrim(device_fingerprint_scope)) > 0),
  CONSTRAINT ck_devices__hash_version CHECK (device_fingerprint_hash_version > 0),
  CONSTRAINT ck_devices__status CHECK (device_status IN ('active', 'blocked', 'retired')),
  CONSTRAINT ck_devices__seen_order CHECK (device_last_seen_at >= device_first_seen_at)
);

COMMENT ON TABLE public.devices IS 'Represents a deduplicated physical or logical device independently from any single Account.';
COMMENT ON COLUMN public.devices.device_id IS 'Permanent unique identifier of the deduplicated device.';
COMMENT ON COLUMN public.devices.device_fingerprint_scope IS 'Stable namespace for fingerprint canonicalization, allowing independent providers or platform generations without accidental collision.';
COMMENT ON COLUMN public.devices.device_fingerprint_hash IS 'Hashed device fingerprint; raw fingerprint material is never stored.';
COMMENT ON COLUMN public.devices.device_fingerprint_hash_version IS 'Version of the fingerprint hashing and canonicalization rules.';
COMMENT ON COLUMN public.devices.device_platform IS 'Observed platform such as iOS, Android, Windows, or macOS.';
COMMENT ON COLUMN public.devices.device_browser_family IS 'Observed browser or application family.';
COMMENT ON COLUMN public.devices.device_user_agent_hash IS 'Optional hash of canonicalized user-agent data for correlation without storing the full string.';
COMMENT ON COLUMN public.devices.device_first_seen_at IS 'First time the platform observed this device.';
COMMENT ON COLUMN public.devices.device_last_seen_at IS 'Most recent time the platform observed this device.';
COMMENT ON COLUMN public.devices.device_status IS 'Device lifecycle status: active, blocked, or retired.';
COMMENT ON COLUMN public.devices.device_created_at IS 'Timestamp when the deduplicated device row was created.';
COMMENT ON COLUMN public.devices.device_updated_at IS 'Timestamp when the device row was last modified.';

CREATE OR REPLACE FUNCTION public.set_device_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.device_updated_at := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_devices__updated_at
BEFORE UPDATE ON public.devices
FOR EACH ROW EXECUTE FUNCTION public.set_device_updated_at();

CREATE TABLE public.account_devices (
  account_device_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_ad PRIMARY KEY,
  account_device_account_id uuid NOT NULL,
  account_device_device_id uuid NOT NULL,
  account_device_name text,
  account_device_status text NOT NULL DEFAULT 'active',
  account_device_first_seen_at timestamptz NOT NULL DEFAULT now(),
  account_device_last_seen_at timestamptz NOT NULL DEFAULT now(),
  account_device_trusted_at timestamptz,
  account_device_revoked_at timestamptz,
  account_device_revoked_by_account_id uuid,
  account_device_revoke_reason_code text,
  account_device_created_at timestamptz NOT NULL DEFAULT now(),
  account_device_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_account_devices__accounts FOREIGN KEY (account_device_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_account_devices__devices FOREIGN KEY (account_device_device_id)
    REFERENCES public.devices(device_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_account_devices__revoked_by FOREIGN KEY (account_device_revoked_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uq_account_devices__account_device UNIQUE (account_device_account_id, account_device_device_id),
  CONSTRAINT ck_account_devices__status CHECK (
    account_device_status IN ('active', 'trusted', 'revoked', 'blocked')
  ),
  CONSTRAINT ck_account_devices__seen_order CHECK (
    account_device_last_seen_at >= account_device_first_seen_at
  ),
  CONSTRAINT ck_account_devices__trusted_state CHECK (
    (account_device_status = 'trusted' AND account_device_trusted_at IS NOT NULL AND account_device_revoked_at IS NULL)
    OR
    (account_device_status <> 'trusted')
  ),
  CONSTRAINT ck_account_devices__revoked_state CHECK (
    (account_device_status = 'revoked' AND account_device_revoked_at IS NOT NULL
      AND account_device_revoked_by_account_id IS NOT NULL
      AND account_device_revoke_reason_code IS NOT NULL)
    OR
    (account_device_status <> 'revoked' AND account_device_revoked_at IS NULL
      AND account_device_revoked_by_account_id IS NULL
      AND account_device_revoke_reason_code IS NULL)
  )
);

COMMENT ON TABLE public.account_devices IS 'Many-to-many relationship between Accounts and shared Devices, including account-specific trust and revocation state.';
COMMENT ON COLUMN public.account_devices.account_device_id IS 'Permanent unique identifier of the Account-to-Device relationship.';
COMMENT ON COLUMN public.account_devices.account_device_account_id IS 'Account that used or registered the device.';
COMMENT ON COLUMN public.account_devices.account_device_device_id IS 'Deduplicated Device used by the Account.';
COMMENT ON COLUMN public.account_devices.account_device_name IS 'Account-specific display name such as Office iPad or Leo''s iPhone.';
COMMENT ON COLUMN public.account_devices.account_device_status IS 'Relationship status: active, trusted, revoked, or blocked.';
COMMENT ON COLUMN public.account_devices.account_device_first_seen_at IS 'First time this Account used the Device.';
COMMENT ON COLUMN public.account_devices.account_device_last_seen_at IS 'Most recent time this Account used the Device.';
COMMENT ON COLUMN public.account_devices.account_device_trusted_at IS 'Timestamp when this Account trusted the Device.';
COMMENT ON COLUMN public.account_devices.account_device_revoked_at IS 'Timestamp when this Account-to-Device relationship was revoked.';
COMMENT ON COLUMN public.account_devices.account_device_revoked_by_account_id IS 'Account that revoked access for this Account Device relationship.';
COMMENT ON COLUMN public.account_devices.account_device_revoke_reason_code IS 'Structured reason for revocation.';
COMMENT ON COLUMN public.account_devices.account_device_created_at IS 'Timestamp when the Account Device relationship was created.';
COMMENT ON COLUMN public.account_devices.account_device_updated_at IS 'Timestamp when the Account Device relationship was last modified.';

CREATE INDEX ix_account_devices__account ON public.account_devices (account_device_account_id);
CREATE INDEX ix_account_devices__device ON public.account_devices (account_device_device_id);
CREATE OR REPLACE FUNCTION public.set_ad_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.account_device_updated_at := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_account_devices__updated_at
BEFORE UPDATE ON public.account_devices
FOR EACH ROW EXECUTE FUNCTION public.set_ad_updated_at();

CREATE TABLE public.account_sessions (
  account_session_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_session PRIMARY KEY,
  account_session_auth_session_id uuid NOT NULL,
  account_session_account_id uuid NOT NULL,
  account_session_account_device_id uuid,
  account_session_status text NOT NULL DEFAULT 'active',
  account_session_started_at timestamptz NOT NULL DEFAULT now(),
  account_session_last_seen_at timestamptz NOT NULL DEFAULT now(),
  account_session_expires_at timestamptz,
  account_session_revoked_at timestamptz,
  account_session_revoked_by_account_id uuid,
  account_session_revoke_reason text,
  account_session_created_at timestamptz NOT NULL DEFAULT now(),
  account_session_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_account_sessions__auth_session UNIQUE (account_session_auth_session_id),
  CONSTRAINT fk_account_sessions__accounts FOREIGN KEY (account_session_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_account_sessions__account_device FOREIGN KEY (account_session_account_device_id)
    REFERENCES public.account_devices(account_device_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_account_sessions__revoked_by FOREIGN KEY (account_session_revoked_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_account_sessions__status CHECK (
    account_session_status IN ('active', 'expired', 'revoked', 'signed_out')
  ),
  CONSTRAINT ck_account_sessions__seen_order CHECK (
    account_session_last_seen_at >= account_session_started_at
  ),
  CONSTRAINT ck_account_sessions__expiry CHECK (
    account_session_expires_at IS NULL OR account_session_expires_at >= account_session_started_at
  ),
  CONSTRAINT ck_account_sessions__revoked_state CHECK (
    (account_session_status = 'revoked' AND account_session_revoked_at IS NOT NULL
      AND account_session_revoke_reason IS NOT NULL)
    OR
    (account_session_status <> 'revoked' AND account_session_revoked_at IS NULL
      AND account_session_revoked_by_account_id IS NULL
      AND account_session_revoke_reason IS NULL)
  )
);

COMMENT ON TABLE public.account_sessions IS 'Platform-side session ledger that outlives external Supabase Auth sessions and never stores access tokens, refresh tokens, or full JWTs.';
COMMENT ON COLUMN public.account_sessions.account_session_id IS 'Permanent unique identifier of the platform session ledger entry.';
COMMENT ON COLUMN public.account_sessions.account_session_auth_session_id IS 'External Supabase auth.sessions UUID stored as a weak reference without FK.';
COMMENT ON COLUMN public.account_sessions.account_session_account_id IS 'Platform Account that owns the session.';
COMMENT ON COLUMN public.account_sessions.account_session_account_device_id IS 'Account-specific Device relationship used by the session, when known.';
COMMENT ON COLUMN public.account_sessions.account_session_status IS 'Session status: active, expired, revoked, or signed_out.';
COMMENT ON COLUMN public.account_sessions.account_session_started_at IS 'Timestamp when the session started.';
COMMENT ON COLUMN public.account_sessions.account_session_last_seen_at IS 'Most recent platform activity observed for the session.';
COMMENT ON COLUMN public.account_sessions.account_session_expires_at IS 'Last known external or platform expiration timestamp.';
COMMENT ON COLUMN public.account_sessions.account_session_revoked_at IS 'Timestamp when the platform revoked the session.';
COMMENT ON COLUMN public.account_sessions.account_session_revoked_by_account_id IS 'Account that requested or performed session revocation; may be null for controlled system revocation.';
COMMENT ON COLUMN public.account_sessions.account_session_revoke_reason IS 'Reason the session was revoked.';
COMMENT ON COLUMN public.account_sessions.account_session_created_at IS 'Timestamp when the session ledger entry was created.';
COMMENT ON COLUMN public.account_sessions.account_session_updated_at IS 'Timestamp when mutable session-ledger state was last modified.';

CREATE INDEX ix_account_sessions__account ON public.account_sessions (account_session_account_id);
CREATE INDEX ix_account_sessions__device ON public.account_sessions (account_session_account_device_id);
CREATE INDEX ix_account_sessions__status_seen ON public.account_sessions (account_session_status, account_session_last_seen_at);
CREATE OR REPLACE FUNCTION public.set_session_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.account_session_updated_at := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_account_sessions__updated_at
BEFORE UPDATE ON public.account_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_session_updated_at();

-- ============================================================================
-- 5. LINE CHANNEL AND LOGIN IDENTITY DOMAIN
-- ============================================================================

CREATE TABLE public.line_channel_configs (
  line_channel_config_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_lcc PRIMARY KEY,
  line_channel_provider_id text NOT NULL,
  line_channel_external_channel_id text NOT NULL,
  line_channel_type text NOT NULL,
  line_channel_environment text NOT NULL,
  line_channel_display_name text NOT NULL,
  line_channel_status text NOT NULL DEFAULT 'active',
  line_channel_secret_reference text,
  line_channel_enabled_at timestamptz,
  line_channel_disabled_at timestamptz,
  line_channel_created_by_account_id uuid,
  line_channel_updated_by_account_id uuid,
  line_channel_created_at timestamptz NOT NULL DEFAULT now(),
  line_channel_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_line_channel_configs__created_by FOREIGN KEY (line_channel_created_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_line_channel_configs__updated_by FOREIGN KEY (line_channel_updated_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uq_line_channel_configs__channel_env UNIQUE (
    line_channel_external_channel_id,
    line_channel_environment
  ),
  CONSTRAINT ck_line_channel_configs__type CHECK (
    line_channel_type IN ('login', 'messaging_api')
  ),
  CONSTRAINT ck_line_channel_configs__environment CHECK (
    line_channel_environment IN ('development', 'staging', 'production')
  ),
  CONSTRAINT ck_line_channel_configs__status CHECK (
    line_channel_status IN ('active', 'disabled')
  ),
  CONSTRAINT ck_line_channel_configs__status_time CHECK (
    (line_channel_status = 'active' AND line_channel_disabled_at IS NULL)
    OR
    (line_channel_status = 'disabled' AND line_channel_disabled_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.line_channel_configs IS 'Stores non-secret configuration metadata for LINE Login and Messaging API channels.';
COMMENT ON COLUMN public.line_channel_configs.line_channel_config_id IS 'Permanent unique identifier of the LINE channel configuration.';
COMMENT ON COLUMN public.line_channel_configs.line_channel_provider_id IS 'External LINE Developers Provider identifier or stable provider key.';
COMMENT ON COLUMN public.line_channel_configs.line_channel_external_channel_id IS 'External LINE Channel ID.';
COMMENT ON COLUMN public.line_channel_configs.line_channel_type IS 'LINE channel type: login or messaging_api.';
COMMENT ON COLUMN public.line_channel_configs.line_channel_environment IS 'Deployment environment: development, staging, or production.';
COMMENT ON COLUMN public.line_channel_configs.line_channel_display_name IS 'Human-readable channel name shown in the administration UI.';
COMMENT ON COLUMN public.line_channel_configs.line_channel_status IS 'Lifecycle status: active or disabled.';
COMMENT ON COLUMN public.line_channel_configs.line_channel_secret_reference IS 'Reference name in a Secret Manager. The actual channel secret, access token, or OAuth client secret is never stored here.';
COMMENT ON COLUMN public.line_channel_configs.line_channel_enabled_at IS 'Timestamp when the channel was enabled for use.';
COMMENT ON COLUMN public.line_channel_configs.line_channel_disabled_at IS 'Timestamp when the channel was disabled.';
COMMENT ON COLUMN public.line_channel_configs.line_channel_created_by_account_id IS 'Account that created the channel configuration.';
COMMENT ON COLUMN public.line_channel_configs.line_channel_updated_by_account_id IS 'Account that last modified the channel configuration.';
COMMENT ON COLUMN public.line_channel_configs.line_channel_created_at IS 'Timestamp when the channel configuration was created.';
COMMENT ON COLUMN public.line_channel_configs.line_channel_updated_at IS 'Timestamp when the channel configuration was last modified.';

CREATE INDEX ix_line_channel_configs__provider ON public.line_channel_configs (line_channel_provider_id);
CREATE OR REPLACE FUNCTION public.set_lcc_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.line_channel_updated_at := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_line_channel_configs__updated_at
BEFORE UPDATE ON public.line_channel_configs
FOR EACH ROW EXECUTE FUNCTION public.set_lcc_updated_at();

CREATE TABLE public.identities (
  identity_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_identity PRIMARY KEY,
  identity_account_id uuid NOT NULL,
  identity_provider text NOT NULL,
  identity_provider_subject text NOT NULL,
  identity_provider_tenant text NOT NULL,
  identity_line_channel_config_id uuid,
  identity_provider_email text,
  identity_provider_display_name text,
  identity_provider_avatar_url text,
  identity_status text NOT NULL DEFAULT 'active',
  identity_bound_at timestamptz NOT NULL DEFAULT now(),
  identity_bound_by_account_id uuid,
  identity_unbound_at timestamptz,
  identity_unbound_by_account_id uuid,
  identity_unbind_reason_code text,
  identity_unbind_reason_detail text,
  identity_last_login_at timestamptz,
  identity_created_at timestamptz NOT NULL DEFAULT now(),
  identity_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_identities__accounts FOREIGN KEY (identity_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_identities__line_channel FOREIGN KEY (identity_line_channel_config_id)
    REFERENCES public.line_channel_configs(line_channel_config_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_identities__bound_by FOREIGN KEY (identity_bound_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_identities__unbound_by FOREIGN KEY (identity_unbound_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_identities__provider CHECK (
    identity_provider IN ('line', 'google', 'apple', 'email')
  ),
  CONSTRAINT ck_identities__status CHECK (
    identity_status IN ('active', 'unbound', 'revoked', 'blocked')
  ),
  CONSTRAINT ck_identities__line_channel CHECK (
    identity_provider = 'line' OR identity_line_channel_config_id IS NULL
  ),
  CONSTRAINT ck_identities__unbound_state CHECK (
    (identity_status = 'unbound' AND identity_unbound_at IS NOT NULL
      AND identity_unbound_by_account_id IS NOT NULL
      AND identity_unbind_reason_code IS NOT NULL)
    OR
    (identity_status <> 'unbound' AND identity_unbound_at IS NULL
      AND identity_unbound_by_account_id IS NULL
      AND identity_unbind_reason_code IS NULL
      AND identity_unbind_reason_detail IS NULL)
  ),
  CONSTRAINT ck_identities__avatar_url CHECK (
    identity_provider_avatar_url IS NULL OR char_length(identity_provider_avatar_url) <= 2048
  )
);

COMMENT ON TABLE public.identities IS 'Stores login-provider identities bound to Accounts. LINE Login identities remain separate from LINE Official Account contacts.';
COMMENT ON COLUMN public.identities.identity_id IS 'Permanent unique identifier of the login identity record.';
COMMENT ON COLUMN public.identities.identity_account_id IS 'Platform Account currently bound to the identity.';
COMMENT ON COLUMN public.identities.identity_provider IS 'Authentication provider: line, google, apple, or email.';
COMMENT ON COLUMN public.identities.identity_provider_subject IS 'Provider-issued stable subject identifier.';
COMMENT ON COLUMN public.identities.identity_provider_tenant IS 'OAuth application, provider tenant, or channel namespace used to scope the subject.';
COMMENT ON COLUMN public.identities.identity_line_channel_config_id IS 'LINE Login channel configuration when provider is line; null for non-LINE identities.';
COMMENT ON COLUMN public.identities.identity_provider_email IS 'Email returned by the provider. It does not replace a verified Person Contact.';
COMMENT ON COLUMN public.identities.identity_provider_display_name IS 'Display name returned by the provider.';
COMMENT ON COLUMN public.identities.identity_provider_avatar_url IS 'Avatar URL returned by the provider.';
COMMENT ON COLUMN public.identities.identity_status IS 'Lifecycle status: active, unbound, revoked, or blocked.';
COMMENT ON COLUMN public.identities.identity_bound_at IS 'Timestamp when the identity became bound to the Account.';
COMMENT ON COLUMN public.identities.identity_bound_by_account_id IS 'Account that performed or confirmed the binding.';
COMMENT ON COLUMN public.identities.identity_unbound_at IS 'Timestamp when the identity was unbound.';
COMMENT ON COLUMN public.identities.identity_unbound_by_account_id IS 'Account that performed the unbinding.';
COMMENT ON COLUMN public.identities.identity_unbind_reason_code IS 'Structured reason for unbinding.';
COMMENT ON COLUMN public.identities.identity_unbind_reason_detail IS 'Additional explanation for unbinding.';
COMMENT ON COLUMN public.identities.identity_last_login_at IS 'Latest successful login timestamp using this identity.';
COMMENT ON COLUMN public.identities.identity_created_at IS 'Timestamp when the identity row was created.';
COMMENT ON COLUMN public.identities.identity_updated_at IS 'Timestamp when mutable identity state was last modified.';

CREATE UNIQUE INDEX uq_identities__active_subject
  ON public.identities (
    identity_provider,
    identity_provider_tenant,
    identity_provider_subject
  )
  WHERE identity_status = 'active';
CREATE INDEX ix_identities__account ON public.identities (identity_account_id);
CREATE INDEX ix_identities__line_channel ON public.identities (identity_line_channel_config_id);
CREATE OR REPLACE FUNCTION public.set_identity_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.identity_updated_at := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_identities__updated_at
BEFORE UPDATE ON public.identities
FOR EACH ROW EXECUTE FUNCTION public.set_identity_updated_at();

CREATE OR REPLACE FUNCTION public.guard_identity_human_account()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts
    WHERE account_id = NEW.identity_account_id
      AND account_kind = 'human'
      AND account_status IN ('active', 'suspended', 'locked')
  ) THEN
    RAISE EXCEPTION 'Identity may only reference a live human Account'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_identities__human_account
BEFORE INSERT OR UPDATE OF identity_account_id ON public.identities
FOR EACH ROW EXECUTE FUNCTION public.guard_identity_human_account();

CREATE OR REPLACE FUNCTION public.guard_session_human_account()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts
    WHERE account_id = NEW.account_session_account_id
      AND account_kind = 'human'
      AND account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Session may only be created for an active human Account'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sessions__human_account
BEFORE INSERT OR UPDATE OF account_session_account_id ON public.account_sessions
FOR EACH ROW EXECUTE FUNCTION public.guard_session_human_account();

CREATE OR REPLACE FUNCTION public.guard_system_account_conversion()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.account_kind = 'system' AND OLD.account_kind <> 'system' AND (
    EXISTS (SELECT 1 FROM public.identities WHERE identity_account_id = NEW.account_id)
    OR EXISTS (SELECT 1 FROM public.account_sessions WHERE account_session_account_id = NEW.account_id)
  ) THEN
    RAISE EXCEPTION 'Account with identity or session history cannot become a system Account'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_accounts__guard_system_conversion
BEFORE UPDATE OF account_kind ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.guard_system_account_conversion();

CREATE OR REPLACE FUNCTION public.guard_terminal_account_login_state()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.account_status IN ('closed', 'merged', 'anonymized') AND (
    EXISTS (
      SELECT 1 FROM public.identities
      WHERE identity_account_id = NEW.account_id AND identity_status = 'active'
    ) OR EXISTS (
      SELECT 1 FROM public.account_sessions
      WHERE account_session_account_id = NEW.account_id AND account_session_status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'Active identities and sessions must be ended before terminal Account status'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_accounts__guard_terminal_login
BEFORE UPDATE OF account_status ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.guard_terminal_account_login_state();

CREATE TABLE public.login_events (
  login_event_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_le PRIMARY KEY,
  login_event_account_id uuid,
  login_event_identity_id uuid,
  login_event_account_device_id uuid,
  login_event_account_session_id uuid,
  login_event_channel_config_id uuid,
  login_event_type text NOT NULL,
  login_event_result text NOT NULL,
  login_event_failure_reason text,
  login_event_ip_address inet,
  login_event_user_agent text,
  login_event_request_id uuid,
  login_event_occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_login_events__account FOREIGN KEY (login_event_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_login_events__identity FOREIGN KEY (login_event_identity_id)
    REFERENCES public.identities(identity_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_login_events__account_device FOREIGN KEY (login_event_account_device_id)
    REFERENCES public.account_devices(account_device_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_login_events__session FOREIGN KEY (login_event_account_session_id)
    REFERENCES public.account_sessions(account_session_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_login_events__channel FOREIGN KEY (login_event_channel_config_id)
    REFERENCES public.line_channel_configs(line_channel_config_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_login_events__type CHECK (
    login_event_type IN (
      'login_success', 'login_failed', 'logout', 'session_revoked', 'session_expired',
      'token_refresh_failed', 'oauth_callback_failed', 'account_blocked',
      'identity_bound', 'identity_unbound'
    )
  ),
  CONSTRAINT ck_login_events__result CHECK (
    login_event_result IN ('success', 'failure', 'blocked')
  ),
  CONSTRAINT ck_login_events__failure CHECK (
    login_event_result = 'success' OR login_event_failure_reason IS NOT NULL
  )
);

COMMENT ON TABLE public.login_events IS 'Append-only authentication and session-security events.';
COMMENT ON COLUMN public.login_events.login_event_id IS 'Permanent unique identifier of the login/security event.';
COMMENT ON COLUMN public.login_events.login_event_account_id IS 'Account involved in the event; may be null when login fails before account resolution.';
COMMENT ON COLUMN public.login_events.login_event_identity_id IS 'Identity used or affected by the event.';
COMMENT ON COLUMN public.login_events.login_event_account_device_id IS 'Account-specific Device relationship observed during the event.';
COMMENT ON COLUMN public.login_events.login_event_account_session_id IS 'Platform session ledger entry involved in the event.';
COMMENT ON COLUMN public.login_events.login_event_channel_config_id IS 'LINE channel configuration that handled the login event, allowing environment and channel attribution.';
COMMENT ON COLUMN public.login_events.login_event_type IS 'Security event type, such as login_success, login_failed, logout, or session_revoked.';
COMMENT ON COLUMN public.login_events.login_event_result IS 'Event result: success, failure, or blocked.';
COMMENT ON COLUMN public.login_events.login_event_failure_reason IS 'Reason for failure or blocking.';
COMMENT ON COLUMN public.login_events.login_event_ip_address IS 'Source IP address stored using PostgreSQL inet.';
COMMENT ON COLUMN public.login_events.login_event_user_agent IS 'Observed user-agent string for security investigation.';
COMMENT ON COLUMN public.login_events.login_event_request_id IS 'Request identifier used to correlate logs across services.';
COMMENT ON COLUMN public.login_events.login_event_occurred_at IS 'Timestamp when the event occurred.';

CREATE INDEX ix_login_events__account_time ON public.login_events (login_event_account_id, login_event_occurred_at DESC);
CREATE INDEX ix_login_events__identity_time ON public.login_events (login_event_identity_id, login_event_occurred_at DESC);
CREATE INDEX ix_login_events__session ON public.login_events (login_event_account_session_id);
CREATE INDEX ix_login_events__channel_time ON public.login_events (login_event_channel_config_id, login_event_occurred_at DESC);
CREATE INDEX ix_login_events__request ON public.login_events (login_event_request_id);
CREATE INDEX ix_le__account_device_time ON public.login_events (login_event_account_device_id, login_event_occurred_at DESC);

-- ============================================================================
-- 6. INVITATION DOMAIN
-- ============================================================================

CREATE TABLE public.invitations (
  invitation_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_invitation PRIMARY KEY,
  invitation_membership_id uuid NOT NULL,
  invitation_token_digest bytea NOT NULL,
  invitation_token_hash_version smallint NOT NULL,
  invitation_delivery_channel text NOT NULL,
  invitation_destination_masked text,
  invitation_status text NOT NULL DEFAULT 'pending',
  invitation_expires_at timestamptz NOT NULL,
  invitation_accepted_at timestamptz,
  invitation_accepted_by_account_id uuid,
  invitation_revoked_at timestamptz,
  invitation_revoked_by_account_id uuid,
  invitation_revoke_reason text,
  invitation_marked_expired_at timestamptz,
  invitation_created_by_account_id uuid NOT NULL,
  invitation_created_at timestamptz NOT NULL DEFAULT now(),
  invitation_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_invitations__membership FOREIGN KEY (invitation_membership_id)
    REFERENCES public.memberships(membership_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_invitations__accepted_by FOREIGN KEY (invitation_accepted_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_invitations__revoked_by FOREIGN KEY (invitation_revoked_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_invitations__created_by FOREIGN KEY (invitation_created_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uq_invitations__token_digest UNIQUE (
    invitation_token_hash_version,
    invitation_token_digest
  ),
  CONSTRAINT ck_invitations__hash_version CHECK (invitation_token_hash_version > 0),
  CONSTRAINT ck_invitations__delivery CHECK (
    invitation_delivery_channel IN ('line_oa', 'email', 'sms', 'manual_link')
  ),
  CONSTRAINT ck_invitations__status CHECK (
    invitation_status IN ('pending', 'accepted', 'expired', 'revoked')
  ),
  CONSTRAINT ck_invitations__expiry_after_create CHECK (
    invitation_expires_at > invitation_created_at
  ),
  CONSTRAINT ck_invitations__accepted_state CHECK (
    (invitation_status = 'accepted' AND invitation_accepted_at IS NOT NULL
      AND invitation_accepted_by_account_id IS NOT NULL
      AND invitation_revoked_at IS NULL
      AND invitation_marked_expired_at IS NULL)
    OR
    (invitation_status <> 'accepted' AND invitation_accepted_at IS NULL
      AND invitation_accepted_by_account_id IS NULL)
  ),
  CONSTRAINT ck_invitations__revoked_state CHECK (
    (invitation_status = 'revoked' AND invitation_revoked_at IS NOT NULL
      AND invitation_revoked_by_account_id IS NOT NULL
      AND invitation_revoke_reason IS NOT NULL
      AND invitation_accepted_at IS NULL
      AND invitation_marked_expired_at IS NULL)
    OR
    (invitation_status <> 'revoked' AND invitation_revoked_at IS NULL
      AND invitation_revoked_by_account_id IS NULL
      AND invitation_revoke_reason IS NULL)
  ),
  CONSTRAINT ck_invitations__expired_state CHECK (
    (invitation_status = 'expired' AND invitation_marked_expired_at IS NOT NULL
      AND invitation_accepted_at IS NULL
      AND invitation_revoked_at IS NULL)
    OR
    (invitation_status <> 'expired' AND invitation_marked_expired_at IS NULL)
  ),
  CONSTRAINT ck_invitations__pending_state CHECK (
    invitation_status <> 'pending'
    OR
    (invitation_accepted_at IS NULL AND invitation_revoked_at IS NULL AND invitation_marked_expired_at IS NULL)
  )
);

COMMENT ON TABLE public.invitations IS 'Single-use invitation records for onboarding one Membership into the platform.';
COMMENT ON COLUMN public.invitations.invitation_id IS 'Permanent unique identifier of the invitation.';
COMMENT ON COLUMN public.invitations.invitation_membership_id IS 'Membership targeted by the invitation.';
COMMENT ON COLUMN public.invitations.invitation_token_digest IS 'HMAC-SHA-256 digest of the high-entropy token. Plaintext tokens are never stored. HMAC is calculated only in a trusted backend or Edge Function.';
COMMENT ON COLUMN public.invitations.invitation_token_hash_version IS 'Version prefix and server-key version used to calculate the digest.';
COMMENT ON COLUMN public.invitations.invitation_delivery_channel IS 'Delivery route: line_oa, email, sms, or manual_link.';
COMMENT ON COLUMN public.invitations.invitation_destination_masked IS 'Masked recipient address shown to administrators without exposing the full destination.';
COMMENT ON COLUMN public.invitations.invitation_status IS 'Current status: pending, accepted, expired, or revoked.';
COMMENT ON COLUMN public.invitations.invitation_expires_at IS 'Actual security expiration timestamp checked at acceptance time.';
COMMENT ON COLUMN public.invitations.invitation_accepted_at IS 'Timestamp when the invitation was successfully accepted.';
COMMENT ON COLUMN public.invitations.invitation_accepted_by_account_id IS 'Account that accepted the invitation.';
COMMENT ON COLUMN public.invitations.invitation_revoked_at IS 'Timestamp when the invitation was revoked before acceptance.';
COMMENT ON COLUMN public.invitations.invitation_revoked_by_account_id IS 'Account that revoked the invitation.';
COMMENT ON COLUMN public.invitations.invitation_revoke_reason IS 'Reason for revocation.';
COMMENT ON COLUMN public.invitations.invitation_marked_expired_at IS 'Timestamp when a job or transaction formally marked the row expired. The security decision still uses invitation_expires_at in real time.';
COMMENT ON COLUMN public.invitations.invitation_created_by_account_id IS 'Account that created the invitation.';
COMMENT ON COLUMN public.invitations.invitation_created_at IS 'Timestamp when the invitation row was created.';
COMMENT ON COLUMN public.invitations.invitation_updated_at IS 'Timestamp when mutable invitation state was last modified.';

CREATE UNIQUE INDEX uq_invitations__membership_pending
  ON public.invitations (invitation_membership_id)
  WHERE invitation_status = 'pending'
    AND invitation_revoked_at IS NULL
    AND invitation_accepted_at IS NULL;
CREATE INDEX ix_invitations__membership ON public.invitations (invitation_membership_id);
CREATE INDEX ix_invitations__status_expiry ON public.invitations (invitation_status, invitation_expires_at);
CREATE OR REPLACE FUNCTION public.set_invitation_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.invitation_updated_at := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_invitations__updated_at
BEFORE UPDATE ON public.invitations
FOR EACH ROW EXECUTE FUNCTION public.set_invitation_updated_at();

CREATE TABLE public.invitation_events (
  invitation_event_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_ie PRIMARY KEY,
  invitation_event_invitation_id uuid NOT NULL,
  invitation_event_type text NOT NULL,
  invitation_event_actor_account_id uuid,
  invitation_event_result text NOT NULL,
  invitation_event_reason_code text,
  invitation_event_reason_detail text,
  invitation_event_request_id uuid,
  invitation_event_occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_invitation_events__invitation FOREIGN KEY (invitation_event_invitation_id)
    REFERENCES public.invitations(invitation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_invitation_events__actor FOREIGN KEY (invitation_event_actor_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_invitation_events__type CHECK (
    invitation_event_type IN ('created', 'sent', 'resent', 'accepted', 'revoked', 'expired', 'validation_failed')
  ),
  CONSTRAINT ck_invitation_events__result CHECK (
    invitation_event_result IN ('success', 'failure', 'blocked')
  )
);

COMMENT ON TABLE public.invitation_events IS 'Append-only history of invitation creation, delivery, resend, acceptance, revocation, expiration, and validation failures.';
COMMENT ON COLUMN public.invitation_events.invitation_event_id IS 'Permanent unique identifier of the invitation event.';
COMMENT ON COLUMN public.invitation_events.invitation_event_invitation_id IS 'Invitation to which this event belongs.';
COMMENT ON COLUMN public.invitation_events.invitation_event_type IS 'Event type such as created, sent, accepted, revoked, or validation_failed.';
COMMENT ON COLUMN public.invitation_events.invitation_event_actor_account_id IS 'Account responsible for the event; null is allowed for controlled system jobs.';
COMMENT ON COLUMN public.invitation_events.invitation_event_result IS 'Event result: success, failure, or blocked.';
COMMENT ON COLUMN public.invitation_events.invitation_event_reason_code IS 'Structured reason code for the event result.';
COMMENT ON COLUMN public.invitation_events.invitation_event_reason_detail IS 'Additional explanation of the event.';
COMMENT ON COLUMN public.invitation_events.invitation_event_request_id IS 'Request identifier used to correlate API, audit, and idempotency records.';
COMMENT ON COLUMN public.invitation_events.invitation_event_occurred_at IS 'Timestamp when the invitation event occurred.';

CREATE INDEX ix_invitation_events__invitation_time
  ON public.invitation_events (invitation_event_invitation_id, invitation_event_occurred_at);
CREATE INDEX ix_invitation_events__request ON public.invitation_events (invitation_event_request_id);

-- ============================================================================
-- 7. ROLE AND PERMISSION DOMAIN
-- ============================================================================

CREATE TABLE public.roles (
  role_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_role PRIMARY KEY,
  role_scope_type text NOT NULL,
  role_code text NOT NULL,
  role_name text NOT NULL,
  role_description text,
  role_is_system_role boolean NOT NULL DEFAULT false,
  role_status text NOT NULL DEFAULT 'active',
  role_created_at timestamptz NOT NULL DEFAULT now(),
  role_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_roles__code UNIQUE (role_code),
  CONSTRAINT ck_roles__scope CHECK (role_scope_type IN ('platform', 'district', 'club')),
  CONSTRAINT ck_roles__status CHECK (role_status IN ('active', 'inactive'))
);

COMMENT ON TABLE public.roles IS 'Defines assignable roles at platform, district, or club scope. Club-term limitation is represented by membership_role_assignments.club_term_id rather than a separate scope type.';
COMMENT ON COLUMN public.roles.role_id IS 'Permanent unique identifier of the role.';
COMMENT ON COLUMN public.roles.role_scope_type IS 'Authorization scope type: platform, district, or club.';
COMMENT ON COLUMN public.roles.role_code IS 'Stable machine-readable role code, such as club.secretary.';
COMMENT ON COLUMN public.roles.role_name IS 'Human-readable role name.';
COMMENT ON COLUMN public.roles.role_description IS 'Formal explanation of the role responsibilities and intended scope.';
COMMENT ON COLUMN public.roles.role_is_system_role IS 'Whether the role is a protected system-defined role.';
COMMENT ON COLUMN public.roles.role_status IS 'Lifecycle status: active or inactive.';
COMMENT ON COLUMN public.roles.role_created_at IS 'Timestamp when the role was created.';
COMMENT ON COLUMN public.roles.role_updated_at IS 'Timestamp when the role was last modified.';

CREATE OR REPLACE FUNCTION public.set_role_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.role_updated_at := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_roles__updated_at
BEFORE UPDATE ON public.roles
FOR EACH ROW EXECUTE FUNCTION public.set_role_updated_at();

CREATE TABLE public.permissions (
  permission_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_permission PRIMARY KEY,
  permission_code text NOT NULL,
  permission_resource text NOT NULL,
  permission_action text NOT NULL,
  permission_description text,
  permission_risk_level text NOT NULL DEFAULT 'low',
  permission_status text NOT NULL DEFAULT 'active',
  permission_created_at timestamptz NOT NULL DEFAULT now(),
  permission_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_permissions__code UNIQUE (permission_code),
  CONSTRAINT ck_permissions__risk CHECK (permission_risk_level IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT ck_permissions__status CHECK (permission_status IN ('active', 'inactive'))
);

COMMENT ON TABLE public.permissions IS 'Defines one specific action that can be granted to a role.';
COMMENT ON COLUMN public.permissions.permission_id IS 'Permanent unique identifier of the permission.';
COMMENT ON COLUMN public.permissions.permission_code IS 'Stable machine-readable permission code, such as member.read or identity.unbind.';
COMMENT ON COLUMN public.permissions.permission_resource IS 'Resource controlled by the permission.';
COMMENT ON COLUMN public.permissions.permission_action IS 'Action allowed on the resource.';
COMMENT ON COLUMN public.permissions.permission_description IS 'Formal explanation of what the permission allows.';
COMMENT ON COLUMN public.permissions.permission_risk_level IS 'Security risk classification: low, medium, high, or critical.';
COMMENT ON COLUMN public.permissions.permission_status IS 'Lifecycle status: active or inactive.';
COMMENT ON COLUMN public.permissions.permission_created_at IS 'Timestamp when the permission was created.';
COMMENT ON COLUMN public.permissions.permission_updated_at IS 'Timestamp when the permission was last modified.';

CREATE OR REPLACE FUNCTION public.set_permission_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.permission_updated_at := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_permissions__updated_at
BEFORE UPDATE ON public.permissions
FOR EACH ROW EXECUTE FUNCTION public.set_permission_updated_at();

CREATE TABLE public.role_permissions (
  role_permission_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_rp PRIMARY KEY,
  role_permission_role_id uuid NOT NULL,
  role_permission_permission_id uuid NOT NULL,
  role_permission_granted_by_account_id uuid NOT NULL,
  role_permission_granted_at timestamptz NOT NULL DEFAULT now(),
  role_permission_created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_role_permissions__role FOREIGN KEY (role_permission_role_id)
    REFERENCES public.roles(role_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_role_permissions__permission FOREIGN KEY (role_permission_permission_id)
    REFERENCES public.permissions(permission_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_role_permissions__granted_by FOREIGN KEY (role_permission_granted_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uq_role_permissions__pair UNIQUE (role_permission_role_id, role_permission_permission_id)
);

COMMENT ON TABLE public.role_permissions IS 'Many-to-many mapping between Roles and Permissions.';
COMMENT ON COLUMN public.role_permissions.role_permission_id IS 'Permanent unique identifier of the role-permission mapping.';
COMMENT ON COLUMN public.role_permissions.role_permission_role_id IS 'Role receiving the permission.';
COMMENT ON COLUMN public.role_permissions.role_permission_permission_id IS 'Permission granted to the role.';
COMMENT ON COLUMN public.role_permissions.role_permission_granted_by_account_id IS 'Account that granted the permission to the role.';
COMMENT ON COLUMN public.role_permissions.role_permission_granted_at IS 'Timestamp when the permission grant became effective.';
COMMENT ON COLUMN public.role_permissions.role_permission_created_at IS 'Timestamp when the mapping row was created.';

CREATE INDEX ix_role_permissions__role ON public.role_permissions (role_permission_role_id);
CREATE INDEX ix_role_permissions__permission ON public.role_permissions (role_permission_permission_id);

CREATE TABLE public.platform_role_assignments (
  platform_role_assignment_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_pra PRIMARY KEY,
  platform_role_assignment_account_id uuid NOT NULL,
  platform_role_assignment_role_id uuid NOT NULL,
  platform_role_assignment_starts_at timestamptz NOT NULL,
  platform_role_assignment_ends_at timestamptz,
  platform_role_assignment_status text NOT NULL DEFAULT 'scheduled',
  platform_role_assignment_assigned_by_account_id uuid NOT NULL,
  platform_role_assignment_assigned_at timestamptz NOT NULL DEFAULT now(),
  platform_role_assignment_revoked_at timestamptz,
  platform_role_assignment_revoked_by_account_id uuid,
  platform_role_assignment_reason_code text NOT NULL,
  platform_role_assignment_reason_detail text,
  CONSTRAINT fk_platform_role_assignments__account FOREIGN KEY (platform_role_assignment_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_platform_role_assignments__role FOREIGN KEY (platform_role_assignment_role_id)
    REFERENCES public.roles(role_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_platform_role_assignments__assigned_by FOREIGN KEY (platform_role_assignment_assigned_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_platform_role_assignments__revoked_by FOREIGN KEY (platform_role_assignment_revoked_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_platform_role_assignments__dates CHECK (
    platform_role_assignment_ends_at IS NULL OR platform_role_assignment_ends_at > platform_role_assignment_starts_at
  ),
  CONSTRAINT ck_platform_role_assignments__status CHECK (
    platform_role_assignment_status IN ('scheduled', 'active', 'expired', 'revoked')
  ),
  CONSTRAINT ck_platform_role_assignments__revoked CHECK (
    (platform_role_assignment_status = 'revoked'
      AND platform_role_assignment_revoked_at IS NOT NULL
      AND platform_role_assignment_revoked_by_account_id IS NOT NULL)
    OR
    (platform_role_assignment_status <> 'revoked'
      AND platform_role_assignment_revoked_at IS NULL
      AND platform_role_assignment_revoked_by_account_id IS NULL)
  )
);

COMMENT ON TABLE public.platform_role_assignments IS 'Assigns a platform-scoped Role to an Account for a bounded or open-ended period.';
COMMENT ON COLUMN public.platform_role_assignments.platform_role_assignment_id IS 'Permanent unique identifier of the platform role assignment.';
COMMENT ON COLUMN public.platform_role_assignments.platform_role_assignment_account_id IS 'Account receiving the platform role.';
COMMENT ON COLUMN public.platform_role_assignments.platform_role_assignment_role_id IS 'Platform-scoped Role being assigned.';
COMMENT ON COLUMN public.platform_role_assignments.platform_role_assignment_starts_at IS 'Timestamp when the assignment begins.';
COMMENT ON COLUMN public.platform_role_assignments.platform_role_assignment_ends_at IS 'Timestamp when the assignment ends, if predetermined.';
COMMENT ON COLUMN public.platform_role_assignments.platform_role_assignment_status IS 'Assignment status: scheduled, active, expired, or revoked.';
COMMENT ON COLUMN public.platform_role_assignments.platform_role_assignment_assigned_by_account_id IS 'Account that created the assignment.';
COMMENT ON COLUMN public.platform_role_assignments.platform_role_assignment_assigned_at IS 'Timestamp when the assignment record was created.';
COMMENT ON COLUMN public.platform_role_assignments.platform_role_assignment_revoked_at IS 'Timestamp when the assignment was revoked early.';
COMMENT ON COLUMN public.platform_role_assignments.platform_role_assignment_revoked_by_account_id IS 'Account that revoked the assignment.';
COMMENT ON COLUMN public.platform_role_assignments.platform_role_assignment_reason_code IS 'Structured reason for assignment or revocation.';
COMMENT ON COLUMN public.platform_role_assignments.platform_role_assignment_reason_detail IS 'Additional explanation for assignment or revocation.';

CREATE INDEX ix_platform_role_assignments__account ON public.platform_role_assignments (platform_role_assignment_account_id);
CREATE INDEX ix_pra__role ON public.platform_role_assignments (platform_role_assignment_role_id);
CREATE UNIQUE INDEX uq_platform_role_assignments__active
  ON public.platform_role_assignments (platform_role_assignment_account_id, platform_role_assignment_role_id)
  WHERE platform_role_assignment_status = 'active' AND platform_role_assignment_revoked_at IS NULL;

CREATE TABLE public.district_role_assignments (
  district_role_assignment_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_dra PRIMARY KEY,
  district_role_assignment_account_id uuid NOT NULL,
  district_role_assignment_district_id uuid NOT NULL,
  district_role_assignment_role_id uuid NOT NULL,
  district_role_assignment_starts_at timestamptz NOT NULL,
  district_role_assignment_ends_at timestamptz,
  district_role_assignment_status text NOT NULL DEFAULT 'scheduled',
  district_role_assignment_assigned_by_account_id uuid NOT NULL,
  district_role_assignment_assigned_at timestamptz NOT NULL DEFAULT now(),
  district_role_assignment_revoked_at timestamptz,
  district_role_assignment_revoked_by_account_id uuid,
  district_role_assignment_reason_code text NOT NULL,
  district_role_assignment_reason_detail text,
  CONSTRAINT fk_district_role_assignments__account FOREIGN KEY (district_role_assignment_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_district_role_assignments__district FOREIGN KEY (district_role_assignment_district_id)
    REFERENCES public.districts(district_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_district_role_assignments__role FOREIGN KEY (district_role_assignment_role_id)
    REFERENCES public.roles(role_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_district_role_assignments__assigned_by FOREIGN KEY (district_role_assignment_assigned_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_district_role_assignments__revoked_by FOREIGN KEY (district_role_assignment_revoked_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_district_role_assignments__dates CHECK (
    district_role_assignment_ends_at IS NULL OR district_role_assignment_ends_at > district_role_assignment_starts_at
  ),
  CONSTRAINT ck_district_role_assignments__status CHECK (
    district_role_assignment_status IN ('scheduled', 'active', 'expired', 'revoked')
  ),
  CONSTRAINT ck_district_role_assignments__revoked CHECK (
    (district_role_assignment_status = 'revoked'
      AND district_role_assignment_revoked_at IS NOT NULL
      AND district_role_assignment_revoked_by_account_id IS NOT NULL)
    OR
    (district_role_assignment_status <> 'revoked'
      AND district_role_assignment_revoked_at IS NULL
      AND district_role_assignment_revoked_by_account_id IS NULL)
  )
);

COMMENT ON TABLE public.district_role_assignments IS 'Assigns a district-scoped Role to an Account within one District.';
COMMENT ON COLUMN public.district_role_assignments.district_role_assignment_id IS 'Permanent unique identifier of the district role assignment.';
COMMENT ON COLUMN public.district_role_assignments.district_role_assignment_account_id IS 'Account receiving the district role.';
COMMENT ON COLUMN public.district_role_assignments.district_role_assignment_district_id IS 'District in which the role applies.';
COMMENT ON COLUMN public.district_role_assignments.district_role_assignment_role_id IS 'District-scoped Role being assigned.';
COMMENT ON COLUMN public.district_role_assignments.district_role_assignment_starts_at IS 'Timestamp when the district assignment begins.';
COMMENT ON COLUMN public.district_role_assignments.district_role_assignment_ends_at IS 'Timestamp when the district assignment ends, if predetermined.';
COMMENT ON COLUMN public.district_role_assignments.district_role_assignment_status IS 'Assignment status: scheduled, active, expired, or revoked.';
COMMENT ON COLUMN public.district_role_assignments.district_role_assignment_assigned_by_account_id IS 'Account that created the district assignment.';
COMMENT ON COLUMN public.district_role_assignments.district_role_assignment_assigned_at IS 'Timestamp when the district assignment was created.';
COMMENT ON COLUMN public.district_role_assignments.district_role_assignment_revoked_at IS 'Timestamp when the district assignment was revoked early.';
COMMENT ON COLUMN public.district_role_assignments.district_role_assignment_revoked_by_account_id IS 'Account that revoked the district assignment.';
COMMENT ON COLUMN public.district_role_assignments.district_role_assignment_reason_code IS 'Structured reason for assignment or revocation.';
COMMENT ON COLUMN public.district_role_assignments.district_role_assignment_reason_detail IS 'Additional explanation for assignment or revocation.';

CREATE INDEX ix_district_role_assignments__account ON public.district_role_assignments (district_role_assignment_account_id);
CREATE INDEX ix_district_role_assignments__district ON public.district_role_assignments (district_role_assignment_district_id);
CREATE INDEX ix_dra__role ON public.district_role_assignments (district_role_assignment_role_id);
CREATE UNIQUE INDEX uq_district_role_assignments__active
  ON public.district_role_assignments (
    district_role_assignment_account_id,
    district_role_assignment_district_id,
    district_role_assignment_role_id
  )
  WHERE district_role_assignment_status = 'active' AND district_role_assignment_revoked_at IS NULL;

CREATE TABLE public.membership_role_assignments (
  membership_role_assignment_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_mra PRIMARY KEY,
  membership_role_assignment_membership_id uuid NOT NULL,
  membership_role_assignment_role_id uuid NOT NULL,
  membership_role_assignment_club_term_id uuid,
  membership_role_assignment_starts_at timestamptz NOT NULL,
  membership_role_assignment_ends_at timestamptz,
  membership_role_assignment_status text NOT NULL DEFAULT 'scheduled',
  membership_role_assignment_assigned_by_account_id uuid NOT NULL,
  membership_role_assignment_assigned_at timestamptz NOT NULL DEFAULT now(),
  membership_role_assignment_revoked_at timestamptz,
  membership_role_assignment_revoked_by_account_id uuid,
  membership_role_assignment_reason_code text NOT NULL,
  membership_role_assignment_reason_detail text,
  CONSTRAINT fk_membership_role_assignments__membership FOREIGN KEY (membership_role_assignment_membership_id)
    REFERENCES public.memberships(membership_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_membership_role_assignments__role FOREIGN KEY (membership_role_assignment_role_id)
    REFERENCES public.roles(role_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_membership_role_assignments__term FOREIGN KEY (membership_role_assignment_club_term_id)
    REFERENCES public.club_terms(club_term_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_membership_role_assignments__assigned_by FOREIGN KEY (membership_role_assignment_assigned_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_membership_role_assignments__revoked_by FOREIGN KEY (membership_role_assignment_revoked_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_membership_role_assignments__dates CHECK (
    membership_role_assignment_ends_at IS NULL OR membership_role_assignment_ends_at > membership_role_assignment_starts_at
  ),
  CONSTRAINT ck_membership_role_assignments__status CHECK (
    membership_role_assignment_status IN ('scheduled', 'active', 'expired', 'revoked')
  ),
  CONSTRAINT ck_membership_role_assignments__revoked CHECK (
    (membership_role_assignment_status = 'revoked'
      AND membership_role_assignment_revoked_at IS NOT NULL
      AND membership_role_assignment_revoked_by_account_id IS NOT NULL)
    OR
    (membership_role_assignment_status <> 'revoked'
      AND membership_role_assignment_revoked_at IS NULL
      AND membership_role_assignment_revoked_by_account_id IS NULL)
  )
);

COMMENT ON TABLE public.membership_role_assignments IS 'Assigns a club-scoped Role to a Membership, optionally limited to a specific Club Term.';
COMMENT ON COLUMN public.membership_role_assignments.membership_role_assignment_id IS 'Permanent unique identifier of the membership role assignment.';
COMMENT ON COLUMN public.membership_role_assignments.membership_role_assignment_membership_id IS 'Membership receiving the club role.';
COMMENT ON COLUMN public.membership_role_assignments.membership_role_assignment_role_id IS 'Club-scoped Role being assigned.';
COMMENT ON COLUMN public.membership_role_assignments.membership_role_assignment_club_term_id IS 'Optional Club Term that limits the role to one Rotary year.';
COMMENT ON COLUMN public.membership_role_assignments.membership_role_assignment_starts_at IS 'Timestamp when the club role begins.';
COMMENT ON COLUMN public.membership_role_assignments.membership_role_assignment_ends_at IS 'Timestamp when the club role ends, if predetermined.';
COMMENT ON COLUMN public.membership_role_assignments.membership_role_assignment_status IS 'Assignment status: scheduled, active, expired, or revoked.';
COMMENT ON COLUMN public.membership_role_assignments.membership_role_assignment_assigned_by_account_id IS 'Account that created the club role assignment.';
COMMENT ON COLUMN public.membership_role_assignments.membership_role_assignment_assigned_at IS 'Timestamp when the club role assignment was created.';
COMMENT ON COLUMN public.membership_role_assignments.membership_role_assignment_revoked_at IS 'Timestamp when the club role was revoked early.';
COMMENT ON COLUMN public.membership_role_assignments.membership_role_assignment_revoked_by_account_id IS 'Account that revoked the club role.';
COMMENT ON COLUMN public.membership_role_assignments.membership_role_assignment_reason_code IS 'Structured reason for assignment or revocation.';
COMMENT ON COLUMN public.membership_role_assignments.membership_role_assignment_reason_detail IS 'Additional explanation for assignment or revocation.';

CREATE INDEX ix_membership_role_assignments__membership ON public.membership_role_assignments (membership_role_assignment_membership_id);
CREATE INDEX ix_membership_role_assignments__term ON public.membership_role_assignments (membership_role_assignment_club_term_id);
CREATE INDEX ix_mra__role ON public.membership_role_assignments (membership_role_assignment_role_id);
CREATE UNIQUE INDEX uq_membership_role_assignments__active
  ON public.membership_role_assignments (
    membership_role_assignment_membership_id,
    membership_role_assignment_role_id,
    COALESCE(membership_role_assignment_club_term_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE membership_role_assignment_status = 'active' AND membership_role_assignment_revoked_at IS NULL;

-- ============================================================================
-- 8. LINE OFFICIAL ACCOUNT DOMAIN
-- ============================================================================

CREATE TABLE public.line_oa_contacts (
  line_oa_contact_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_loc PRIMARY KEY,
  line_oa_contact_channel_config_id uuid NOT NULL,
  line_oa_contact_line_user_id text NOT NULL,
  line_oa_contact_display_name text,
  line_oa_contact_picture_url text,
  line_oa_contact_friendship_status text NOT NULL DEFAULT 'unknown',
  line_oa_contact_followed_at timestamptz,
  line_oa_contact_unfollowed_at timestamptz,
  line_oa_contact_last_interaction_at timestamptz,
  line_oa_contact_created_at timestamptz NOT NULL DEFAULT now(),
  line_oa_contact_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_line_oa_contacts__channel FOREIGN KEY (line_oa_contact_channel_config_id)
    REFERENCES public.line_channel_configs(line_channel_config_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uq_line_oa_contacts__channel_user UNIQUE (
    line_oa_contact_channel_config_id,
    line_oa_contact_line_user_id
  ),
  CONSTRAINT ck_line_oa_contacts__friendship CHECK (
    line_oa_contact_friendship_status IN ('unknown', 'followed', 'blocked', 'unfollowed')
  ),
  CONSTRAINT ck_line_oa_contacts__picture_url CHECK (
    line_oa_contact_picture_url IS NULL OR char_length(line_oa_contact_picture_url) <= 2048
  )
);

COMMENT ON TABLE public.line_oa_contacts IS 'Stores LINE Official Account contacts separately from LINE Login identities.';
COMMENT ON COLUMN public.line_oa_contacts.line_oa_contact_id IS 'Permanent unique identifier of the LINE OA contact.';
COMMENT ON COLUMN public.line_oa_contacts.line_oa_contact_channel_config_id IS 'Messaging API channel in which the LINE user ID is valid.';
COMMENT ON COLUMN public.line_oa_contacts.line_oa_contact_line_user_id IS 'LINE Messaging API user identifier scoped by the channel/provider configuration.';
COMMENT ON COLUMN public.line_oa_contacts.line_oa_contact_display_name IS 'Display name returned by LINE OA.';
COMMENT ON COLUMN public.line_oa_contacts.line_oa_contact_picture_url IS 'Picture URL returned by LINE OA.';
COMMENT ON COLUMN public.line_oa_contacts.line_oa_contact_friendship_status IS 'Friendship state: unknown, followed, blocked, or unfollowed.';
COMMENT ON COLUMN public.line_oa_contacts.line_oa_contact_followed_at IS 'Timestamp when the user followed the Official Account.';
COMMENT ON COLUMN public.line_oa_contacts.line_oa_contact_unfollowed_at IS 'Timestamp when the user blocked or unfollowed the Official Account.';
COMMENT ON COLUMN public.line_oa_contacts.line_oa_contact_last_interaction_at IS 'Most recent interaction observed through the Messaging API.';
COMMENT ON COLUMN public.line_oa_contacts.line_oa_contact_created_at IS 'Timestamp when the LINE OA contact row was created.';
COMMENT ON COLUMN public.line_oa_contacts.line_oa_contact_updated_at IS 'Timestamp when the LINE OA contact row was last modified.';

CREATE INDEX ix_line_oa_contacts__channel ON public.line_oa_contacts (line_oa_contact_channel_config_id);
CREATE INDEX ix_line_oa_contacts__friendship ON public.line_oa_contacts (line_oa_contact_friendship_status);
CREATE OR REPLACE FUNCTION public.set_loc_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.line_oa_contact_updated_at := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_line_oa_contacts__updated_at
BEFORE UPDATE ON public.line_oa_contacts
FOR EACH ROW EXECUTE FUNCTION public.set_loc_updated_at();

CREATE TABLE public.line_oa_member_links (
  line_oa_member_link_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_loml PRIMARY KEY,
  line_oa_member_link_contact_id uuid NOT NULL,
  line_oa_member_link_person_id uuid NOT NULL,
  line_oa_member_link_membership_id uuid,
  line_oa_member_link_status text NOT NULL DEFAULT 'active',
  line_oa_member_link_linked_at timestamptz NOT NULL DEFAULT now(),
  line_oa_member_link_linked_by_account_id uuid,
  line_oa_member_link_unlinked_at timestamptz,
  line_oa_member_link_unlinked_by_account_id uuid,
  line_oa_member_link_unlink_reason text,
  line_oa_member_link_created_at timestamptz NOT NULL DEFAULT now(),
  line_oa_member_link_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_line_oa_member_links__contact FOREIGN KEY (line_oa_member_link_contact_id)
    REFERENCES public.line_oa_contacts(line_oa_contact_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_line_oa_member_links__person FOREIGN KEY (line_oa_member_link_person_id)
    REFERENCES public.people(person_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_line_oa_member_links__membership FOREIGN KEY (line_oa_member_link_membership_id)
    REFERENCES public.memberships(membership_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_line_oa_member_links__linked_by FOREIGN KEY (line_oa_member_link_linked_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_line_oa_member_links__unlinked_by FOREIGN KEY (line_oa_member_link_unlinked_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_line_oa_member_links__status CHECK (
    line_oa_member_link_status IN ('active', 'unlinked', 'suspected')
  ),
  CONSTRAINT ck_line_oa_member_links__unlinked_state CHECK (
    (line_oa_member_link_status = 'unlinked'
      AND line_oa_member_link_unlinked_at IS NOT NULL
      AND line_oa_member_link_unlinked_by_account_id IS NOT NULL
      AND line_oa_member_link_unlink_reason IS NOT NULL)
    OR
    (line_oa_member_link_status <> 'unlinked'
      AND line_oa_member_link_unlinked_at IS NULL
      AND line_oa_member_link_unlinked_by_account_id IS NULL
      AND line_oa_member_link_unlink_reason IS NULL)
  )
);

COMMENT ON TABLE public.line_oa_member_links IS 'Links a LINE OA contact to a Person and optionally to a specific Membership without affecting LINE Login.';
COMMENT ON COLUMN public.line_oa_member_links.line_oa_member_link_id IS 'Permanent unique identifier of the LINE OA member link.';
COMMENT ON COLUMN public.line_oa_member_links.line_oa_member_link_contact_id IS 'LINE OA contact being linked.';
COMMENT ON COLUMN public.line_oa_member_links.line_oa_member_link_person_id IS 'Person represented by the LINE OA contact.';
COMMENT ON COLUMN public.line_oa_member_links.line_oa_member_link_membership_id IS 'Optional Membership used for club-specific messaging.';
COMMENT ON COLUMN public.line_oa_member_links.line_oa_member_link_status IS 'Link status: active, unlinked, or suspected.';
COMMENT ON COLUMN public.line_oa_member_links.line_oa_member_link_linked_at IS 'Timestamp when the link was established.';
COMMENT ON COLUMN public.line_oa_member_links.line_oa_member_link_linked_by_account_id IS 'Account that established or confirmed the link.';
COMMENT ON COLUMN public.line_oa_member_links.line_oa_member_link_unlinked_at IS 'Timestamp when the link was removed.';
COMMENT ON COLUMN public.line_oa_member_links.line_oa_member_link_unlinked_by_account_id IS 'Account that removed the link.';
COMMENT ON COLUMN public.line_oa_member_links.line_oa_member_link_unlink_reason IS 'Reason the link was removed.';
COMMENT ON COLUMN public.line_oa_member_links.line_oa_member_link_created_at IS 'Timestamp when the link row was created.';
COMMENT ON COLUMN public.line_oa_member_links.line_oa_member_link_updated_at IS 'Timestamp when the mutable link state was last modified.';

CREATE UNIQUE INDEX uq_line_oa_member_links__contact_active
  ON public.line_oa_member_links (line_oa_member_link_contact_id)
  WHERE line_oa_member_link_status = 'active';
CREATE INDEX ix_line_oa_member_links__person ON public.line_oa_member_links (line_oa_member_link_person_id);
CREATE INDEX ix_line_oa_member_links__membership ON public.line_oa_member_links (line_oa_member_link_membership_id);
CREATE OR REPLACE FUNCTION public.set_loml_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.line_oa_member_link_updated_at := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_line_oa_member_links__updated_at
BEFORE UPDATE ON public.line_oa_member_links
FOR EACH ROW EXECUTE FUNCTION public.set_loml_updated_at();

-- ============================================================================
-- 9. AUDIT DOMAIN
-- ============================================================================

CREATE TABLE public.audit_logs (
  audit_log_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_audit PRIMARY KEY,
  audit_log_actor_account_id uuid,
  audit_log_actor_membership_id uuid,
  audit_log_actor_role_code text,
  audit_log_action_code text NOT NULL,
  audit_log_target_type text NOT NULL,
  audit_log_target_id uuid,
  audit_log_district_id uuid,
  audit_log_club_id uuid,
  audit_log_result text NOT NULL,
  audit_log_failure_reason text,
  audit_log_request_id uuid,
  audit_log_trace_id uuid,
  audit_log_ip_address inet,
  audit_log_user_agent text,
  audit_log_data_classification text NOT NULL DEFAULT 'internal',
  audit_log_retention_policy_version smallint NOT NULL DEFAULT 1,
  audit_log_occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_audit_logs__actor_account FOREIGN KEY (audit_log_actor_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_audit_logs__actor_membership FOREIGN KEY (audit_log_actor_membership_id)
    REFERENCES public.memberships(membership_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_audit_logs__district FOREIGN KEY (audit_log_district_id)
    REFERENCES public.districts(district_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_audit_logs__club FOREIGN KEY (audit_log_club_id)
    REFERENCES public.clubs(club_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_audit_logs__result CHECK (
    audit_log_result IN ('success', 'failure', 'denied')
  ),
  CONSTRAINT ck_audit_logs__failure CHECK (
    audit_log_result = 'success' OR audit_log_failure_reason IS NOT NULL
  ),
  CONSTRAINT ck_audit_logs__classification CHECK (
    audit_log_data_classification IN ('internal', 'confidential', 'restricted')
  ),
  CONSTRAINT ck_audit_logs__retention_version CHECK (audit_log_retention_policy_version > 0)
);

COMMENT ON TABLE public.audit_logs IS 'Append-only immutable audit-event skeleton. Personal-data payloads are stored separately in audit_log_payloads.';
COMMENT ON COLUMN public.audit_logs.audit_log_id IS 'Permanent unique identifier of the audit event.';
COMMENT ON COLUMN public.audit_logs.audit_log_actor_account_id IS 'Account that performed the operation; null is allowed for controlled system actors.';
COMMENT ON COLUMN public.audit_logs.audit_log_actor_membership_id IS 'Membership scope used by the actor at operation time, when applicable.';
COMMENT ON COLUMN public.audit_logs.audit_log_actor_role_code IS 'Role code under which the actor was authorized at operation time, preserving the original authorization basis after role revocation.';
COMMENT ON COLUMN public.audit_logs.audit_log_action_code IS 'Stable action code such as member.update or identity.unbind.';
COMMENT ON COLUMN public.audit_logs.audit_log_target_type IS 'Logical type of the affected resource.';
COMMENT ON COLUMN public.audit_logs.audit_log_target_id IS 'UUID of the affected resource when the target has a UUID identifier.';
COMMENT ON COLUMN public.audit_logs.audit_log_district_id IS 'District authorization scope of the operation, when applicable.';
COMMENT ON COLUMN public.audit_logs.audit_log_club_id IS 'Club authorization scope of the operation, when applicable.';
COMMENT ON COLUMN public.audit_logs.audit_log_result IS 'Operation result: success, failure, or denied.';
COMMENT ON COLUMN public.audit_logs.audit_log_failure_reason IS 'Reason for failure or denial.';
COMMENT ON COLUMN public.audit_logs.audit_log_request_id IS 'Request identifier correlating API, function, login, and idempotency activity.';
COMMENT ON COLUMN public.audit_logs.audit_log_trace_id IS 'Cross-service trace identifier.';
COMMENT ON COLUMN public.audit_logs.audit_log_ip_address IS 'Source IP address of the operation.';
COMMENT ON COLUMN public.audit_logs.audit_log_user_agent IS 'Observed user-agent information.';
COMMENT ON COLUMN public.audit_logs.audit_log_data_classification IS 'Sensitivity class of the event: internal, confidential, or restricted.';
COMMENT ON COLUMN public.audit_logs.audit_log_retention_policy_version IS 'Version of the audit retention policy in force when the event was created.';
COMMENT ON COLUMN public.audit_logs.audit_log_occurred_at IS 'Timestamp when the audited operation occurred.';

CREATE INDEX ix_audit_logs__actor_time ON public.audit_logs (audit_log_actor_account_id, audit_log_occurred_at DESC);
CREATE INDEX ix_audit_logs__membership_time ON public.audit_logs (audit_log_actor_membership_id, audit_log_occurred_at DESC);
CREATE INDEX ix_audit_logs__target ON public.audit_logs (audit_log_target_type, audit_log_target_id, audit_log_occurred_at DESC);
CREATE INDEX ix_audit_logs__club_time ON public.audit_logs (audit_log_club_id, audit_log_occurred_at DESC);
CREATE INDEX ix_audit__district_time ON public.audit_logs (audit_log_district_id, audit_log_occurred_at DESC);
CREATE INDEX ix_audit_logs__request ON public.audit_logs (audit_log_request_id);
CREATE INDEX ix_audit_logs__trace ON public.audit_logs (audit_log_trace_id);

CREATE TABLE public.audit_log_payloads (
  audit_log_payload_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_alp PRIMARY KEY,
  audit_log_payload_audit_log_id uuid NOT NULL,
  audit_log_payload_before_data jsonb,
  audit_log_payload_after_data jsonb,
  audit_log_payload_created_at timestamptz NOT NULL DEFAULT now(),
  audit_log_payload_redacted_at timestamptz,
  audit_log_payload_redacted_by_account_id uuid,
  audit_log_payload_redaction_reason_code text,
  audit_log_payload_redaction_reason_detail text,
  audit_log_payload_redaction_policy_version smallint,
  audit_log_payload_redaction_scope jsonb,
  CONSTRAINT fk_audit_log_payloads__audit FOREIGN KEY (audit_log_payload_audit_log_id)
    REFERENCES public.audit_logs(audit_log_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_audit_log_payloads__redacted_by FOREIGN KEY (audit_log_payload_redacted_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uq_audit_log_payloads__audit UNIQUE (audit_log_payload_audit_log_id),
  CONSTRAINT ck_audit_log_payloads__redaction CHECK (
    (audit_log_payload_redacted_at IS NULL
      AND audit_log_payload_redacted_by_account_id IS NULL
      AND audit_log_payload_redaction_reason_code IS NULL
      AND audit_log_payload_redaction_reason_detail IS NULL
      AND audit_log_payload_redaction_policy_version IS NULL
      AND audit_log_payload_redaction_scope IS NULL)
    OR
    (audit_log_payload_redacted_at IS NOT NULL
      AND audit_log_payload_redacted_by_account_id IS NOT NULL
      AND audit_log_payload_redaction_reason_code IS NOT NULL
      AND audit_log_payload_redaction_policy_version IS NOT NULL
      AND audit_log_payload_redaction_scope IS NOT NULL)
  ),
  CONSTRAINT ck_audit_log_payloads__policy_version CHECK (
    audit_log_payload_redaction_policy_version IS NULL OR audit_log_payload_redaction_policy_version > 0
  )
);

COMMENT ON TABLE public.audit_log_payloads IS 'Stores whitelisted before/after audit payloads that may be redacted by a dedicated controlled function while audit_logs remains immutable.';
COMMENT ON COLUMN public.audit_log_payloads.audit_log_payload_id IS 'Permanent unique identifier of the audit payload.';
COMMENT ON COLUMN public.audit_log_payloads.audit_log_payload_audit_log_id IS 'One-to-one link to the immutable audit event skeleton.';
COMMENT ON COLUMN public.audit_log_payloads.audit_log_payload_before_data IS 'Whitelisted pre-operation data. Secrets, passwords, tokens, full device fingerprints, and unnecessary personal data are prohibited.';
COMMENT ON COLUMN public.audit_log_payloads.audit_log_payload_after_data IS 'Whitelisted post-operation data under the same data-minimization rules.';
COMMENT ON COLUMN public.audit_log_payloads.audit_log_payload_created_at IS 'Timestamp when the payload was created.';
COMMENT ON COLUMN public.audit_log_payloads.audit_log_payload_redacted_at IS 'Timestamp when sensitive payload fields were redacted.';
COMMENT ON COLUMN public.audit_log_payloads.audit_log_payload_redacted_by_account_id IS 'Account that performed the controlled redaction.';
COMMENT ON COLUMN public.audit_log_payloads.audit_log_payload_redaction_reason_code IS 'Structured reason for redaction.';
COMMENT ON COLUMN public.audit_log_payloads.audit_log_payload_redaction_reason_detail IS 'Additional redaction explanation.';
COMMENT ON COLUMN public.audit_log_payloads.audit_log_payload_redaction_policy_version IS 'Version of the redaction policy applied.';
COMMENT ON COLUMN public.audit_log_payloads.audit_log_payload_redaction_scope IS 'JSON description of fields or classifications that were redacted.';

CREATE INDEX ix_audit_log_payloads__redacted_at ON public.audit_log_payloads (audit_log_payload_redacted_at);

-- ============================================================================
-- 10. IDEMPOTENCY AND AUTH RECONCILIATION
-- ============================================================================

CREATE TABLE public.idempotency_records (
  idempotency_record_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_idem PRIMARY KEY,
  idempotency_key text NOT NULL,
  idempotency_operation_type text NOT NULL,
  idempotency_actor_account_id uuid,
  idempotency_actor_auth_user_id uuid,
  idempotency_request_hash bytea NOT NULL,
  idempotency_status text NOT NULL DEFAULT 'pending',
  idempotency_result_type text,
  idempotency_result_reference uuid,
  idempotency_created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_completed_at timestamptz,
  idempotency_expires_at timestamptz NOT NULL,
  CONSTRAINT fk_idempotency_records__actor FOREIGN KEY (idempotency_actor_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_idempotency_records__actor CHECK (
    idempotency_actor_account_id IS NOT NULL OR idempotency_actor_auth_user_id IS NOT NULL
  ),
  CONSTRAINT ck_idempotency_records__status CHECK (
    idempotency_status IN ('pending', 'completed', 'failed')
  ),
  CONSTRAINT ck_idempotency_records__completion CHECK (
    (idempotency_status = 'pending' AND idempotency_completed_at IS NULL)
    OR
    (idempotency_status IN ('completed', 'failed') AND idempotency_completed_at IS NOT NULL)
  ),
  CONSTRAINT ck_idempotency_records__expiry CHECK (
    idempotency_expires_at > idempotency_created_at
  )
);

COMMENT ON TABLE public.idempotency_records IS 'Stores idempotency state for critical multi-table operations and prevents duplicate execution under retries or concurrency.';
COMMENT ON COLUMN public.idempotency_records.idempotency_record_id IS 'Permanent unique identifier of the idempotency record.';
COMMENT ON COLUMN public.idempotency_records.idempotency_key IS 'Caller-generated idempotency key scoped by operation and actor.';
COMMENT ON COLUMN public.idempotency_records.idempotency_operation_type IS 'Operation type such as invitation_accept, membership_status_change, account_merge, or session_revoke.';
COMMENT ON COLUMN public.idempotency_records.idempotency_actor_account_id IS 'Platform Account performing the operation when an Account already exists.';
COMMENT ON COLUMN public.idempotency_records.idempotency_actor_auth_user_id IS 'External Auth user UUID used before an Account exists, such as during first invitation acceptance; weak reference with no FK.';
COMMENT ON COLUMN public.idempotency_records.idempotency_request_hash IS 'Hash of a canonicalized non-secret request. Raw invitation tokens and other secrets must be removed or replaced before hashing; invitation acceptance should use invitation_id plus trusted actor identity, never the plaintext token.';
COMMENT ON COLUMN public.idempotency_records.idempotency_status IS 'Processing status: pending, completed, or failed.';
COMMENT ON COLUMN public.idempotency_records.idempotency_result_type IS 'Logical result resource type returned by the original operation.';
COMMENT ON COLUMN public.idempotency_records.idempotency_result_reference IS 'UUID reference to the original operation result, when available.';
COMMENT ON COLUMN public.idempotency_records.idempotency_created_at IS 'Timestamp when the idempotency record was created.';
COMMENT ON COLUMN public.idempotency_records.idempotency_completed_at IS 'Timestamp when processing completed or failed.';
COMMENT ON COLUMN public.idempotency_records.idempotency_expires_at IS 'Timestamp after which the idempotency record may be cleaned up according to retention policy.';

CREATE UNIQUE INDEX uq_idempotency_records__account_key
  ON public.idempotency_records (
    idempotency_operation_type,
    idempotency_actor_account_id,
    idempotency_key
  )
  WHERE idempotency_actor_account_id IS NOT NULL;
CREATE UNIQUE INDEX uq_idempotency_records__auth_key
  ON public.idempotency_records (
    idempotency_operation_type,
    idempotency_actor_auth_user_id,
    idempotency_key
  )
  WHERE idempotency_actor_auth_user_id IS NOT NULL;
CREATE INDEX ix_idempotency_records__expiry ON public.idempotency_records (idempotency_expires_at);
CREATE INDEX ix_idem__actor_expiry ON public.idempotency_records (idempotency_actor_account_id, idempotency_expires_at);

CREATE TABLE public.auth_reconciliation_issues (
  auth_reconciliation_issue_id uuid DEFAULT gen_random_uuid() CONSTRAINT pk_ari PRIMARY KEY,
  auth_reconciliation_issue_account_id uuid NOT NULL,
  auth_reconciliation_issue_auth_user_id uuid,
  auth_reconciliation_issue_type text NOT NULL,
  auth_reconciliation_issue_status text NOT NULL DEFAULT 'open',
  auth_reconciliation_issue_detected_at timestamptz NOT NULL DEFAULT now(),
  auth_reconciliation_issue_resolved_at timestamptz,
  auth_reconciliation_issue_resolved_by_account_id uuid,
  auth_reconciliation_issue_resolution_detail text,
  auth_reconciliation_issue_created_at timestamptz NOT NULL DEFAULT now(),
  auth_reconciliation_issue_updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_auth_reconciliation_issues__account FOREIGN KEY (auth_reconciliation_issue_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_auth_reconciliation_issues__resolved_by FOREIGN KEY (auth_reconciliation_issue_resolved_by_account_id)
    REFERENCES public.accounts(account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_auth_reconciliation_issues__type CHECK (
    auth_reconciliation_issue_type IN (
      'missing_auth_user', 'live_account_without_auth_user', 'terminal_account_with_auth_user',
      'auth_user_relinked', 'auth_user_state_mismatch'
    )
  ),
  CONSTRAINT ck_auth_reconciliation_issues__status CHECK (
    auth_reconciliation_issue_status IN ('open', 'resolved', 'ignored')
  ),
  CONSTRAINT ck_auth_reconciliation_issues__resolution CHECK (
    (auth_reconciliation_issue_status = 'open'
      AND auth_reconciliation_issue_resolved_at IS NULL
      AND auth_reconciliation_issue_resolved_by_account_id IS NULL)
    OR
    (auth_reconciliation_issue_status IN ('resolved', 'ignored')
      AND auth_reconciliation_issue_resolved_at IS NOT NULL
      AND auth_reconciliation_issue_resolved_by_account_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.auth_reconciliation_issues IS 'Stores discrepancies found by the controlled backend reconciliation job between Accounts and external Supabase Auth users.';
COMMENT ON COLUMN public.auth_reconciliation_issues.auth_reconciliation_issue_id IS 'Permanent unique identifier of the reconciliation issue.';
COMMENT ON COLUMN public.auth_reconciliation_issues.auth_reconciliation_issue_account_id IS 'Account whose external Auth relationship is inconsistent.';
COMMENT ON COLUMN public.auth_reconciliation_issues.auth_reconciliation_issue_auth_user_id IS 'External Auth user UUID observed during reconciliation; weak reference with no FK.';
COMMENT ON COLUMN public.auth_reconciliation_issues.auth_reconciliation_issue_type IS 'Structured discrepancy type.';
COMMENT ON COLUMN public.auth_reconciliation_issues.auth_reconciliation_issue_status IS 'Workflow status: open, resolved, or ignored.';
COMMENT ON COLUMN public.auth_reconciliation_issues.auth_reconciliation_issue_detected_at IS 'Timestamp when the discrepancy was detected.';
COMMENT ON COLUMN public.auth_reconciliation_issues.auth_reconciliation_issue_resolved_at IS 'Timestamp when the discrepancy was resolved or intentionally ignored.';
COMMENT ON COLUMN public.auth_reconciliation_issues.auth_reconciliation_issue_resolved_by_account_id IS 'Authorized Account that resolved or ignored the discrepancy.';
COMMENT ON COLUMN public.auth_reconciliation_issues.auth_reconciliation_issue_resolution_detail IS 'Explanation of the resolution.';
COMMENT ON COLUMN public.auth_reconciliation_issues.auth_reconciliation_issue_created_at IS 'Timestamp when the issue row was created.';
COMMENT ON COLUMN public.auth_reconciliation_issues.auth_reconciliation_issue_updated_at IS 'Timestamp when the issue row was last modified.';

CREATE INDEX ix_auth_reconciliation_issues__account
  ON public.auth_reconciliation_issues (auth_reconciliation_issue_account_id);
CREATE INDEX ix_auth_reconciliation_issues__status
  ON public.auth_reconciliation_issues (auth_reconciliation_issue_status, auth_reconciliation_issue_detected_at);
CREATE OR REPLACE FUNCTION public.guard_ari_human_account()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts
    WHERE account_id = NEW.auth_reconciliation_issue_account_id
      AND account_kind = 'human'
  ) THEN
    RAISE EXCEPTION 'Auth reconciliation excludes system Accounts'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_ari__human_account
BEFORE INSERT OR UPDATE OF auth_reconciliation_issue_account_id
ON public.auth_reconciliation_issues
FOR EACH ROW EXECUTE FUNCTION public.guard_ari_human_account();
CREATE OR REPLACE FUNCTION public.set_ari_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.auth_reconciliation_issue_updated_at := clock_timestamp(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_auth_reconciliation_issues__updated_at
BEFORE UPDATE ON public.auth_reconciliation_issues
FOR EACH ROW EXECUTE FUNCTION public.set_ari_updated_at();

-- ============================================================================
-- Final notes
-- ============================================================================
-- 1. RLS is intentionally not enabled in this Database Foundation change.
-- 2. Cross-table state changes belong in separately reviewed future work, including:
--      accept_membership_invitation
--      resend_membership_invitation
--      change_membership_status
--      change_membership_onboarding_status
--      merge_accounts
--      bind_identity
--      unbind_identity
--      revoke_account_session
--      redact_audit_payload
--      check_person_match
-- 3. HMAC token creation/verification occurs in a trusted backend or Edge
--    Function. The database receives only token version and digest.
-- 4. Scheduled cleanup/reconciliation mechanisms (for example pg_cron or an
--    external scheduler) must be selected and tested separately.

COMMIT;
