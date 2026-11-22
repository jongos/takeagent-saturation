# TakeAgent Saturation capability spike

Development library for the [Saturation integration](https://takeagent.ai/integrations/saturation). This is a synthetic-tested adapter, not a deployed integration or completed pilot. [Machine-readable status](integration-manifest.json): live access disabled.

An authorized [personal developer trial evaluation](docs/personal-schema-evaluation.md) verified GET access and six-page transaction ingestion against the vendor's synthetic demo. Full budget import correctly remains blocked by grand-total and missing-phase-total deficits. This does not establish corporate or commercial entitlement.

The [discrepancy is tracked in issue #1](https://github.com/jongos/takeagent-saturation/issues/1). Development continues through the supported [readiness API](docs/readiness-api.md): parsed-document and bounded offline JSON entries return stable blockers or a minimized reconciled preview. Neither successful reads nor a ready preview imply financial acceptance or permission to apply changes.

## Install and test

Requires Node 22+.

```bash
npm ci
npm run lint:syntax
npm test
```

No runtime dependencies, secrets, vendor account, or network are required for the synthetic test suite. CI runs the same checks on Ubuntu and Windows with Node 22 and 24 (see `.github/workflows/test.yml`), including `npm audit --audit-level=high`.

`src/client.js` implements a bounded GET-only client for identity, selected-project budget totals, and paginated transactions. The host must supply a transport; there is no default live network access. Identity is rechecked on each operation, redirects are blocked, errors exclude provider bodies, and partial/duplicate/cross-project pages fail. `disconnect()` invalidates this in-memory client.

`src/transport.js` exports `createBoundedTransport(fetchImpl)`: an explicitly injected fetch wrapper with a 5 MiB streamed response cap, 10-second deadline through body consumption, JSON content-type/UTF-8 checks, redirect rejection, cancellation and redacted failures. It accepts only GET requests to the documented Saturation API origin. Importing the helper does not activate live access.

`src/preview.js` creates a deterministic, read-only phase-total preview from an explicit phase map. Missing cost categories stay null; unmapped phases stay visible. Original/revised budget, actuals, commitments, ETC, and EFC remain separate. Credits are preserved; mixed currencies require reconciliation. The fingerprint is a deduplication primitive, not persistent import storage. No finance-plan writes occur.

`src/snapshot.js` reconciles a complete unfiltered budget document with account, line and credit records. It validates every parent/child subtotal and project total using exact four-decimal comparisons, preserves account codes/hierarchy, and creates a canonical cost snapshot. Unsupported fringe records and higher precision fail visibly. Revision comparison detects duplicates, scope mismatch and conflicting revisions. Budget amounts are labeled major units; transaction amounts are integer minor units and are never added to budget actuals.

## Integration boundary

The eventual TakeAgent host must enforce authenticated tenant/project ownership, billing, token vaulting, revocation and deletion on every request before constructing this library. Workspace matching is defense in depth, not tenant authorization. Pass the reviewed preview to existing TakeAgent document/import and finance-review services; do not invent financing commitments from cost data. This repository does not duplicate those services.

## Remaining work

- Confirm customer entitlement and partner/commercial terms; public pages disagree on supported plans.
- Confirm least-privilege vendor credentials. Public docs describe personal tokens inheriting user permissions, not proven read-only token scopes. GET-only code does not reduce token privileges.
- Validate actual endpoint schemas against an authorized synthetic vendor project; strict `projectId` checks intentionally reject records missing identity.
- Validate phase semantics, fringe records, purchase-order/paid-actual overlap and source revision basis before a live pilot. Account reconciliation is implemented for the documented supported subset.
- Add project selection UI, explicit transmission/apply preview, tenant-bound persistence, safe retry/backoff policy and cancellation lifecycle.
- Add separate funding deficit and cash-timing shortfall analysis only with explicit financing/cash-schedule inputs. Budget totals alone cannot prove those deficits.
- No webhooks, sync scheduling, live access, vendor contact, deployment, payroll or payments are implemented.

See [capability notes](docs/capabilities.md), [blockers](docs/blockers.md) and [host integration contract](docs/host-contract.md).

## License

Licensed under the MediaHedge License. Use is permitted only as allowed by the TakeAgent Terms of Service at https://takeagent.ai/terms. See LICENSE.
