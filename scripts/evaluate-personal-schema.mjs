// Explicit opt-in personal developer evaluation. Token enters via stdin only.
// Prints schema observations only; never vendor records, identifiers or credentials.
import {createReadClient} from '../src/client.js';
import {createBoundedTransport} from '../src/transport.js';
import {reconcileBudgetDocument} from '../src/snapshot.js';
import {majorUnits} from '../src/money.js';
const summary={mode:'personal-developer-schema-evaluation',readOnly:true,requests:[]};
let token=''; let client;
const schema = value => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).map(([key,item])=>[key,Array.isArray(item)?'array':item===null?'null':typeof item])) : typeof value;
try {
  for await (const chunk of process.stdin) { token+=chunk.toString(); if(token.length>16384) throw new Error('Invalid stdin'); }
  token=token.trim(); if(!token) throw new Error('Missing stdin token');
  const transport=createBoundedTransport(async(url,options)=>{
    const response=await fetch(url,options);
    const path=new URL(url).pathname.replace(/\/projects\/[^/]+/,'/projects/{id}');
    summary.requests.push({path,status:response.status});
    return response;
  },{maxBytes:5*1024*1024,timeoutMs:10000});
  const get=async path=>{
    const response=await transport(`https://next-api.saturation.io/v1${path}`,{method:'GET',headers:{Authorization:`Bearer ${token}`}});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };
  const me=await get('/me'); summary.identitySchema=schema(me);
  summary.workspaceCount=Array.isArray(me.workspaces)?me.workspaces.length:null;
  if(summary.workspaceCount!==1) throw new Error('Expected one evaluation workspace');
  const projects=await get('/projects?limit=100'); summary.projectPageSchema=schema(projects);
  if(!Array.isArray(projects.data) || projects.nextCursor) throw new Error('Unexpected project page');
  summary.projectCount=projects.data.length; summary.projectSchema=schema(projects.data[0]);
  const selected=projects.data.filter(project=>project.name==='Production Demo');
  summary.demoMatchCount=selected.length;
  if(selected.length!==1) throw new Error('Expected one named synthetic demo');
  client=createReadClient({token,workspaceId:me.workspaces[0].workspaceId,projectId:selected[0].id,transport,pageSize:10});
  const document=await client.budgetDocument(); const totals=await client.budgetTotals();
  summary.budgetSchema=schema(document); summary.totalsSchema=schema(totals);
  summary.selectionSchema=schema(document.selection); summary.budgetLineCount=document.lines?.length;
  summary.lineSchema=schema(document.lines?.[0]); summary.phaseSchema=schema(document.phases?.[0]);
  summary.phaseValueSchema=schema(Object.values(document.totals??{})[0]);
  summary.lineTypes=[...new Set(document.lines?.map(row=>row.type))].filter(type=>['account','line','credit','fringe','subtotal','banner','markup'].includes(type));
  summary.phaseTypes=[...new Set(document.phases?.map(phase=>phase.type))].filter(type=>['estimate','actual','committed','rollup'].includes(type));
  summary.selectionEmpty=Object.keys(document.selection??{}).length===0;
  summary.rootParentNullCount=document.lines?.filter(row=>row.parentId===null).length;
  summary.invalidIdentifierCount=document.lines?.filter(row=>!/^[A-Za-z0-9_-]{1,128}$/.test(row.id)).length;
  summary.nonFiniteAmountCount=document.lines?.flatMap(row=>Object.values(row.values??{})).filter(value=>!Number.isFinite(value.amount)).length;
  summary.highPrecisionAmountCount=document.lines?.flatMap(row=>Object.values(row.values??{})).filter(value=>!/^(-?)(\d+)(?:\.(\d{1,4}))?$/.test(String(value.amount))).length;
  const estimates=document.phases?.filter(phase=>phase.type==='estimate'&&!phase.isHidden);
  summary.visibleEstimatePhaseCount=estimates?.length;
  summary.documentAndTotalsAmountsAgree=Object.entries(document.totals??{}).every(([phase,value])=>totals.totals?.[phase]?.amount===value.amount&&totals.totals?.[phase]?.currency===value.currency);
  summary.phaseReconciliation=[];
  for(const phase of document.phases.filter(phase=>!phase.isHidden)) {
    const observation={ordinal:summary.phaseReconciliation.length+1,type:['estimate','actual','committed','rollup'].includes(phase.type)?phase.type:'other'};
    const phaseValues=document.lines.map(row=>row.values?.[phase.id]);
    observation.missingPhaseValueCount=phaseValues.filter(value=>!value).length;
    observation.missingCurrencyCount=phaseValues.filter(value=>value&&!value.currency).length;
    observation.currencyMismatchCount=document.totals[phase.id]?phaseValues.filter(value=>value&&value.currency!==document.totals[phase.id].currency).length:null;
    observation.totalPresent=Object.hasOwn(document.totals,phase.id);
    observation.totalValueSchema=schema(document.totals[phase.id]);
    const groups=new Map();
    for(const row of document.lines) { const group=groups.get(row.parentId)??[]; group.push(row); groups.set(row.parentId,group); }
    const toUnits=value=>{ try { return majorUnits(value); } catch { return null; } };
    observation.arithmeticDiagnostics={mismatchedGroups:0,rootMismatch:false,parentMismatchCount:0,differenceEqualsParentFringe:0,differenceEqualsParentBase:0,parentHasEditablePhaseData:0};
    for(const [parentId,rows] of groups) {
      const parent=parentId===null?null:document.lines.find(row=>row.id===parentId);
      const expected=(parent?parent.values:document.totals)?.[phase.id];
      if(!expected||rows.some(row=>!row.values?.[phase.id])) continue;
      const parts=rows.map(row=>toUnits(row.values[phase.id].amount)); const amount=toUnits(expected.amount);
      if(amount===null||parts.includes(null))continue;
      const delta=amount-parts.reduce((a,b)=>a+b,0n);
      if(delta!==0n){
        observation.arithmeticDiagnostics.mismatchedGroups++;
        if(parentId===null)observation.arithmeticDiagnostics.rootMismatch=true;else observation.arithmeticDiagnostics.parentMismatchCount++;
        if(delta===toUnits(expected.fringe))observation.arithmeticDiagnostics.differenceEqualsParentFringe++;
        if(delta===toUnits(expected.base))observation.arithmeticDiagnostics.differenceEqualsParentBase++;
        if(parent?.phaseData?.[phase.id]&&Object.keys(parent.phaseData[phase.id]).length)observation.arithmeticDiagnostics.parentHasEditablePhaseData++;
        if(parentId===null){
          observation.arithmeticDiagnostics.oneRootExclusionWouldMatch=parts.some(part=>delta===-part);
          observation.arithmeticDiagnostics.oneRootAdditionWouldMatch=parts.some(part=>delta===part);
          observation.arithmeticDiagnostics.rootBaseTotalsAgree=toUnits(expected.base)===rows.reduce((sum,row)=>sum+toUnits(row.values[phase.id].base),0n);
          observation.arithmeticDiagnostics.rootFringeTotalsAgree=toUnits(expected.fringe)===rows.reduce((sum,row)=>sum+toUnits(row.values[phase.id].fringe),0n);
        }
      }
    }
    try {
      const now=new Date();
      // Neutral technical slot only. This does not approve a financial category mapping.
      const result=reconcileBudgetDocument(document,{workspaceId:me.workspaces[0].workspaceId,projectId:selected[0].id,revision:'personal-evaluation',phaseMap:{originalBudget:phase.id},now,importedAt:now.toISOString()});
      Object.assign(observation,{status:result.reconciliation.status,accountCount:result.snapshot.accounts.length,scope:'Single phase arithmetic/schema test only; not a financial category mapping'});
    } catch(error) {
      const known=['Unsupported computed line type','Unsupported amount precision','A full unfiltered budget document is required','Invalid or duplicate phase','Mapped phase is missing or hidden','Invalid parent ID','Inconsistent hierarchy depth','Missing parent','Reconciliation mismatch','Invalid import timestamp','Missing phase value or currency mismatch','Ambiguous phase mapping','Mapped phase has no project total'];
      Object.assign(observation,{status:'rejected',reason:known.find(message=>error.message.startsWith(message))??'Other validation rejection'});
    }
    if(!observation.totalPresent){
      const selectedTotals=await get(`/projects/${selected[0].id}/budget/totals?phase=${encodeURIComponent(phase.id)}`);
      observation.phaseFilteredTotalPresent=Object.hasOwn(selectedTotals.totals??{},phase.id);
      observation.phaseFilteredResponseSchema=schema(selectedTotals);
      const selectedDocument=await get(`/projects/${selected[0].id}/budget?phase=${encodeURIComponent(phase.id)}`);
      observation.phaseFilteredDocument={lineCount:selectedDocument.lines?.length,selectionSchema:schema(selectedDocument.selection),selectionMatchesRequestedId:selectedDocument.selection?.phase===phase.id,onlyRequestedPhase:selectedDocument.phases?.length===1&&selectedDocument.phases[0].id===phase.id,totalPresent:Object.hasOwn(selectedDocument.totals??{},phase.id)};
      const selectedValue=selectedDocument.totals?.[phase.id];
      if(selectedValue&&selectedDocument.lines?.every(row=>Number.isFinite(row.values?.[phase.id]?.amount))) {
        observation.phaseFilteredDocument.rootSumMatchesTotal=toUnits(selectedValue.amount)===selectedDocument.lines.filter(row=>row.parentId===null).reduce((sum,row)=>sum+toUnits(row.values[phase.id].amount),0n);
      }
    }
    summary.phaseReconciliation.push(observation);
  }
  try { const rows=await client.transactions(); summary.transactions={status:'accepted',count:rows.length}; }
  catch(error) { summary.transactions={status:'rejected',reason:/HTTP \d{3}/.exec(error.message)?.[0]??'Adapter validation or transport failure'}; }
  summary.fullBudgetImportCompatible=summary.phaseReconciliation.length>0&&summary.phaseReconciliation.every(phase=>phase.status==='reconciled');
  summary.productionLiveEnabled=false; summary.commercialEntitlementVerified=false;
  summary.completed=true;
} catch(error) {
  const safe=['Invalid stdin','Missing stdin token','Expected one evaluation workspace','Unexpected project page','Expected one named synthetic demo','Invalid identifier','Transport failure'];
  summary.completed=false; summary.failure=safe.includes(error.message)?error.message:/HTTP \d{3}/.exec(error.message)?.[0]??'Evaluation failed; raw error withheld';
  process.exitCode=1;
} finally {
  client?.disconnect(); token=''; console.log(JSON.stringify(summary,null,2));
}
