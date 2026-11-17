# Pilot blockers

Status: development; production live access disabled. An explicitly authorized personal developer trial evaluation has now verified GET access and synthetic-demo transaction pagination; see [schema evaluation](personal-schema-evaluation.md). No corporate/customer data, API writes, vendor contact or deployment was involved. Full budget import remains blocked by observed grand-total reconciliation and missing-phase-total gaps.

Revisit the observed discrepancy in [GitHub issue #1](https://github.com/jongos/takeagent-saturation/issues/1). Supported development can continue through the typed readiness/offline entry without accepting that demo as a reconciled financial snapshot.

## Vendor-dependent

1. **API entitlement/commercial terms.** Marketing and 3.0 support pages disagree on plan eligibility. Obtain account-specific confirmation before a live pilot.
2. **Least privilege.** Current authentication docs describe workspace-bound personal tokens inheriting user permissions. Establish a read-only role/key route or explicitly assess remaining credential privileges. GET-only code does not narrow a credential.
3. **Computed fringe semantics and overlap.** OpenAPI exposes account, line, credit and fringe computed records, but the schema alone does not prove how standalone fringe rows overlap account totals in every budget. The supported reconciliation profile rejects fringe records rather than guessing. Similarly, do not add transaction/PO amounts to actual phases without validated overlap semantics.
4. **Observed grand-total semantics.** Personal demo account subtotals reconcile but estimate root sums do not match project totals. Actual/rollup totals are absent from budget documents even with phase selection. Clarify aggregation semantics and a coherent total-source contract before accepting full imports. Basic read schemas and pagination are now verified; source revision stability, permissions, rate limits and revocation still need scoped validation.

## User decisions/input

- Choose one authorized workspace/project and destination TakeAgent project for a pilot.
- Review the phase-to-category map. In particular, confirm whether an actual phase is period-limited, status/source-filtered or already includes liabilities; confirm what an open-commitment phase includes.
- Confirm supported currency, period and revision basis, import retention policy and intended reviewers.
- Provide credentials only through the future secure host credential flow, never GitHub issues, repository files or chat.

## Engineering remaining

- Host authentication, tenant/project ownership, entitlement and token-vault integration per [host contract](host-contract.md).
- Preview UI and approved import persistence with optimistic concurrency; immutable source evidence and tenant-bound duplicate index.
- Vendor fixtures for fringe/FX/PO overlap before expanding the supported profile. Unsupported precision above four decimals is currently rejected.
- Account-level downstream finance-review mapping. Cost overruns alone do not establish funding or cash-timing gaps.
- Production retention, durable token deletion and approved retry policy. Use the supplied bounded transport; any custom replacement must enforce the same byte/deadline, abort and redirect restrictions.
- Browser, cross-tenant and real-host end-to-end validation. Library tests do not certify these missing host controls.

Not blocking local development: the library, exact hierarchy reconciliation, scope checks, synthetic tests, revision comparison and integration metadata are implemented without vendor credentials.
