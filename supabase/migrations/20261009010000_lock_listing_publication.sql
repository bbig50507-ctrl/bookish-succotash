-- دار — migration follow-up for the un-applied MVP schema.
-- Authenticated hosts may edit listing details but cannot alter status or publish.
-- Publishing remains an operator-only action until a reviewed moderation flow exists.

revoke update on table public.listings from authenticated;
grant update (
  title,
  city,
  district,
  description,
  max_guests,
  bedrooms,
  bathrooms,
  nightly_rate_sar_halalas
) on table public.listings to authenticated;
