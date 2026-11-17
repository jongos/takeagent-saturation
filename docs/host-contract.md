# TakeAgent host integration contract

This package is a server-side adapter. It does not authenticate users or grant permissions and must not be called directly from a browser. The integration manifest is informational: `status=development`, `liveEnabled=false`. Production may show this status and blockers, but must not expose a working Connect action until the pilot gates are met.

## Request boundary

For every preview, refresh, compare or disconnect request, the host must resolve the authenticated principal, tenant, active entitlement and owned TakeAgent project from its own session/database. Never trust browser-supplied tenant IDs, workspace ownership, phase approval or prior snapshots. Verify the selected external workspace/project against the tenant-owned connection and approved mapping record. Perform these checks again after a long vendor read before exposing or storing results. Revoked permission must invalidate an in-flight import.

Only after those checks, load the server-side token, construct `createReadClient({token, workspaceId, projectId, transport})`, and request `budgetDocument()`. `createReadClient` accepts only a transport returned by `createBoundedTransport(fetchImpl)` from `src/transport.js`; it requires an explicit fetch implementation and enforces a 5 MiB response stream limit before JSON parsing, a 10-second deadline through body consumption, JSON/UTF-8 checks, GET-only same-origin requests with encoded-path hardening, redirect prohibition and cancellation. No network transport is activated by default. Do not send the token or raw vendor documents to the browser/model. API 401/403 disables the client; disconnect aborts active requests and clears its token reference. The host owns durable token deletion and revocation of outstanding sessions.

## Reconciliation boundary

Prefer the package's `prepareBudgetReview(document, trustedContext)` or bounded offline `reviewBudgetDocumentBytes(bytes, trustedContext)` entry described in [readiness API](readiness-api.md). Supply server-reviewed source/phase assertions and the authorized project's expected currency. Blocked results contain no partial preview; a successful diagnostic transaction read must not override a blocker. A ready result still has `canApply: false` and `financialAcceptance: false`.

Pass the complete unfiltered response to `reconcileBudgetDocument(document, context)` where context contains server-resolved `workspaceId`, `projectId`, reviewed `phaseMap`, immutable `revision`, `importedAt` and trusted server `now`. A full document is a single read, avoiding joins across drifting pagination for account reconciliation. `computedAt` is a calculation timestamp, not assumed to be a vendor revision ID. The host must assign an immutable import revision and store its source fingerprint.

The supported profile is `saturation-budget-document-account-line-credit-v1`. It verifies unique IDs, complete acyclic parent relationships, depth, visible mapped phases, one currency, exact parent/child subtotals and project totals. Amounts use major currency units, compared exactly to four decimals without rounding. Unsupported line types, precision, filtered selections, missing values and mismatches reject the preview. Missing mapped categories remain null; unknown does not mean zero. A reconciled hierarchy is not proof of accounting completeness or correct phase meanings.

Phase totals and transactions have different units: phase amounts are major units; transaction `Money.amount` is integer minor units. The client labels both. Never sum them directly or use a universal divide-by-100 conversion; currencies differ. Transaction reads are diagnostic evidence only, not an independently reconciled actuals source. `CashAdvance` rows are explicitly not spend in vendor documentation; this library performs no transaction spend aggregation.

## Preview and persistence

Show source, as-of/import dates, stale state, revision, source line/account paths, mapped categories, missing/unmapped categories, reconciliation scope and warnings. Display only minimized output. Treat all source-derived strings as untrusted text. Use TakeAgent's existing document/import and finance-review services; keep the source cost snapshot separate from the finance plan and financing evidence.

The user must approve any saved-project mutation through existing explicit apply controls. Bind consent to the exact fingerprint and destination project version. Recheck ownership, entitlement, mapping, fingerprint and destination version atomically at apply time. Unique import keys must include tenant, connection, external project and fingerprint. Do not deduplicate globally across tenants. `compareSnapshots` reports duplicate/new revision and cost changes, rejects scope/revision conflicts, and never mutates a finance plan; it accepts only server-created trusted snapshots.

Cost overrun may be computed against a reviewed budget. Funding gap requires separate financing status/evidence; cash-timing gap requires a separate dated cash schedule. Neither can be inferred solely from these snapshots.

## Retention and failure

No persistence occurs in the adapter. The host must expire pending previews, delete raw imports per policy, remove tokens on disconnect, retain only authorized audit metadata and honor account deletion. Errors abort the operation without partial success. A rate-limit response is surfaced without retries; the host may implement approved bounded retry/backoff, preserving scope and cancellation. Logs may record operation/status and internal correlation ID, never bearer values or raw records.

Required host acceptance: cross-tenant denial, revoked entitlement/ownership during read, changed mapping after preview, concurrent project edits, duplicate apply, token deletion, cancellation, expired preview, prompt injection and retention cleanup. These are not satisfied by the library test suite.
