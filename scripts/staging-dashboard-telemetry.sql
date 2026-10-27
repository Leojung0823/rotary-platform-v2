-- Read-only, privacy-safe aggregation for the protected staging performance workflow.
-- Never select daily_subject, raw payloads, account identifiers, or page content.
with recent_dashboard_timings as (
  select
    event_name,
    (payload ->> 'duration_ms')::numeric as duration_ms
  from public.platform_product_telemetry
  where created_at >= now() - interval '15 minutes'
    and event_name in ('member_context_resolve_success', 'member_home_projection_duration')
    and payload ? 'duration_ms'
)
select
  event_name,
  count(*)::integer as sample_count,
  round((percentile_cont(0.5) within group (order by duration_ms))::numeric, 1) as median_duration_ms,
  round((percentile_cont(0.95) within group (order by duration_ms))::numeric, 1) as p95_duration_ms
from recent_dashboard_timings
group by event_name
order by event_name;
