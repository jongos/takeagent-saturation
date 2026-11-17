# TakeAgent Saturation capability spike

Private development repository for [TakeAgent issue #57](https://github.com/jongos/takeagent/issues/57). This is an initial, synthetic-tested library, not a deployed integration or completed pilot.

Run `npm test` with Node 22+. No dependencies, secrets, vendor account, or network are needed.

`src/client.js` implements a bounded GET-only client for identity, selected-project budget totals, and paginated transactions. The host must supply a transport; there is no default live network access. Identity is rechecked on each operation, redirects are blocked, errors exclude provider bodies, and partial/duplicate/cross-project pages fail. `disconnect()` invalidates this in-memory client.

`src/preview.js` creates a deterministic, read-only phase-total preview from an explicit phase map. Missing cost categories stay null; unmapped phases stay visible. Original/revised budget, actuals, commitments, ETC, and EFC remain separate. Credits are preserved; mixed currencies require reconciliation. The fingerprint is a deduplication primitive, not persistent import storage. No finance-plan writes occur.

## Integration boundary

The eventual TakeAgent host must enforce authenticated tenant/project ownership, billing, token vaulting, revocation and deletion on every request before constructing this library. Workspace matching is defense in depth, not tenant authorization. Pass the reviewed preview to existing TakeAgent document/import and finance-review services; do not invent financing commitments from cost data. This repository does not duplicate those services.

## Remaining work

- Confirm customer entitlement and partner/commercial terms; public pages disagree on supported plans.
- Confirm least-privilege vendor credentials. Public docs describe personal tokens inheriting user permissions, not proven read-only token scopes. GET-only code does not reduce token privileges.
- Validate actual endpoint schemas against an authorized synthetic vendor project; strict `projectId` checks intentionally reject records missing identity.
- Add account-level reconciliation, phase semantics, purchase-order/paid-actual overlap reconciliation and stable revision basis before claiming a canonical cost snapshot.
- Add project selection UI, explicit transmission/apply preview, tenant-bound persistence, safe retry/backoff policy and cancellation lifecycle.
- Add separate funding-gap and cash-timing analysis only with explicit financing/cash-schedule inputs. Budget totals alone cannot prove those gaps.
- No webhooks, sync scheduling, live access, vendor contact, deployment, payroll or payments are implemented.

See [capability notes](docs/capabilities.md) for field mapping and current sources.
