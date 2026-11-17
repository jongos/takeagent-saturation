/** Stable validation code; messages/details must not contain imported text or credentials. */
export class BudgetValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BudgetValidationError';
    this.code = code;
    this.details = Object.freeze({...details});
  }
}
export function rejectBudget(code, message, details) {
  throw new BudgetValidationError(code, message, details);
}
