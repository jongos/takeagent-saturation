# Personal developer schema evaluation — 2026-11-17

Scope: explicitly authorized personal developer evaluation in a temporary vendor trial workspace containing a vendor-provided synthetic demo. This is not a corporate/customer integration, commercial entitlement determination or production connection. A user-approved workspace-bound personal key was used only for bounded GET requests. It inherits the personal workspace owner's privileges; a narrower vendor read-only scope was not established. No API writes, payments or purchases occurred.

The credential was decrypted from Windows DPAPI only into process memory and passed to the evaluator through stdin. No plaintext credential, identity value, source record, identifier, account label or monetary amount is included in this repository. Notes below are schema and test observations only; vendor sample content is not redistributed.

## Verified reads

| Route | Result | Observed compatibility |
| --- | --- | --- |
| `GET /me` | HTTP 200 | Expected identity envelope and one workspace |
| `GET /projects?limit=100` | HTTP 200 | Expected `data` / `nextCursor` page; selected the one authorized synthetic demo |
| `GET /projects/{id}/budget` | HTTP 200 | Expected document schema; 106 account/line records and four visible phases |
| `GET /projects/{id}/budget/totals` | HTTP 200 | Available phase amounts/currencies agreed with the document's available grand totals |
| `GET /projects/{id}/budget/totals?phase={id}` | HTTP 200 | Separate phase selection returned actual/rollup totals absent from the default document |
| `GET /projects/{id}/budget?phase={id}` | HTTP 200 | Correct phase selection and same account scope; actual/rollup project totals were still absent from this document |
| `GET /transactions` with selected project, `limit=10`, `withCount=true`, `sort=createdAt`, `order=asc` and cursor | HTTP 200 on six pages | All 51 synthetic records passed project, ID, minor-unit, duplicate and pagination checks |

The bounded transport handled actual responses, including JSON content type and streamed byte limits. Default and small-page transaction reads returned the same record count. No identifier-format, nonfinite-amount or greater-than-four-decimal budget values were observed in this demo. These findings are limited to this account, date and sample.

## Full budget import remains blocked

1. **Estimate totals require clarification.** Two visible estimate phases exist; neither is automatically designated original or revised budget. Each was tested independently for arithmetic/schema compatibility, with no saved financial mapping. Every account parent/child subtotal reconciled, but each phase's sum of root accounts differed from its project grand total. The root base totals differed while root fringe totals agreed. No single omitted or duplicated root explains the difference. The adapter correctly rejected both; this observation does not establish whether the vendor's total semantics, demo data, or our aggregation assumption needs adjustment.
2. **Actual/rollup grand totals are missing from budget documents.** Line values exist, but their phase IDs have no corresponding entry in the default document's `totals`. Phase-filtered budget documents still lacked those totals, although the separate phase-filtered totals endpoint supplied them. Independent reads were not silently joined into a claimed coherent snapshot. The adapter now gives a specific missing-project-total error rather than calling this an ambiguous mapping.
3. **Scope remains narrow.** This sample did not validate standalone fringe/credit records, multicurrency conversion, purchase-order overlap, concurrent updates, permission revocation or commercial API rights. Negative security/lifecycle cases remain synthetic tests, not observed live vendor behavior.

Consequently API readability and transaction pagination are verified for this personal trial; a reconciled full cost snapshot is **not** verified. `liveEnabled` remains false. No reconciliation guard was weakened and no unknown amount was replaced with zero.

## Reproducible evaluator

`scripts/evaluate-personal-schema.mjs` accepts a token only on stdin, uses the explicitly injected bounded transport, selects the named synthetic demo and emits schema types/counts and validation outcomes. It never emits the token or raw payloads and is not run by CI. Use it only after separately authorizing a personal evaluation; do not pass a token as a command-line argument or store it in repository files. The script's per-phase slot is solely a technical reconciliation probe, not financial category approval.

Next evidence needed: documented/confirmed grand-total aggregation semantics for the demo and a coherent source contract for actual/rollup totals. No vendor message has been sent. Corporate access, billing, scope and host integration remain outside this evaluation.
