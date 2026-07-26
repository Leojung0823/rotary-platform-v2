export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      account_devices: {
        Row: {
          account_device_account_id: string
          account_device_created_at: string
          account_device_device_id: string
          account_device_first_seen_at: string
          account_device_id: string
          account_device_last_seen_at: string
          account_device_name: string | null
          account_device_revoke_reason_code: string | null
          account_device_revoked_at: string | null
          account_device_revoked_by_account_id: string | null
          account_device_status: string
          account_device_trusted_at: string | null
          account_device_updated_at: string
        }
        Insert: {
          account_device_account_id: string
          account_device_created_at?: string
          account_device_device_id: string
          account_device_first_seen_at?: string
          account_device_id?: string
          account_device_last_seen_at?: string
          account_device_name?: string | null
          account_device_revoke_reason_code?: string | null
          account_device_revoked_at?: string | null
          account_device_revoked_by_account_id?: string | null
          account_device_status?: string
          account_device_trusted_at?: string | null
          account_device_updated_at?: string
        }
        Update: {
          account_device_account_id?: string
          account_device_created_at?: string
          account_device_device_id?: string
          account_device_first_seen_at?: string
          account_device_id?: string
          account_device_last_seen_at?: string
          account_device_name?: string | null
          account_device_revoke_reason_code?: string | null
          account_device_revoked_at?: string | null
          account_device_revoked_by_account_id?: string | null
          account_device_status?: string
          account_device_trusted_at?: string | null
          account_device_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_account_devices__accounts"
            columns: ["account_device_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_account_devices__devices"
            columns: ["account_device_device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "fk_account_devices__revoked_by"
            columns: ["account_device_revoked_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      account_merge_events: {
        Row: {
          account_merge_event_conflict_summary: Json | null
          account_merge_event_id: string
          account_merge_event_merged_by_account_id: string
          account_merge_event_occurred_at: string
          account_merge_event_reason_code: string
          account_merge_event_reason_detail: string | null
          account_merge_event_source_account_id: string
          account_merge_event_target_account_id: string
          account_merge_event_transfer_summary: Json | null
        }
        Insert: {
          account_merge_event_conflict_summary?: Json | null
          account_merge_event_id?: string
          account_merge_event_merged_by_account_id: string
          account_merge_event_occurred_at?: string
          account_merge_event_reason_code: string
          account_merge_event_reason_detail?: string | null
          account_merge_event_source_account_id: string
          account_merge_event_target_account_id: string
          account_merge_event_transfer_summary?: Json | null
        }
        Update: {
          account_merge_event_conflict_summary?: Json | null
          account_merge_event_id?: string
          account_merge_event_merged_by_account_id?: string
          account_merge_event_occurred_at?: string
          account_merge_event_reason_code?: string
          account_merge_event_reason_detail?: string | null
          account_merge_event_source_account_id?: string
          account_merge_event_target_account_id?: string
          account_merge_event_transfer_summary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_account_merge_events__actor"
            columns: ["account_merge_event_merged_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_account_merge_events__source"
            columns: ["account_merge_event_source_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_account_merge_events__target"
            columns: ["account_merge_event_target_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      account_sessions: {
        Row: {
          account_session_account_device_id: string | null
          account_session_account_id: string
          account_session_auth_session_id: string
          account_session_created_at: string
          account_session_expires_at: string | null
          account_session_id: string
          account_session_last_seen_at: string
          account_session_revoke_reason: string | null
          account_session_revoked_at: string | null
          account_session_revoked_by_account_id: string | null
          account_session_started_at: string
          account_session_status: string
          account_session_updated_at: string
        }
        Insert: {
          account_session_account_device_id?: string | null
          account_session_account_id: string
          account_session_auth_session_id: string
          account_session_created_at?: string
          account_session_expires_at?: string | null
          account_session_id?: string
          account_session_last_seen_at?: string
          account_session_revoke_reason?: string | null
          account_session_revoked_at?: string | null
          account_session_revoked_by_account_id?: string | null
          account_session_started_at?: string
          account_session_status?: string
          account_session_updated_at?: string
        }
        Update: {
          account_session_account_device_id?: string | null
          account_session_account_id?: string
          account_session_auth_session_id?: string
          account_session_created_at?: string
          account_session_expires_at?: string | null
          account_session_id?: string
          account_session_last_seen_at?: string
          account_session_revoke_reason?: string | null
          account_session_revoked_at?: string | null
          account_session_revoked_by_account_id?: string | null
          account_session_started_at?: string
          account_session_status?: string
          account_session_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_account_sessions__account_device"
            columns: ["account_session_account_device_id"]
            isOneToOne: false
            referencedRelation: "account_devices"
            referencedColumns: ["account_device_id"]
          },
          {
            foreignKeyName: "fk_account_sessions__accounts"
            columns: ["account_session_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_account_sessions__revoked_by"
            columns: ["account_session_revoked_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_activated_at: string | null
          account_anonymized_at: string | null
          account_auth_user_id: string | null
          account_close_reason: string | null
          account_closed_at: string | null
          account_closed_by_account_id: string | null
          account_created_at: string
          account_creation_source: string
          account_id: string
          account_kind: string
          account_last_login_at: string | null
          account_lock_reason: string | null
          account_locked_at: string | null
          account_merged_at: string | null
          account_merged_into_account_id: string | null
          account_person_id: string | null
          account_status: string
          account_suspended_at: string | null
          account_suspension_reason: string | null
          account_updated_at: string
          account_updated_by_account_id: string | null
        }
        Insert: {
          account_activated_at?: string | null
          account_anonymized_at?: string | null
          account_auth_user_id?: string | null
          account_close_reason?: string | null
          account_closed_at?: string | null
          account_closed_by_account_id?: string | null
          account_created_at?: string
          account_creation_source: string
          account_id?: string
          account_kind?: string
          account_last_login_at?: string | null
          account_lock_reason?: string | null
          account_locked_at?: string | null
          account_merged_at?: string | null
          account_merged_into_account_id?: string | null
          account_person_id?: string | null
          account_status?: string
          account_suspended_at?: string | null
          account_suspension_reason?: string | null
          account_updated_at?: string
          account_updated_by_account_id?: string | null
        }
        Update: {
          account_activated_at?: string | null
          account_anonymized_at?: string | null
          account_auth_user_id?: string | null
          account_close_reason?: string | null
          account_closed_at?: string | null
          account_closed_by_account_id?: string | null
          account_created_at?: string
          account_creation_source?: string
          account_id?: string
          account_kind?: string
          account_last_login_at?: string | null
          account_lock_reason?: string | null
          account_locked_at?: string | null
          account_merged_at?: string | null
          account_merged_into_account_id?: string | null
          account_person_id?: string | null
          account_status?: string
          account_suspended_at?: string | null
          account_suspension_reason?: string | null
          account_updated_at?: string
          account_updated_by_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_accounts__closed_by"
            columns: ["account_closed_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_accounts__merged_account"
            columns: ["account_merged_into_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_accounts__people"
            columns: ["account_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "fk_accounts__updated_by"
            columns: ["account_updated_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      audit_log_payloads: {
        Row: {
          audit_log_payload_after_data: Json | null
          audit_log_payload_audit_log_id: string
          audit_log_payload_before_data: Json | null
          audit_log_payload_created_at: string
          audit_log_payload_id: string
          audit_log_payload_redacted_at: string | null
          audit_log_payload_redacted_by_account_id: string | null
          audit_log_payload_redaction_policy_version: number | null
          audit_log_payload_redaction_reason_code: string | null
          audit_log_payload_redaction_reason_detail: string | null
          audit_log_payload_redaction_scope: Json | null
        }
        Insert: {
          audit_log_payload_after_data?: Json | null
          audit_log_payload_audit_log_id: string
          audit_log_payload_before_data?: Json | null
          audit_log_payload_created_at?: string
          audit_log_payload_id?: string
          audit_log_payload_redacted_at?: string | null
          audit_log_payload_redacted_by_account_id?: string | null
          audit_log_payload_redaction_policy_version?: number | null
          audit_log_payload_redaction_reason_code?: string | null
          audit_log_payload_redaction_reason_detail?: string | null
          audit_log_payload_redaction_scope?: Json | null
        }
        Update: {
          audit_log_payload_after_data?: Json | null
          audit_log_payload_audit_log_id?: string
          audit_log_payload_before_data?: Json | null
          audit_log_payload_created_at?: string
          audit_log_payload_id?: string
          audit_log_payload_redacted_at?: string | null
          audit_log_payload_redacted_by_account_id?: string | null
          audit_log_payload_redaction_policy_version?: number | null
          audit_log_payload_redaction_reason_code?: string | null
          audit_log_payload_redaction_reason_detail?: string | null
          audit_log_payload_redaction_scope?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_audit_log_payloads__audit"
            columns: ["audit_log_payload_audit_log_id"]
            isOneToOne: true
            referencedRelation: "audit_logs"
            referencedColumns: ["audit_log_id"]
          },
          {
            foreignKeyName: "fk_audit_log_payloads__redacted_by"
            columns: ["audit_log_payload_redacted_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          audit_log_action_code: string
          audit_log_actor_account_id: string | null
          audit_log_actor_membership_id: string | null
          audit_log_actor_role_code: string | null
          audit_log_club_id: string | null
          audit_log_data_classification: string
          audit_log_district_id: string | null
          audit_log_failure_reason: string | null
          audit_log_id: string
          audit_log_ip_address: unknown
          audit_log_occurred_at: string
          audit_log_request_id: string | null
          audit_log_result: string
          audit_log_retention_policy_version: number
          audit_log_target_id: string | null
          audit_log_target_type: string
          audit_log_trace_id: string | null
          audit_log_user_agent: string | null
        }
        Insert: {
          audit_log_action_code: string
          audit_log_actor_account_id?: string | null
          audit_log_actor_membership_id?: string | null
          audit_log_actor_role_code?: string | null
          audit_log_club_id?: string | null
          audit_log_data_classification?: string
          audit_log_district_id?: string | null
          audit_log_failure_reason?: string | null
          audit_log_id?: string
          audit_log_ip_address?: unknown
          audit_log_occurred_at?: string
          audit_log_request_id?: string | null
          audit_log_result: string
          audit_log_retention_policy_version?: number
          audit_log_target_id?: string | null
          audit_log_target_type: string
          audit_log_trace_id?: string | null
          audit_log_user_agent?: string | null
        }
        Update: {
          audit_log_action_code?: string
          audit_log_actor_account_id?: string | null
          audit_log_actor_membership_id?: string | null
          audit_log_actor_role_code?: string | null
          audit_log_club_id?: string | null
          audit_log_data_classification?: string
          audit_log_district_id?: string | null
          audit_log_failure_reason?: string | null
          audit_log_id?: string
          audit_log_ip_address?: unknown
          audit_log_occurred_at?: string
          audit_log_request_id?: string | null
          audit_log_result?: string
          audit_log_retention_policy_version?: number
          audit_log_target_id?: string | null
          audit_log_target_type?: string
          audit_log_trace_id?: string | null
          audit_log_user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_audit_logs__actor_account"
            columns: ["audit_log_actor_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_audit_logs__actor_membership"
            columns: ["audit_log_actor_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "fk_audit_logs__club"
            columns: ["audit_log_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "fk_audit_logs__district"
            columns: ["audit_log_district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["district_id"]
          },
        ]
      }
      auth_reconciliation_issues: {
        Row: {
          auth_reconciliation_issue_account_id: string
          auth_reconciliation_issue_auth_user_id: string | null
          auth_reconciliation_issue_created_at: string
          auth_reconciliation_issue_detected_at: string
          auth_reconciliation_issue_id: string
          auth_reconciliation_issue_resolution_detail: string | null
          auth_reconciliation_issue_resolved_at: string | null
          auth_reconciliation_issue_resolved_by_account_id: string | null
          auth_reconciliation_issue_status: string
          auth_reconciliation_issue_type: string
          auth_reconciliation_issue_updated_at: string
        }
        Insert: {
          auth_reconciliation_issue_account_id: string
          auth_reconciliation_issue_auth_user_id?: string | null
          auth_reconciliation_issue_created_at?: string
          auth_reconciliation_issue_detected_at?: string
          auth_reconciliation_issue_id?: string
          auth_reconciliation_issue_resolution_detail?: string | null
          auth_reconciliation_issue_resolved_at?: string | null
          auth_reconciliation_issue_resolved_by_account_id?: string | null
          auth_reconciliation_issue_status?: string
          auth_reconciliation_issue_type: string
          auth_reconciliation_issue_updated_at?: string
        }
        Update: {
          auth_reconciliation_issue_account_id?: string
          auth_reconciliation_issue_auth_user_id?: string | null
          auth_reconciliation_issue_created_at?: string
          auth_reconciliation_issue_detected_at?: string
          auth_reconciliation_issue_id?: string
          auth_reconciliation_issue_resolution_detail?: string | null
          auth_reconciliation_issue_resolved_at?: string | null
          auth_reconciliation_issue_resolved_by_account_id?: string | null
          auth_reconciliation_issue_status?: string
          auth_reconciliation_issue_type?: string
          auth_reconciliation_issue_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_auth_reconciliation_issues__account"
            columns: ["auth_reconciliation_issue_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_auth_reconciliation_issues__resolved_by"
            columns: ["auth_reconciliation_issue_resolved_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      club_terms: {
        Row: {
          club_term_club_id: string
          club_term_created_at: string
          club_term_end_year: number
          club_term_ends_on: string
          club_term_id: string
          club_term_start_year: number
          club_term_starts_on: string
          club_term_status: string
          club_term_updated_at: string
        }
        Insert: {
          club_term_club_id: string
          club_term_created_at?: string
          club_term_end_year: number
          club_term_ends_on: string
          club_term_id?: string
          club_term_start_year: number
          club_term_starts_on: string
          club_term_status?: string
          club_term_updated_at?: string
        }
        Update: {
          club_term_club_id?: string
          club_term_created_at?: string
          club_term_end_year?: number
          club_term_ends_on?: string
          club_term_id?: string
          club_term_start_year?: number
          club_term_starts_on?: string
          club_term_status?: string
          club_term_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_club_terms__clubs"
            columns: ["club_term_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["club_id"]
          },
        ]
      }
      clubs: {
        Row: {
          club_charter_date: string | null
          club_created_at: string
          club_created_by_account_id: string | null
          club_district_id: string
          club_english_name: string | null
          club_id: string
          club_locale: string
          club_name: string
          club_rotary_number: string
          club_short_name: string | null
          club_status: string
          club_timezone: string
          club_updated_at: string
          club_updated_by_account_id: string | null
        }
        Insert: {
          club_charter_date?: string | null
          club_created_at?: string
          club_created_by_account_id?: string | null
          club_district_id: string
          club_english_name?: string | null
          club_id?: string
          club_locale?: string
          club_name: string
          club_rotary_number: string
          club_short_name?: string | null
          club_status?: string
          club_timezone?: string
          club_updated_at?: string
          club_updated_by_account_id?: string | null
        }
        Update: {
          club_charter_date?: string | null
          club_created_at?: string
          club_created_by_account_id?: string | null
          club_district_id?: string
          club_english_name?: string | null
          club_id?: string
          club_locale?: string
          club_name?: string
          club_rotary_number?: string
          club_short_name?: string | null
          club_status?: string
          club_timezone?: string
          club_updated_at?: string
          club_updated_by_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_clubs__created_by"
            columns: ["club_created_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_clubs__districts"
            columns: ["club_district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["district_id"]
          },
          {
            foreignKeyName: "fk_clubs__updated_by"
            columns: ["club_updated_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      devices: {
        Row: {
          device_browser_family: string | null
          device_created_at: string
          device_fingerprint_hash: string
          device_fingerprint_hash_version: number
          device_fingerprint_scope: string
          device_first_seen_at: string
          device_id: string
          device_last_seen_at: string
          device_platform: string | null
          device_status: string
          device_updated_at: string
          device_user_agent_hash: string | null
        }
        Insert: {
          device_browser_family?: string | null
          device_created_at?: string
          device_fingerprint_hash: string
          device_fingerprint_hash_version?: number
          device_fingerprint_scope?: string
          device_first_seen_at?: string
          device_id?: string
          device_last_seen_at?: string
          device_platform?: string | null
          device_status?: string
          device_updated_at?: string
          device_user_agent_hash?: string | null
        }
        Update: {
          device_browser_family?: string | null
          device_created_at?: string
          device_fingerprint_hash?: string
          device_fingerprint_hash_version?: number
          device_fingerprint_scope?: string
          device_first_seen_at?: string
          device_id?: string
          device_last_seen_at?: string
          device_platform?: string | null
          device_status?: string
          device_updated_at?: string
          device_user_agent_hash?: string | null
        }
        Relationships: []
      }
      district_role_assignments: {
        Row: {
          district_role_assignment_account_id: string
          district_role_assignment_assigned_at: string
          district_role_assignment_assigned_by_account_id: string
          district_role_assignment_district_id: string
          district_role_assignment_ends_at: string | null
          district_role_assignment_id: string
          district_role_assignment_reason_code: string
          district_role_assignment_reason_detail: string | null
          district_role_assignment_revoked_at: string | null
          district_role_assignment_revoked_by_account_id: string | null
          district_role_assignment_role_id: string
          district_role_assignment_starts_at: string
          district_role_assignment_status: string
        }
        Insert: {
          district_role_assignment_account_id: string
          district_role_assignment_assigned_at?: string
          district_role_assignment_assigned_by_account_id: string
          district_role_assignment_district_id: string
          district_role_assignment_ends_at?: string | null
          district_role_assignment_id?: string
          district_role_assignment_reason_code: string
          district_role_assignment_reason_detail?: string | null
          district_role_assignment_revoked_at?: string | null
          district_role_assignment_revoked_by_account_id?: string | null
          district_role_assignment_role_id: string
          district_role_assignment_starts_at: string
          district_role_assignment_status?: string
        }
        Update: {
          district_role_assignment_account_id?: string
          district_role_assignment_assigned_at?: string
          district_role_assignment_assigned_by_account_id?: string
          district_role_assignment_district_id?: string
          district_role_assignment_ends_at?: string | null
          district_role_assignment_id?: string
          district_role_assignment_reason_code?: string
          district_role_assignment_reason_detail?: string | null
          district_role_assignment_revoked_at?: string | null
          district_role_assignment_revoked_by_account_id?: string | null
          district_role_assignment_role_id?: string
          district_role_assignment_starts_at?: string
          district_role_assignment_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_district_role_assignments__account"
            columns: ["district_role_assignment_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_district_role_assignments__assigned_by"
            columns: ["district_role_assignment_assigned_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_district_role_assignments__district"
            columns: ["district_role_assignment_district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["district_id"]
          },
          {
            foreignKeyName: "fk_district_role_assignments__revoked_by"
            columns: ["district_role_assignment_revoked_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_district_role_assignments__role"
            columns: ["district_role_assignment_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      districts: {
        Row: {
          district_code: string
          district_country_code: string
          district_created_at: string
          district_english_name: string | null
          district_id: string
          district_name: string
          district_status: string
          district_timezone: string
          district_updated_at: string
        }
        Insert: {
          district_code: string
          district_country_code: string
          district_created_at?: string
          district_english_name?: string | null
          district_id?: string
          district_name: string
          district_status?: string
          district_timezone?: string
          district_updated_at?: string
        }
        Update: {
          district_code?: string
          district_country_code?: string
          district_created_at?: string
          district_english_name?: string | null
          district_id?: string
          district_name?: string
          district_status?: string
          district_timezone?: string
          district_updated_at?: string
        }
        Relationships: []
      }
      idempotency_records: {
        Row: {
          idempotency_actor_account_id: string | null
          idempotency_actor_auth_user_id: string | null
          idempotency_completed_at: string | null
          idempotency_created_at: string
          idempotency_error_code: string | null
          idempotency_expires_at: string
          idempotency_key: string
          idempotency_operation_type: string
          idempotency_record_id: string
          idempotency_request_hash: string
          idempotency_result_reference: string | null
          idempotency_result_type: string | null
          idempotency_status: string
        }
        Insert: {
          idempotency_actor_account_id?: string | null
          idempotency_actor_auth_user_id?: string | null
          idempotency_completed_at?: string | null
          idempotency_created_at?: string
          idempotency_error_code?: string | null
          idempotency_expires_at: string
          idempotency_key: string
          idempotency_operation_type: string
          idempotency_record_id?: string
          idempotency_request_hash: string
          idempotency_result_reference?: string | null
          idempotency_result_type?: string | null
          idempotency_status?: string
        }
        Update: {
          idempotency_actor_account_id?: string | null
          idempotency_actor_auth_user_id?: string | null
          idempotency_completed_at?: string | null
          idempotency_created_at?: string
          idempotency_error_code?: string | null
          idempotency_expires_at?: string
          idempotency_key?: string
          idempotency_operation_type?: string
          idempotency_record_id?: string
          idempotency_request_hash?: string
          idempotency_result_reference?: string | null
          idempotency_result_type?: string | null
          idempotency_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_idempotency_records__actor"
            columns: ["idempotency_actor_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      identities: {
        Row: {
          identity_account_id: string
          identity_bound_at: string
          identity_bound_by_account_id: string | null
          identity_created_at: string
          identity_id: string
          identity_last_login_at: string | null
          identity_line_channel_config_id: string | null
          identity_provider: string
          identity_provider_avatar_url: string | null
          identity_provider_display_name: string | null
          identity_provider_email: string | null
          identity_provider_subject: string
          identity_provider_tenant: string
          identity_status: string
          identity_unbind_reason_code: string | null
          identity_unbind_reason_detail: string | null
          identity_unbound_at: string | null
          identity_unbound_by_account_id: string | null
          identity_updated_at: string
        }
        Insert: {
          identity_account_id: string
          identity_bound_at?: string
          identity_bound_by_account_id?: string | null
          identity_created_at?: string
          identity_id?: string
          identity_last_login_at?: string | null
          identity_line_channel_config_id?: string | null
          identity_provider: string
          identity_provider_avatar_url?: string | null
          identity_provider_display_name?: string | null
          identity_provider_email?: string | null
          identity_provider_subject: string
          identity_provider_tenant: string
          identity_status?: string
          identity_unbind_reason_code?: string | null
          identity_unbind_reason_detail?: string | null
          identity_unbound_at?: string | null
          identity_unbound_by_account_id?: string | null
          identity_updated_at?: string
        }
        Update: {
          identity_account_id?: string
          identity_bound_at?: string
          identity_bound_by_account_id?: string | null
          identity_created_at?: string
          identity_id?: string
          identity_last_login_at?: string | null
          identity_line_channel_config_id?: string | null
          identity_provider?: string
          identity_provider_avatar_url?: string | null
          identity_provider_display_name?: string | null
          identity_provider_email?: string | null
          identity_provider_subject?: string
          identity_provider_tenant?: string
          identity_status?: string
          identity_unbind_reason_code?: string | null
          identity_unbind_reason_detail?: string | null
          identity_unbound_at?: string | null
          identity_unbound_by_account_id?: string | null
          identity_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_identities__accounts"
            columns: ["identity_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_identities__bound_by"
            columns: ["identity_bound_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_identities__line_channel"
            columns: ["identity_line_channel_config_id"]
            isOneToOne: false
            referencedRelation: "line_channel_configs"
            referencedColumns: ["line_channel_config_id"]
          },
          {
            foreignKeyName: "fk_identities__unbound_by"
            columns: ["identity_unbound_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      invitation_events: {
        Row: {
          invitation_event_actor_account_id: string | null
          invitation_event_actor_auth_user_id: string | null
          invitation_event_id: string
          invitation_event_invitation_id: string
          invitation_event_occurred_at: string
          invitation_event_reason_code: string | null
          invitation_event_reason_detail: string | null
          invitation_event_request_id: string | null
          invitation_event_result: string
          invitation_event_type: string
        }
        Insert: {
          invitation_event_actor_account_id?: string | null
          invitation_event_actor_auth_user_id?: string | null
          invitation_event_id?: string
          invitation_event_invitation_id: string
          invitation_event_occurred_at?: string
          invitation_event_reason_code?: string | null
          invitation_event_reason_detail?: string | null
          invitation_event_request_id?: string | null
          invitation_event_result: string
          invitation_event_type: string
        }
        Update: {
          invitation_event_actor_account_id?: string | null
          invitation_event_actor_auth_user_id?: string | null
          invitation_event_id?: string
          invitation_event_invitation_id?: string
          invitation_event_occurred_at?: string
          invitation_event_reason_code?: string | null
          invitation_event_reason_detail?: string | null
          invitation_event_request_id?: string | null
          invitation_event_result?: string
          invitation_event_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_invitation_events__actor"
            columns: ["invitation_event_actor_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_invitation_events__invitation"
            columns: ["invitation_event_invitation_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["invitation_id"]
          },
        ]
      }
      invitations: {
        Row: {
          invitation_accepted_at: string | null
          invitation_accepted_by_account_id: string | null
          invitation_accepted_by_auth_user_id: string | null
          invitation_consumed_at: string | null
          invitation_created_at: string
          invitation_created_by_account_id: string
          invitation_delivery_channel: string
          invitation_destination_masked: string | null
          invitation_expires_at: string
          invitation_hmac_key_version: number
          invitation_id: string
          invitation_marked_expired_at: string | null
          invitation_membership_id: string
          invitation_revoke_reason: string | null
          invitation_revoked_at: string | null
          invitation_revoked_by_account_id: string | null
          invitation_status: string
          invitation_token_hash: string
          invitation_token_issued_at: string
          invitation_token_nonce: string
          invitation_token_version: number
          invitation_updated_at: string
        }
        Insert: {
          invitation_accepted_at?: string | null
          invitation_accepted_by_account_id?: string | null
          invitation_accepted_by_auth_user_id?: string | null
          invitation_consumed_at?: string | null
          invitation_created_at?: string
          invitation_created_by_account_id: string
          invitation_delivery_channel: string
          invitation_destination_masked?: string | null
          invitation_expires_at: string
          invitation_hmac_key_version: number
          invitation_id?: string
          invitation_marked_expired_at?: string | null
          invitation_membership_id: string
          invitation_revoke_reason?: string | null
          invitation_revoked_at?: string | null
          invitation_revoked_by_account_id?: string | null
          invitation_status?: string
          invitation_token_hash: string
          invitation_token_issued_at: string
          invitation_token_nonce: string
          invitation_token_version: number
          invitation_updated_at?: string
        }
        Update: {
          invitation_accepted_at?: string | null
          invitation_accepted_by_account_id?: string | null
          invitation_accepted_by_auth_user_id?: string | null
          invitation_consumed_at?: string | null
          invitation_created_at?: string
          invitation_created_by_account_id?: string
          invitation_delivery_channel?: string
          invitation_destination_masked?: string | null
          invitation_expires_at?: string
          invitation_hmac_key_version?: number
          invitation_id?: string
          invitation_marked_expired_at?: string | null
          invitation_membership_id?: string
          invitation_revoke_reason?: string | null
          invitation_revoked_at?: string | null
          invitation_revoked_by_account_id?: string | null
          invitation_status?: string
          invitation_token_hash?: string
          invitation_token_issued_at?: string
          invitation_token_nonce?: string
          invitation_token_version?: number
          invitation_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_invitations__accepted_by"
            columns: ["invitation_accepted_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_invitations__created_by"
            columns: ["invitation_created_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_invitations__membership"
            columns: ["invitation_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "fk_invitations__revoked_by"
            columns: ["invitation_revoked_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      line_channel_configs: {
        Row: {
          line_channel_config_id: string
          line_channel_created_at: string
          line_channel_created_by_account_id: string | null
          line_channel_disabled_at: string | null
          line_channel_display_name: string
          line_channel_enabled_at: string | null
          line_channel_environment: string
          line_channel_external_channel_id: string
          line_channel_provider_id: string
          line_channel_secret_reference: string | null
          line_channel_status: string
          line_channel_type: string
          line_channel_updated_at: string
          line_channel_updated_by_account_id: string | null
        }
        Insert: {
          line_channel_config_id?: string
          line_channel_created_at?: string
          line_channel_created_by_account_id?: string | null
          line_channel_disabled_at?: string | null
          line_channel_display_name: string
          line_channel_enabled_at?: string | null
          line_channel_environment: string
          line_channel_external_channel_id: string
          line_channel_provider_id: string
          line_channel_secret_reference?: string | null
          line_channel_status?: string
          line_channel_type: string
          line_channel_updated_at?: string
          line_channel_updated_by_account_id?: string | null
        }
        Update: {
          line_channel_config_id?: string
          line_channel_created_at?: string
          line_channel_created_by_account_id?: string | null
          line_channel_disabled_at?: string | null
          line_channel_display_name?: string
          line_channel_enabled_at?: string | null
          line_channel_environment?: string
          line_channel_external_channel_id?: string
          line_channel_provider_id?: string
          line_channel_secret_reference?: string | null
          line_channel_status?: string
          line_channel_type?: string
          line_channel_updated_at?: string
          line_channel_updated_by_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_line_channel_configs__created_by"
            columns: ["line_channel_created_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_line_channel_configs__updated_by"
            columns: ["line_channel_updated_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      line_oa_contacts: {
        Row: {
          line_oa_contact_channel_config_id: string
          line_oa_contact_created_at: string
          line_oa_contact_display_name: string | null
          line_oa_contact_followed_at: string | null
          line_oa_contact_friendship_status: string
          line_oa_contact_id: string
          line_oa_contact_last_interaction_at: string | null
          line_oa_contact_line_user_id: string
          line_oa_contact_picture_url: string | null
          line_oa_contact_unfollowed_at: string | null
          line_oa_contact_updated_at: string
        }
        Insert: {
          line_oa_contact_channel_config_id: string
          line_oa_contact_created_at?: string
          line_oa_contact_display_name?: string | null
          line_oa_contact_followed_at?: string | null
          line_oa_contact_friendship_status?: string
          line_oa_contact_id?: string
          line_oa_contact_last_interaction_at?: string | null
          line_oa_contact_line_user_id: string
          line_oa_contact_picture_url?: string | null
          line_oa_contact_unfollowed_at?: string | null
          line_oa_contact_updated_at?: string
        }
        Update: {
          line_oa_contact_channel_config_id?: string
          line_oa_contact_created_at?: string
          line_oa_contact_display_name?: string | null
          line_oa_contact_followed_at?: string | null
          line_oa_contact_friendship_status?: string
          line_oa_contact_id?: string
          line_oa_contact_last_interaction_at?: string | null
          line_oa_contact_line_user_id?: string
          line_oa_contact_picture_url?: string | null
          line_oa_contact_unfollowed_at?: string | null
          line_oa_contact_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_line_oa_contacts__channel"
            columns: ["line_oa_contact_channel_config_id"]
            isOneToOne: false
            referencedRelation: "line_channel_configs"
            referencedColumns: ["line_channel_config_id"]
          },
        ]
      }
      line_oa_member_links: {
        Row: {
          line_oa_member_link_contact_id: string
          line_oa_member_link_created_at: string
          line_oa_member_link_id: string
          line_oa_member_link_linked_at: string
          line_oa_member_link_linked_by_account_id: string | null
          line_oa_member_link_membership_id: string | null
          line_oa_member_link_person_id: string
          line_oa_member_link_status: string
          line_oa_member_link_unlink_reason: string | null
          line_oa_member_link_unlinked_at: string | null
          line_oa_member_link_unlinked_by_account_id: string | null
          line_oa_member_link_updated_at: string
        }
        Insert: {
          line_oa_member_link_contact_id: string
          line_oa_member_link_created_at?: string
          line_oa_member_link_id?: string
          line_oa_member_link_linked_at?: string
          line_oa_member_link_linked_by_account_id?: string | null
          line_oa_member_link_membership_id?: string | null
          line_oa_member_link_person_id: string
          line_oa_member_link_status?: string
          line_oa_member_link_unlink_reason?: string | null
          line_oa_member_link_unlinked_at?: string | null
          line_oa_member_link_unlinked_by_account_id?: string | null
          line_oa_member_link_updated_at?: string
        }
        Update: {
          line_oa_member_link_contact_id?: string
          line_oa_member_link_created_at?: string
          line_oa_member_link_id?: string
          line_oa_member_link_linked_at?: string
          line_oa_member_link_linked_by_account_id?: string | null
          line_oa_member_link_membership_id?: string | null
          line_oa_member_link_person_id?: string
          line_oa_member_link_status?: string
          line_oa_member_link_unlink_reason?: string | null
          line_oa_member_link_unlinked_at?: string | null
          line_oa_member_link_unlinked_by_account_id?: string | null
          line_oa_member_link_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_line_oa_member_links__contact"
            columns: ["line_oa_member_link_contact_id"]
            isOneToOne: false
            referencedRelation: "line_oa_contacts"
            referencedColumns: ["line_oa_contact_id"]
          },
          {
            foreignKeyName: "fk_line_oa_member_links__linked_by"
            columns: ["line_oa_member_link_linked_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_line_oa_member_links__membership"
            columns: ["line_oa_member_link_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "fk_line_oa_member_links__person"
            columns: ["line_oa_member_link_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "fk_line_oa_member_links__unlinked_by"
            columns: ["line_oa_member_link_unlinked_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      login_events: {
        Row: {
          login_event_account_device_id: string | null
          login_event_account_id: string | null
          login_event_account_session_id: string | null
          login_event_channel_config_id: string | null
          login_event_failure_reason: string | null
          login_event_id: string
          login_event_identity_id: string | null
          login_event_ip_address: unknown
          login_event_occurred_at: string
          login_event_request_id: string | null
          login_event_result: string
          login_event_type: string
          login_event_user_agent: string | null
        }
        Insert: {
          login_event_account_device_id?: string | null
          login_event_account_id?: string | null
          login_event_account_session_id?: string | null
          login_event_channel_config_id?: string | null
          login_event_failure_reason?: string | null
          login_event_id?: string
          login_event_identity_id?: string | null
          login_event_ip_address?: unknown
          login_event_occurred_at?: string
          login_event_request_id?: string | null
          login_event_result: string
          login_event_type: string
          login_event_user_agent?: string | null
        }
        Update: {
          login_event_account_device_id?: string | null
          login_event_account_id?: string | null
          login_event_account_session_id?: string | null
          login_event_channel_config_id?: string | null
          login_event_failure_reason?: string | null
          login_event_id?: string
          login_event_identity_id?: string | null
          login_event_ip_address?: unknown
          login_event_occurred_at?: string
          login_event_request_id?: string | null
          login_event_result?: string
          login_event_type?: string
          login_event_user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_login_events__account"
            columns: ["login_event_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_login_events__account_device"
            columns: ["login_event_account_device_id"]
            isOneToOne: false
            referencedRelation: "account_devices"
            referencedColumns: ["account_device_id"]
          },
          {
            foreignKeyName: "fk_login_events__channel"
            columns: ["login_event_channel_config_id"]
            isOneToOne: false
            referencedRelation: "line_channel_configs"
            referencedColumns: ["line_channel_config_id"]
          },
          {
            foreignKeyName: "fk_login_events__identity"
            columns: ["login_event_identity_id"]
            isOneToOne: false
            referencedRelation: "identities"
            referencedColumns: ["identity_id"]
          },
          {
            foreignKeyName: "fk_login_events__session"
            columns: ["login_event_account_session_id"]
            isOneToOne: false
            referencedRelation: "account_sessions"
            referencedColumns: ["account_session_id"]
          },
        ]
      }
      membership_onboarding_events: {
        Row: {
          membership_onboarding_event_actor_account_id: string | null
          membership_onboarding_event_id: string
          membership_onboarding_event_membership_id: string
          membership_onboarding_event_metadata: Json | null
          membership_onboarding_event_new_status: string
          membership_onboarding_event_occurred_at: string
          membership_onboarding_event_previous_status: string | null
          membership_onboarding_event_reason_code: string | null
          membership_onboarding_event_reason_detail: string | null
          membership_onboarding_event_request_id: string | null
          membership_onboarding_event_sequence: number
          membership_onboarding_event_type: string
        }
        Insert: {
          membership_onboarding_event_actor_account_id?: string | null
          membership_onboarding_event_id?: string
          membership_onboarding_event_membership_id: string
          membership_onboarding_event_metadata?: Json | null
          membership_onboarding_event_new_status: string
          membership_onboarding_event_occurred_at?: string
          membership_onboarding_event_previous_status?: string | null
          membership_onboarding_event_reason_code?: string | null
          membership_onboarding_event_reason_detail?: string | null
          membership_onboarding_event_request_id?: string | null
          membership_onboarding_event_sequence?: never
          membership_onboarding_event_type: string
        }
        Update: {
          membership_onboarding_event_actor_account_id?: string | null
          membership_onboarding_event_id?: string
          membership_onboarding_event_membership_id?: string
          membership_onboarding_event_metadata?: Json | null
          membership_onboarding_event_new_status?: string
          membership_onboarding_event_occurred_at?: string
          membership_onboarding_event_previous_status?: string | null
          membership_onboarding_event_reason_code?: string | null
          membership_onboarding_event_reason_detail?: string | null
          membership_onboarding_event_request_id?: string | null
          membership_onboarding_event_sequence?: never
          membership_onboarding_event_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_onboarding_events__actor"
            columns: ["membership_onboarding_event_actor_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_onboarding_events__membership"
            columns: ["membership_onboarding_event_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["membership_id"]
          },
        ]
      }
      membership_role_assignments: {
        Row: {
          membership_role_assignment_assigned_at: string
          membership_role_assignment_assigned_by_account_id: string
          membership_role_assignment_club_term_id: string | null
          membership_role_assignment_ends_at: string | null
          membership_role_assignment_id: string
          membership_role_assignment_membership_id: string
          membership_role_assignment_reason_code: string
          membership_role_assignment_reason_detail: string | null
          membership_role_assignment_revoked_at: string | null
          membership_role_assignment_revoked_by_account_id: string | null
          membership_role_assignment_role_id: string
          membership_role_assignment_starts_at: string
          membership_role_assignment_status: string
        }
        Insert: {
          membership_role_assignment_assigned_at?: string
          membership_role_assignment_assigned_by_account_id: string
          membership_role_assignment_club_term_id?: string | null
          membership_role_assignment_ends_at?: string | null
          membership_role_assignment_id?: string
          membership_role_assignment_membership_id: string
          membership_role_assignment_reason_code: string
          membership_role_assignment_reason_detail?: string | null
          membership_role_assignment_revoked_at?: string | null
          membership_role_assignment_revoked_by_account_id?: string | null
          membership_role_assignment_role_id: string
          membership_role_assignment_starts_at: string
          membership_role_assignment_status?: string
        }
        Update: {
          membership_role_assignment_assigned_at?: string
          membership_role_assignment_assigned_by_account_id?: string
          membership_role_assignment_club_term_id?: string | null
          membership_role_assignment_ends_at?: string | null
          membership_role_assignment_id?: string
          membership_role_assignment_membership_id?: string
          membership_role_assignment_reason_code?: string
          membership_role_assignment_reason_detail?: string | null
          membership_role_assignment_revoked_at?: string | null
          membership_role_assignment_revoked_by_account_id?: string | null
          membership_role_assignment_role_id?: string
          membership_role_assignment_starts_at?: string
          membership_role_assignment_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_membership_role_assignments__assigned_by"
            columns: ["membership_role_assignment_assigned_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_membership_role_assignments__membership"
            columns: ["membership_role_assignment_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "fk_membership_role_assignments__revoked_by"
            columns: ["membership_role_assignment_revoked_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_membership_role_assignments__role"
            columns: ["membership_role_assignment_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "fk_membership_role_assignments__term"
            columns: ["membership_role_assignment_club_term_id"]
            isOneToOne: false
            referencedRelation: "club_terms"
            referencedColumns: ["club_term_id"]
          },
        ]
      }
      membership_status_histories: {
        Row: {
          membership_status_history_changed_by_account_id: string | null
          membership_status_history_created_at: string
          membership_status_history_effective_at: string
          membership_status_history_id: string
          membership_status_history_membership_id: string
          membership_status_history_new_status: string
          membership_status_history_previous_status: string | null
          membership_status_history_reason_code: string
          membership_status_history_reason_detail: string | null
          membership_status_history_recorded_at: string
          membership_status_history_sequence: number
          membership_status_history_supersedes_id: string | null
          membership_status_history_void_reason: string | null
          membership_status_history_voided_at: string | null
          membership_status_history_voided_by_account_id: string | null
        }
        Insert: {
          membership_status_history_changed_by_account_id?: string | null
          membership_status_history_created_at?: string
          membership_status_history_effective_at: string
          membership_status_history_id?: string
          membership_status_history_membership_id: string
          membership_status_history_new_status: string
          membership_status_history_previous_status?: string | null
          membership_status_history_reason_code: string
          membership_status_history_reason_detail?: string | null
          membership_status_history_recorded_at?: string
          membership_status_history_sequence?: never
          membership_status_history_supersedes_id?: string | null
          membership_status_history_void_reason?: string | null
          membership_status_history_voided_at?: string | null
          membership_status_history_voided_by_account_id?: string | null
        }
        Update: {
          membership_status_history_changed_by_account_id?: string | null
          membership_status_history_created_at?: string
          membership_status_history_effective_at?: string
          membership_status_history_id?: string
          membership_status_history_membership_id?: string
          membership_status_history_new_status?: string
          membership_status_history_previous_status?: string | null
          membership_status_history_reason_code?: string
          membership_status_history_reason_detail?: string | null
          membership_status_history_recorded_at?: string
          membership_status_history_sequence?: never
          membership_status_history_supersedes_id?: string | null
          membership_status_history_void_reason?: string | null
          membership_status_history_voided_at?: string | null
          membership_status_history_voided_by_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_msh__changed_by"
            columns: ["membership_status_history_changed_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_msh__membership"
            columns: ["membership_status_history_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "fk_msh__supersedes"
            columns: ["membership_status_history_supersedes_id"]
            isOneToOne: false
            referencedRelation: "membership_status_histories"
            referencedColumns: ["membership_status_history_id"]
          },
          {
            foreignKeyName: "fk_msh__voided_by"
            columns: ["membership_status_history_voided_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      memberships: {
        Row: {
          membership_club_id: string
          membership_created_at: string
          membership_created_by_account_id: string | null
          membership_ended_on: string | null
          membership_id: string
          membership_joined_on: string | null
          membership_member_number: string | null
          membership_onboarding_status: string
          membership_person_id: string
          membership_source: string
          membership_status: string
          membership_type: string
          membership_updated_at: string
          membership_updated_by_account_id: string | null
        }
        Insert: {
          membership_club_id: string
          membership_created_at?: string
          membership_created_by_account_id?: string | null
          membership_ended_on?: string | null
          membership_id?: string
          membership_joined_on?: string | null
          membership_member_number?: string | null
          membership_onboarding_status?: string
          membership_person_id: string
          membership_source?: string
          membership_status?: string
          membership_type?: string
          membership_updated_at?: string
          membership_updated_by_account_id?: string | null
        }
        Update: {
          membership_club_id?: string
          membership_created_at?: string
          membership_created_by_account_id?: string | null
          membership_ended_on?: string | null
          membership_id?: string
          membership_joined_on?: string | null
          membership_member_number?: string | null
          membership_onboarding_status?: string
          membership_person_id?: string
          membership_source?: string
          membership_status?: string
          membership_type?: string
          membership_updated_at?: string
          membership_updated_by_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_memberships__clubs"
            columns: ["membership_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "fk_memberships__created_by"
            columns: ["membership_created_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_memberships__people"
            columns: ["membership_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "fk_memberships__updated_by"
            columns: ["membership_updated_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      people: {
        Row: {
          person_avatar_url: string | null
          person_birthday: string | null
          person_chinese_name: string | null
          person_created_at: string
          person_created_by_account_id: string | null
          person_english_name: string | null
          person_gender: string
          person_id: string
          person_status: string
          person_updated_at: string
          person_updated_by_account_id: string | null
        }
        Insert: {
          person_avatar_url?: string | null
          person_birthday?: string | null
          person_chinese_name?: string | null
          person_created_at?: string
          person_created_by_account_id?: string | null
          person_english_name?: string | null
          person_gender?: string
          person_id?: string
          person_status?: string
          person_updated_at?: string
          person_updated_by_account_id?: string | null
        }
        Update: {
          person_avatar_url?: string | null
          person_birthday?: string | null
          person_chinese_name?: string | null
          person_created_at?: string
          person_created_by_account_id?: string | null
          person_english_name?: string | null
          person_gender?: string
          person_id?: string
          person_status?: string
          person_updated_at?: string
          person_updated_by_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_people__created_by"
            columns: ["person_created_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_people__updated_by"
            columns: ["person_updated_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      permissions: {
        Row: {
          permission_action: string
          permission_code: string
          permission_created_at: string
          permission_description: string | null
          permission_id: string
          permission_resource: string
          permission_risk_level: string
          permission_status: string
          permission_updated_at: string
        }
        Insert: {
          permission_action: string
          permission_code: string
          permission_created_at?: string
          permission_description?: string | null
          permission_id?: string
          permission_resource: string
          permission_risk_level?: string
          permission_status?: string
          permission_updated_at?: string
        }
        Update: {
          permission_action?: string
          permission_code?: string
          permission_created_at?: string
          permission_description?: string | null
          permission_id?: string
          permission_resource?: string
          permission_risk_level?: string
          permission_status?: string
          permission_updated_at?: string
        }
        Relationships: []
      }
      person_contacts: {
        Row: {
          person_contact_country_code: string | null
          person_contact_created_at: string
          person_contact_created_by_account_id: string | null
          person_contact_extension: string | null
          person_contact_id: string
          person_contact_is_primary: boolean
          person_contact_is_verified: boolean
          person_contact_label: string | null
          person_contact_normalization_version: number
          person_contact_normalized_value: string | null
          person_contact_person_id: string
          person_contact_search_value: string | null
          person_contact_status: string
          person_contact_type: string
          person_contact_updated_at: string
          person_contact_updated_by_account_id: string | null
          person_contact_value: string
          person_contact_verification_method: string | null
          person_contact_verified_at: string | null
        }
        Insert: {
          person_contact_country_code?: string | null
          person_contact_created_at?: string
          person_contact_created_by_account_id?: string | null
          person_contact_extension?: string | null
          person_contact_id?: string
          person_contact_is_primary?: boolean
          person_contact_is_verified?: boolean
          person_contact_label?: string | null
          person_contact_normalization_version?: number
          person_contact_normalized_value?: string | null
          person_contact_person_id: string
          person_contact_search_value?: string | null
          person_contact_status?: string
          person_contact_type: string
          person_contact_updated_at?: string
          person_contact_updated_by_account_id?: string | null
          person_contact_value: string
          person_contact_verification_method?: string | null
          person_contact_verified_at?: string | null
        }
        Update: {
          person_contact_country_code?: string | null
          person_contact_created_at?: string
          person_contact_created_by_account_id?: string | null
          person_contact_extension?: string | null
          person_contact_id?: string
          person_contact_is_primary?: boolean
          person_contact_is_verified?: boolean
          person_contact_label?: string | null
          person_contact_normalization_version?: number
          person_contact_normalized_value?: string | null
          person_contact_person_id?: string
          person_contact_search_value?: string | null
          person_contact_status?: string
          person_contact_type?: string
          person_contact_updated_at?: string
          person_contact_updated_by_account_id?: string | null
          person_contact_value?: string
          person_contact_verification_method?: string | null
          person_contact_verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_person_contacts__created_by"
            columns: ["person_contact_created_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_person_contacts__people"
            columns: ["person_contact_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "fk_person_contacts__updated_by"
            columns: ["person_contact_updated_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      person_match_cases: {
        Row: {
          person_match_case_candidate_person_id: string | null
          person_match_case_created_at: string
          person_match_case_id: string
          person_match_case_request_digest: string
          person_match_case_requested_by_account_id: string
          person_match_case_requested_club_id: string
          person_match_case_resolution_code: string | null
          person_match_case_resolution_detail: string | null
          person_match_case_result: string
          person_match_case_reviewed_at: string | null
          person_match_case_reviewed_by_account_id: string | null
          person_match_case_status: string
        }
        Insert: {
          person_match_case_candidate_person_id?: string | null
          person_match_case_created_at?: string
          person_match_case_id?: string
          person_match_case_request_digest: string
          person_match_case_requested_by_account_id: string
          person_match_case_requested_club_id: string
          person_match_case_resolution_code?: string | null
          person_match_case_resolution_detail?: string | null
          person_match_case_result: string
          person_match_case_reviewed_at?: string | null
          person_match_case_reviewed_by_account_id?: string | null
          person_match_case_status?: string
        }
        Update: {
          person_match_case_candidate_person_id?: string | null
          person_match_case_created_at?: string
          person_match_case_id?: string
          person_match_case_request_digest?: string
          person_match_case_requested_by_account_id?: string
          person_match_case_requested_club_id?: string
          person_match_case_resolution_code?: string | null
          person_match_case_resolution_detail?: string | null
          person_match_case_result?: string
          person_match_case_reviewed_at?: string | null
          person_match_case_reviewed_by_account_id?: string | null
          person_match_case_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_person_match_cases__candidate"
            columns: ["person_match_case_candidate_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "fk_person_match_cases__clubs"
            columns: ["person_match_case_requested_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "fk_person_match_cases__requester"
            columns: ["person_match_case_requested_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_person_match_cases__reviewer"
            columns: ["person_match_case_reviewed_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      platform_role_assignments: {
        Row: {
          platform_role_assignment_account_id: string
          platform_role_assignment_assigned_at: string
          platform_role_assignment_assigned_by_account_id: string
          platform_role_assignment_ends_at: string | null
          platform_role_assignment_id: string
          platform_role_assignment_reason_code: string
          platform_role_assignment_reason_detail: string | null
          platform_role_assignment_revoked_at: string | null
          platform_role_assignment_revoked_by_account_id: string | null
          platform_role_assignment_role_id: string
          platform_role_assignment_starts_at: string
          platform_role_assignment_status: string
        }
        Insert: {
          platform_role_assignment_account_id: string
          platform_role_assignment_assigned_at?: string
          platform_role_assignment_assigned_by_account_id: string
          platform_role_assignment_ends_at?: string | null
          platform_role_assignment_id?: string
          platform_role_assignment_reason_code: string
          platform_role_assignment_reason_detail?: string | null
          platform_role_assignment_revoked_at?: string | null
          platform_role_assignment_revoked_by_account_id?: string | null
          platform_role_assignment_role_id: string
          platform_role_assignment_starts_at: string
          platform_role_assignment_status?: string
        }
        Update: {
          platform_role_assignment_account_id?: string
          platform_role_assignment_assigned_at?: string
          platform_role_assignment_assigned_by_account_id?: string
          platform_role_assignment_ends_at?: string | null
          platform_role_assignment_id?: string
          platform_role_assignment_reason_code?: string
          platform_role_assignment_reason_detail?: string | null
          platform_role_assignment_revoked_at?: string | null
          platform_role_assignment_revoked_by_account_id?: string | null
          platform_role_assignment_role_id?: string
          platform_role_assignment_starts_at?: string
          platform_role_assignment_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_platform_role_assignments__account"
            columns: ["platform_role_assignment_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_platform_role_assignments__assigned_by"
            columns: ["platform_role_assignment_assigned_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_platform_role_assignments__revoked_by"
            columns: ["platform_role_assignment_revoked_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_platform_role_assignments__role"
            columns: ["platform_role_assignment_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          role_permission_created_at: string
          role_permission_granted_at: string
          role_permission_granted_by_account_id: string
          role_permission_id: string
          role_permission_permission_id: string
          role_permission_role_id: string
        }
        Insert: {
          role_permission_created_at?: string
          role_permission_granted_at?: string
          role_permission_granted_by_account_id: string
          role_permission_id?: string
          role_permission_permission_id: string
          role_permission_role_id: string
        }
        Update: {
          role_permission_created_at?: string
          role_permission_granted_at?: string
          role_permission_granted_by_account_id?: string
          role_permission_id?: string
          role_permission_permission_id?: string
          role_permission_role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_role_permissions__granted_by"
            columns: ["role_permission_granted_by_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_role_permissions__permission"
            columns: ["role_permission_permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["permission_id"]
          },
          {
            foreignKeyName: "fk_role_permissions__role"
            columns: ["role_permission_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      roles: {
        Row: {
          role_code: string
          role_created_at: string
          role_description: string | null
          role_id: string
          role_is_system_role: boolean
          role_name: string
          role_scope_type: string
          role_status: string
          role_updated_at: string
        }
        Insert: {
          role_code: string
          role_created_at?: string
          role_description?: string | null
          role_id?: string
          role_is_system_role?: boolean
          role_name: string
          role_scope_type: string
          role_status?: string
          role_updated_at?: string
        }
        Update: {
          role_code?: string
          role_created_at?: string
          role_description?: string | null
          role_id?: string
          role_is_system_role?: boolean
          role_name?: string
          role_scope_type?: string
          role_status?: string
          role_updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_membership_invitation: {
        Args: {
          p_actor_auth_user_id: string
          p_delivery_channel: string
          p_destination_masked: string
          p_expires_at: string
          p_hmac_key_version: number
          p_idempotency_key: string
          p_invitation_id: string
          p_membership_id: string
          p_request_hash: string
          p_request_id: string
          p_token_hash: string
          p_token_issued_at: string
          p_token_nonce: string
          p_token_version: number
        }
        Returns: {
          invitation_error_code: string
          invitation_id: string
          invitation_is_replay: boolean
          invitation_status: string
        }[]
      }
      resend_membership_invitation: {
        Args: {
          p_actor_auth_user_id: string
          p_expires_at: string
          p_hmac_key_version: number
          p_idempotency_key: string
          p_invitation_id: string
          p_request_hash: string
          p_request_id: string
          p_token_hash: string
          p_token_issued_at: string
          p_token_nonce: string
          p_token_version: number
        }
        Returns: {
          invitation_error_code: string
          invitation_id: string
          invitation_is_replay: boolean
          invitation_status: string
        }[]
      }
      revoke_membership_invitation: {
        Args: {
          p_actor_auth_user_id: string
          p_idempotency_key: string
          p_invitation_id: string
          p_reason_code: string
          p_request_hash: string
          p_request_id: string
        }
        Returns: {
          invitation_error_code: string
          invitation_id: string
          invitation_is_replay: boolean
          invitation_status: string
        }[]
      }
      validate_membership_invitation: {
        Args: {
          p_actor_auth_user_id: string
          p_hmac_key_version: number
          p_idempotency_key: string
          p_invitation_id: string
          p_request_hash: string
          p_request_id: string
          p_token_expires_at: string
          p_token_hash: string
          p_token_issued_at: string
          p_token_version: number
        }
        Returns: {
          invitation_can_attempt_onboarding: boolean
          invitation_error_code: string
          invitation_id: string
          invitation_is_idempotent_retry: boolean
          invitation_is_valid: boolean
          invitation_validated_at: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
