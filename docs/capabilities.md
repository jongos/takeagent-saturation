# Capability and field map — 2026-11-17

Reviewed official [documentation map](https://docs.saturation.io/llms.txt), [quickstart](https://docs.saturation.io/quickstart.md), and [authentication guide](https://docs.saturation.io/authentication.md). The documented base is `https://next-api.saturation.io/v1`; bearer authentication binds a token to one workspace. Lists return `data` with optional `nextCursor`.

| Input | Spike output | Limits |
| --- | --- | --- |
| `/me` → `workspaces[].workspaceId` | Expected-workspace check | Host still owns tenant authorization |
| `/projects/{projectId}/budget/totals` → `computedAt` | Snapshot as-of | Not an accounting revision identifier |
| `totals[phaseId].amount/currency` | Explicitly selected cost category | No guessed phase semantics or FX |
| `/transactions?projectId=...&limit=100&cursor=...` | ID, project ID, amount, currency | Not summed into actuals; payment/PO overlap unresolved |
| Host-provided revision | Provenance/fingerprint | Must originate from reviewed import/sync policy |

Original budget, revised budget, actuals, commitments, ETC and EFC may each be explicitly mapped to a distinct phase. Absent fields remain unknown. Account hierarchy and account-level totals are not yet supported. Phase totals are preserved exactly, not claimed as independently reconciled.

Public [marketing](https://saturation.io/api) says Enterprise API access; [3.0 support](https://support.saturation.io/en/articles/16499255-use-the-saturation-api-saturation-3-0) says Pro, Team and Enterprise. Customer eligibility remains unverified. Authentication docs describe personal tokens inheriting permissions. No narrow read-only scope has been established by this spike.

The client deliberately performs no automatic retries: a rate limit or partial failure aborts the read without a returned partial result. Production backoff must respect vendor policy and bound total runtime. No webhook authenticity claims are made.
