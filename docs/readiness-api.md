# Supported review API

The private package exports its supported surface from `@takeagent/saturation-spike`. Importing it performs no network calls. `prepareBudgetReview(document, trustedContext)` accepts an already parsed budget document. `reviewBudgetDocumentBytes(bytes, trustedContext)` is the offline JSON entry: it accepts a `Uint8Array`/Buffer, caps it at 5 MiB, requires valid UTF-8 JSON and then runs the same reconciliation.

Both entries return a stable `schemaVersion: "1.0"` result:

| Status | Meaning | Preview |
| --- | --- | --- |
| `ready-for-review` | Mapped source categories reconciled under the supported profile; human review is still required | Minimized canonical preview |
| `blocked` | A recognized input, scope, mapping, currency or reconciliation condition prevents review | `null` |
| `failed` | An unexpected adapter failure prevented evaluation | `null` |

Every status has `financialAcceptance: false`, `canApply: false` and `readOnly: true`. A ready result does not approve financing, commit an import or authorize a saved-project change. Unknown categories remain null. Stale dates and missing categories are warnings on a mathematically reconciled preview. The host must handle those warnings before using the result in any downstream review. The first blocking condition is returned; this is not an exhaustive audit of malformed input.

## Trusted context

Resolve these values in the authorized host: `workspaceId`, `projectId`, immutable `revision`, ISO `importedAt`, trusted `now`, explicit `phaseMap`, and `expectedCurrency` from the intended project. Set `sourceScopeReviewed: true` only after checking that the source belongs to the selected external project, and `phaseMappingReviewed: true` only after reviewing phase meaning/filtering. Optional `maxAgeDays` defaults to seven.

These booleans are review assertions, not authentication. Never accept them or tenant/project/currency ownership from an untrusted browser request. The host must derive the authenticated tenant, project authorization, entitlement and external connection from its own session/database on every request, and recheck before persistence. An offline budget document does not contain a verifiable project ownership proof. Its returned provenance explicitly says `projectIdentityBasis: "host-reviewed-mapping"` and `vendorProjectOwnershipVerified: false`; its SHA-256 identifies bytes, not identity or authorization.

## Stable issue codes

`readinessCodes` lists blocking codes. Notable cases:

- `PROJECT_TOTAL_MISSING`: a mapped category has line values but no project grand total. No inferred zero or independently fetched total is inserted.
- `RECONCILIATION_MISMATCH`, with `scope: "project"` or `"account"`: exact totals disagree. No partial financial snapshot is returned.
- `SOURCE_SCOPE_REVIEW_REQUIRED`, `PHASE_MAPPING_REVIEW_REQUIRED`, `PROJECT_CURRENCY_REQUIRED`: host review/context remains incomplete.
- `CURRENCY_MISMATCH`, `AMOUNT_UNSUPPORTED`, `HIERARCHY_INVALID`: source is outside the supported reconciliation profile.
- `INTERNAL_REVIEW_FAILURE`: unexpected implementation error; message/body/details are not exposed.

Issue messages and next steps are static and omit imported descriptions, source IDs, amounts, credentials and private repository locations. `SATURATION_GRAND_TOTALS_001` is an opaque developer reference for the observed discrepancy tracked in [issue #1](https://github.com/jongos/takeagent-saturation/issues/1). Keep that internal link in developer tooling; do not inject it into public product messages.

## Lower-level APIs

- `createReadClient` and `createBoundedTransport` supply GET-only reads. A successful `transactions()` call is diagnostic access, not evidence of budget reconciliation, actuals completeness, funding or cash timing. It must never change a blocked review into a ready one.
- `reconcileBudgetDocument` is the throwing low-level canonical reconciler. `BudgetValidationError` exposes a stable code and minimized details; public hosts should prefer readiness results.
- `previewTotals` is an **unreconciled, phase-only diagnostic**. It enforces the same supported exact precision/range but does not check line or account totals. Never treat its return as a ready-for-review canonical result.
- `compareSnapshots` compares only trusted server-created reconciled previews. It is not an input authentication or validation entry. Currency and phase-mapping changes require a new reviewed baseline.

No host persistence, vendor API writes, commercial access decision or production activation is added by these APIs.
