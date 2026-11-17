import {createHash} from 'node:crypto';
import {BudgetValidationError} from './errors.js';
import {reconcileBudgetDocument} from './snapshot.js';

export const offlineLimits = Object.freeze({maxBytes:5 * 1024 * 1024});
const issueDefinitions = Object.freeze({
  SOURCE_SCOPE_REVIEW_REQUIRED:['The external project mapping has not been reviewed.','Resolve the authorized external workspace/project in the host and confirm this document belongs to it.'],
  PHASE_MAPPING_REVIEW_REQUIRED:['The phase mapping has not been reviewed.','Review phase meaning, period, status and currency filters before requesting a financial preview.'],
  PROJECT_CURRENCY_REQUIRED:['The authorized project currency is missing or invalid.','Resolve the intended project currency from trusted host context before review.'],
  SOURCE_SCOPE_UNSUPPORTED:['The document is filtered or has unsupported scope.','Supply a complete unfiltered budget document for the reviewed project.'],
  DOCUMENT_INVALID:['The budget document is invalid or incomplete.','Check the documented response schema; do not infer missing fields.'],
  SOURCE_BYTES_INVALID:['The source bytes are missing, invalid or exceed the limit.','Provide a UTF-8 JSON document within the supported byte limit.'],
  SOURCE_JSON_INVALID:['The source is not valid UTF-8 JSON.','Supply an unmodified JSON budget document; do not use an HTML error page or text export.'],
  PROVENANCE_INVALID:['The source provenance or dates are invalid.','Resolve workspace, project, revision, report date and import time from trusted host context.'],
  MAPPING_INVALID:['The phase mapping is missing or ambiguous.','Map each supported cost category to a distinct explicit phase.'],
  PROJECT_TOTAL_MISSING:['A mapped phase has no project grand total.','Keep the category unknown; establish a coherent source total contract before importing.'],
  PHASE_UNAVAILABLE:['A mapped phase is missing, hidden or duplicated.','Review visible stable phase IDs in the source document.'],
  AMOUNT_INVALID:['A monetary value is invalid.','Correct the source value or schema without replacing unknown amounts with zero.'],
  AMOUNT_UNSUPPORTED:['A monetary value exceeds supported precision or range.','Use a verified report profile; do not silently round or truncate.'],
  CURRENCY_MISMATCH:['Mapped monetary values use incompatible currencies.','Resolve a documented currency/FX basis before comparing or importing.'],
  LINE_TYPE_UNSUPPORTED:['The document contains an unsupported computed line type.','Validate its aggregation and overlap semantics before extending the profile.'],
  LINE_VALUE_MISSING:['A line is missing a mapped phase value.','Obtain complete values for the reviewed source scope.'],
  HIERARCHY_INVALID:['The source account hierarchy is invalid or incomplete.','Resolve missing/duplicate parents, cycles, depth or unsupported child structure.'],
  RECONCILIATION_MISMATCH:['Source account and project totals do not reconcile.','Resolve the aggregation discrepancy; do not accept a partial financial snapshot.'],
  INTERNAL_REVIEW_FAILURE:['The review could not be completed.','Investigate the adapter using sanitized diagnostics; no snapshot was accepted.']
});
export const readinessCodes = Object.freeze(Object.keys(issueDefinitions));
const fields = ['originalBudget','revisedBudget','actuals','openCommitments','estimateToComplete','estimatedFinalCost'];
function issue(code,details={}) {
  if (!Object.hasOwn(issueDefinitions,code)) code='INTERNAL_REVIEW_FAILURE';
  const [message,nextStep]=issueDefinitions[code];
  const result={code,severity:'blocking',message,nextStep};
  if (['project','account'].includes(details.scope)) result.scope=details.scope;
  if (fields.includes(details.field)) result.field=details.field;
  if (code==='PROJECT_TOTAL_MISSING'||(code==='RECONCILIATION_MISMATCH'&&details.scope==='project')) result.referenceCode='SATURATION_GRAND_TOTALS_001';
  return result;
}
function blocked(code,details) {
  return {schemaVersion:'1.0',status:code==='INTERNAL_REVIEW_FAILURE'?'failed':'blocked',reconciled:false,
    financialAcceptance:false,canApply:false,readOnly:true,preview:null,issues:[issue(code,details)]};
}

/** Context review flags must be set by an authorized host, never trusted from a browser. */
export function prepareBudgetReview(document,context) {
  try {
    if (!context||context.sourceScopeReviewed!==true) return blocked('SOURCE_SCOPE_REVIEW_REQUIRED');
    if (context.phaseMappingReviewed!==true) return blocked('PHASE_MAPPING_REVIEW_REQUIRED');
    if (typeof context.expectedCurrency!=='string'||!/^[A-Z]{3}$/.test(context.expectedCurrency)) return blocked('PROJECT_CURRENCY_REQUIRED');
    const preview=reconcileBudgetDocument(document,context);
    if (Object.values(preview.snapshot.costs).some(value=>value&&value.currency!==context.expectedCurrency)) return blocked('CURRENCY_MISMATCH');
    const warnings=[];
    if (preview.stale) warnings.push({code:'STALE_SOURCE',severity:'warning',message:'The source is older than the configured freshness window.'});
    if (preview.missingFields.length) warnings.push({code:'MISSING_COST_CATEGORIES',severity:'warning',message:'Unmapped cost categories remain unknown.',fields:[...preview.missingFields]});
    return {schemaVersion:'1.0',status:'ready-for-review',reconciled:true,financialAcceptance:false,canApply:false,readOnly:true,preview,issues:warnings};
  } catch(error) {
    return error instanceof BudgetValidationError&&readinessCodes.includes(error.code) ? blocked(error.code,error.details) : blocked('INTERNAL_REVIEW_FAILURE');
  }
}

/** Bounded offline entry. The document itself does not prove external project ownership. */
export function reviewBudgetDocumentBytes(bytes,context) {
  if (!(bytes instanceof Uint8Array)||bytes.byteLength===0||bytes.byteLength>offlineLimits.maxBytes) return blocked('SOURCE_BYTES_INVALID');
  let document;
  try { document=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
  catch { return blocked('SOURCE_JSON_INVALID'); }
  const result=prepareBudgetReview(document,context);
  return {...result,source:{format:'json',bytes:bytes.byteLength,sha256:createHash('sha256').update(bytes).digest('hex'),projectIdentityBasis:'host-reviewed-mapping',vendorProjectOwnershipVerified:false}};
}
