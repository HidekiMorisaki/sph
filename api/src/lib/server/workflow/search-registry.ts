import type {SearchContext,SearchField} from '../api/search-registry';

const currentName="concat_ws(' ',person.last_name,NULLIF(person.middle_name,''),person.first_name)";
const nameRows=(recorded:string)=>`CROSS JOIN LATERAL (SELECT ${recorded} AS person_name UNION SELECT ${currentName} AS person_name) names`;
// All relation predicates are correlated with the visible request. Old assignees
// come from immutable submitted routes; current steps include replacements.
export function workflowPeople(role:'approver'|'finalApprover'|'currentAssignee'):string {
 const final=role==='finalApprover';
 const last="step.position=(SELECT max(last_step.position) FROM workflow_steps last_step WHERE last_step.request_id=workflow.id AND last_step.attempt=step.attempt AND last_step.deleted_at IS NULL)";
 const current=role==='currentAssignee';
 const steps=`SELECT step.employee_id, names.person_name FROM workflow_steps step JOIN employees person ON person.id=step.employee_id ${nameRows('step.employee_name')} WHERE step.request_id=workflow.id AND step.deleted_at IS NULL AND ${current?"step.attempt=workflow.attempt AND workflow.status='pending' AND step.position=workflow.current_step AND step.status='pending'":`(search_options.include_history OR step.attempt=workflow.attempt)${final?' AND '+last:''}`}`;
 if(current)return steps;
 const drafts=`SELECT (entry.value->>'employeeId')::integer AS employee_id,names.person_name FROM jsonb_array_elements(version.route) WITH ORDINALITY entry(value,position) JOIN employees person ON person.id=(entry.value->>'employeeId')::integer ${nameRows("entry.value->>'name'")} WHERE workflow.attempt=0${final?' AND entry.position=jsonb_array_length(version.route)':''}`;
 const history=`SELECT (entry.value->>'employeeId')::integer AS employee_id,names.person_name FROM workflow_submissions submission CROSS JOIN LATERAL jsonb_array_elements(submission.snapshot->'route') WITH ORDINALITY entry(value,position) JOIN employees person ON person.id=(entry.value->>'employeeId')::integer ${nameRows("entry.value->>'name'")} WHERE search_options.include_history AND submission.request_id=workflow.id AND submission.deleted_at IS NULL${final?" AND entry.position=jsonb_array_length(submission.snapshot->'route')":''}`;
 return `${steps} UNION ALL ${drafts} UNION ALL ${history}`;
}
function field(code:string,ja:string,en:string,type:SearchField['type'],expression:string,choices?:string[]):SearchField{
 return {code,label:{ja,en},type,maxLength:160,expression,source:'WorkflowRequest.'+code,...(choices?{choices}:{})};
}
const applicantName=`concat_ws(' ',applicant.last_name,NULLIF(applicant.middle_name,''),applicant.first_name,(SELECT string_agg(submission.snapshot->'applicant'->>'name',' ') FROM workflow_submissions submission WHERE submission.request_id=workflow.id AND submission.deleted_at IS NULL AND (search_options.include_history OR submission.attempt=workflow.attempt)))`;
export const workflowSearchContexts:SearchContext[]=[{
 code:'workflow',label:{ja:'申請',en:'Request'},category:'basic',from:'',link:'',fields:[
  field('title','件名','Title','string','workflow.title'),
  field('templateName','テンプレート名','Template name','string','version.name'),
  field('status','状態','Status','choice','workflow.status',['draft','pending','returned','approved','rejected','cancelled']),
  field('applicantName','申請者名','Applicant name','string',"concat_ws(' ',applicant.last_name,NULLIF(applicant.middle_name,''),applicant.first_name)"),
  {...field('applicantSelection','申請者','Applicant','choice','workflow.applicant_id::text'),reference:{table:'workflow_applicant',key:'id',name:'label'}},
  {...field('templateSelection','テンプレート','Template','choice','version.template_id::text'),reference:{table:'workflow_template',key:'id',name:'label'}},
  field('createdAt','作成日時','Created','datetime','workflow.created_at'),field('updatedAt','更新日時','Updated','datetime','workflow.updated_at')
 ]
},...(['approver','finalApprover','currentAssignee'] as const).map(role=>({
 code:role,label:role==='approver'?{ja:'承認者',en:'Approver'}:role==='finalApprover'?{ja:'最終承認者',en:'Final approver'}:{ja:'現在の担当者',en:'Current assignee'},category:'participants',
 from:`LATERAL (${workflowPeople(role)}) participant`,link:'true',fields:[
  field('name','名前','Name','string','participant.person_name'),
  {...field('selection','ユーザー選択','Select users','choice','participant.employee_id::text'),reference:{table:'workflow_'+role,key:'id',name:'label'}}
 ]
}))];

export const workflowApplicantExpression=applicantName;
