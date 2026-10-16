# Dar listing fees — implementation plan

## Approved product decisions
- Launch globally from the start, while keeping currency, locale, taxes, and payment-provider eligibility configurable per market.
- Charge per property listing, not per owner account.
- Launch offer: exactly 100 free property listings globally. The campaign is configured with a 100-claim cap but remains inactive until the atomic claim workflow and abuse controls are implemented and tested. The draft schema limits one claim per owner and property.
- Each listing term lasts 30 days.
- Do not enable real charges until the merchant country, legal requirements, currency, payment provider, webhook verification, refunds, and production credentials are reviewed and explicitly approved.
- Do not merge this branch into `main` without the owner's approval.

## Repository review (current snapshot)
- `supabase-schema.sql` currently defines `bookings`, `tasks`, `task_results`, and `task_events`; it does not define a property/listing/payment schema.
- `server/index.js` is currently booking-focused and accepts `user_id` from the request body, including a hardcoded fallback. Do not reuse that identity pattern for property ownership or payment decisions. Use verified Supabase Auth identity.
- `public/supabase-config.js` contains empty URL and anon-key placeholders. No production Supabase connection is confirmed.
- `public/index.html` is an Arabic accommodation-search demo. Treat its sample listings as demo data until a verified backend source is connected.
- A prior quality-foundation PR #5 is open; this proposal is isolated on its own branch from `main`.

## Proposed database
The migration in `supabase/migrations/20261014000000_listing_fees_foundation.sql` proposes:
- `properties`: owner-managed property listings and moderation state.
- `listing_plans`: 30-day listing offer configuration, inactive by default.
- `listing_orders`: owner/property order with idempotency key and explicit order states.
- `payments`: provider references and verified payment state only; no card data.
- `listing_entitlements`: 30-day right to publish, linked one-to-one with an order.
- `listing_audit_logs`: traceable moderation and billing actions.

Before applying: compare against the live Supabase schema and any untracked migrations; back up the database; apply to a disposable/staging project first. This migration does not configure a provider, collect money, or automatically grant the free listing. Trusted server-side code must implement the first-listing promotion transactionally and enforce one free grant per owner.

## Owner and admin UI
1. Owner dashboard: property list, add/edit draft, media URLs, submission status, review rejection reason, listing expiry, order history, renew action.
2. Listing checkout preview: selected property, 30-day term, currency and amount; show the limited free launch offer only after the server confirms remaining slots and owner eligibility. While payments are unconfigured, paid checkout remains disabled and clearly labelled as not available yet.
3. Admin moderation: pending queue, approve/reject with reason, suspend listing, manage plan price/active status, inspect orders/payments/audit trail. Admin mutations must be server-side and role-gated; no client-supplied admin flag.
4. Public discovery: only approved and currently entitled listings; distinguish sponsored listings from organic results.

## Required server-side rules
- Derive owner ID from verified Auth token; never trust `user_id` in request JSON.
- Validate ownership for every property/order operation.
- Use an idempotency key for order creation and payment webhook handling.
- Never mark a payment successful based on browser redirects.
- Verify provider webhook signature, amount, currency, order reference, and provider event ID.
- Grant entitlement exactly once after verified payment, or after a server-side atomic promotion claim that enforces the global cap and one claim per owner.
- Keep all service-role/payment secrets on the server; never commit them or expose them in browser config.
- Default-deny production checkout until merchant eligibility, legal review, refunds/cancellations, taxes, and provider production credentials are approved.

## Acceptance checks before launch
- Owner A cannot read/update Owner B's drafts, orders, payments, or entitlements.
- Anonymous users can read only fields exposed by `public.public_properties`, filtered to published listings within an active entitlement window.
- Owners cannot approve or publish their own listings by editing JSON.
- The limited launch promotion cannot exceed its configured global cap under concurrent requests, retries, or multiple accounts; apply an explicit anti-abuse policy.
- Duplicate webhook delivery cannot duplicate a charge or entitlement.
- Expired listings disappear from public search automatically.
- Payment configuration remains off and no real payment is attempted in test mode.
