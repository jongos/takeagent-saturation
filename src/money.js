import {rejectBudget} from './errors.js';
/** Exact major-unit comparisons; unsupported precision is rejected, never rounded. */
export function majorUnits(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) rejectBudget('AMOUNT_INVALID','Invalid monetary amount');
  const match = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(String(value));
  if (!match) rejectBudget('AMOUNT_UNSUPPORTED','Unsupported amount precision (maximum four decimals)');
  const scaled = BigInt(match[2]) * 10000n + BigInt((match[3] ?? '').padEnd(4,'0'));
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) rejectBudget('AMOUNT_UNSUPPORTED','Amount exceeds supported range');
  return match[1] ? -scaled : scaled;
}
