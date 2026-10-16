# Agent Platform Foundation

## Goal
Build a semi-autonomous digital manager with long-term project memory, management preferences, commercial goals, task orchestration, specialist agents, mobile status/approval views, and auditable execution.

## Guardrails
- Work only on `agent-platform-foundation` until reviewed.
- Never merge to `main`, deploy, apply production database changes, or enable real payments without explicit owner approval.
- Use least privilege; keep production credentials out of agent prompts and untrusted task content.
- Budget is undecided: record usage and support configurable limits; do not enable paid services automatically.

## Initial repository review
- `server/index.js` creates a Supabase client with the service-role key.
- `POST /api/bookings` accepts `user_id` from the request body or uses a hard-coded fallback; the route does not visibly authenticate the caller.
- Booking detail, task event, and debug task routes do not visibly enforce ownership/role checks before querying through the elevated client.
- `.github/workflows/process-supabase-tasks-event.yml` runs on a five-minute schedule and can access Supabase service-role and Anthropic API secrets. Inspect RPC transitions, permissions, logs, retries, and idempotency before expanding its responsibilities.
- PR #6 (listing fees) and PR #7 (safe frontend workflow) are open drafts, not merged. PR #6 says its migration has not been applied to Supabase.
- The README describes payment features, but current payment activation is unverified. Keep real payment collection disabled.

These are code-review findings, not a live penetration test. Hosted database schema, deployed configuration, secret settings, and production logs were not inspected.

## Implementation order
1. Finish read-only security review of routes, RLS assumptions, worker RPCs, and deployment triggers.
2. Add a durable task ledger with explicit states, bounded retries, idempotency, and event history.
3. Add structured memory for project facts, approved decisions, management preferences, commercial goals, and unverified hypotheses, with provenance and timestamps.
4. Add an approval gate for sensitive actions and an auditable record of every decision.
5. Test orchestration with mocked tools and untrusted task inputs before integrating live systems.
6. Build a mobile-friendly status and approval dashboard after the manager API is stable.

## Acceptance criteria
- Tasks resume after interruption and cannot silently skip state transitions.
- Memory distinguishes verified facts, approved decisions, suggestions, and assumptions.
- Sensitive actions remain blocked until explicit approval is recorded.
- Tests cover duplicate events, failed agents, retry limits, budget limits, and prompt-injection-like task content.
- Reports list changes, test outcomes, unresolved risks, and usage where measurable.
