# Capability and field map — 2026-11-17

Reviewed official [documentation map](https://docs.saturation.io/llms.txt), [quickstart](https://docs.saturation.io/quickstart.md), and [authentication guide](https://docs.saturation.io/authentication.md). The documented base is `https://next-api.saturation.io/v1`; bearer authentication binds a token to one workspace. Lists return `data` with optional `nextCursor`.

| Input | Spike output | Limits |
| --- | --- | --- |
| `/me` → `workspaces[].workspaceId` | Expected-workspace check | Host still owns tenant authorization |
| `/projects/{projectId}/budget/totals` → `computedAt` | Snapshot as-of | Not an accounting revision identifier |
| `totals[phaseId].amount/currency` | Explicitly selected cost category | No guessed phase semantics or FX |
| `/transactions?projectId=...&limit=100&cursor=...` | ID, project ID, amount, currency | Not summed into actuals; payment/PO overlap unresolved |
| Host-provided revision | Provenance/fingerprint | Must originate from reviewed import/sync policy |

Original budget, revised budget, actuals, commitments, ETC and EFC may each be explicitly mapped to a distinct phase. Absent fields remain unknown. The phase-only preview preserves totals without independent reconciliation; `reconcileBudgetDocument` additionally validates account hierarchy and exact totals for its supported profile.

Public [marketing](https://saturation.io/api) says Enterprise API access; [3.0 support](https://support.saturation.io/en/articles/16499255-use-the-saturation-api-saturation-3-0) says Pro, Team and Enterprise. Customer eligibility remains unverified. Authentication docs describe personal tokens inheriting permissions. No narrow read-only scope has been established by this spike.

The client deliberately performs no automatic retries: a rate limit or partial failure aborts the read without a returned partial result. Production backoff must respect vendor policy and bound total runtime. No webhook authenticity claims are made.

## OpenAPI verification and expanded profile

On 2026-11-17, inspected the official [OpenAPI contract](https://docs.saturation.io/openapi.yaml), [budget document endpoint](https://docs.saturation.io/api-reference/budget_get.md), [totals endpoint](https://docs.saturation.io/api-reference/budget_getTotals.md) and [transaction list endpoint](https://docs.saturation.io/api-reference/transactions_list.md).

`BudgetDocument` contains `id`, `computedAt`, `selection`, `phases`, `totals` and `lines`. Its lines expose `id`, `parentId`, `depth`, `type`, optional `accountId`/`path` and phase-keyed `values`. The implemented profile accepts only empty selection and account/line/credit records; it rejects fringe records until overlap behavior is verified. Account codes are not unique keys: stable line IDs identify rows.

`BudgetDocumentPhaseValues` and `PhaseValues` use decimal major currency units. `Money` on transactions uses integer minor units capped at ±2^52. Both outputs now label their units. Transaction `projectId` is documented and nullable; selected-project reads reject null or mismatched IDs. `CashAdvance` records are not spend regardless of `actualized`, so transaction totals are deliberately not inferred. Pagination requests use documented `createdAt` ascending sort (the service appends ID as a tiebreaker), a 100-row page bound and count checks when returned. It cannot prove a point-in-time transaction snapshot under concurrent vendor writes; those rows remain diagnostic only.

Phase meaning is not inferred from type/name. Actual phases may contain source, status, date, currency and line filters. Human-reviewed phase mapping remains a pilot prerequisite. No payroll descriptions, contacts, bank fields or source notes survive the canonical snapshot.
