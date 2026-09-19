begin;

-- Cancelling an event revokes every still-active dynamic QR credential for it.
-- The trigger has always enforced that security rule, but the existing indexes
-- were optimized for session lookup and expiry cleanup, not this event-scoped
-- update.  On a growing staging database that made an otherwise small cancel
-- transaction scan the complete credential history.
create index event_checkin_qr_credentials_event_active_idx
  on public.event_checkin_qr_credentials (event_id)
  where revoked_at is null;

commit;
