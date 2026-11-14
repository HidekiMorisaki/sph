// Original fictional management data, installed in the optional-data transaction.
export async function installManagementSamples(db,{adminId,displayLanguage,projectId,tickets,definition,index,today}){
 const camel=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase()),value]));
 const text=(j,e)=>displayLanguage==='ja'?j:e;
 const insert=async(table,row)=>{const keys=Object.keys(row);return (await db.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,keys.map(k=>row[k]))).rows[0];};
 const date=new Date(today+'T00:00:00Z');
 const month=offset=>new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+offset,1)).toISOString().slice(0,10);
 const months=[month(-3),month(-2),month(-1)],currency=displayLanguage==='ja'?'JPY':'USD',digits=currency==='JPY'?0:2,rate=currency==='JPY'?5000:50,budget=currency==='JPY'?300000:3000;
 const stamp=m=>m.slice(0,7);
 await insert('project_evm_settings',{project_id:projectId,enabled:true,start_month:months[0],currency});
 const costRate=await insert('project_cost_rates',{project_id:projectId,starts_on:months[0],hourly_rate:rate});
 const scope=(await db.query('SELECT id,parent_id AS "parentId" FROM project_tickets WHERE project_id=$1 ORDER BY id',[projectId])).rows;
 const baseline=await insert('project_baselines',{project_id:projectId,version:1,title:text('業務改善の基準計画','Operational improvement baseline'),reason:text('対象作業と月別予算を確認','Scope and monthly budget reviewed'),state:'confirmed',confirmed_at:months[0]+'T03:00:00Z',author_id:adminId,scope_snapshot:JSON.stringify({tickets:scope})});
 const roots=[0,6,7,8,9],parents=new Map(scope.map(t=>[t.id,t.parentId]));
 const belongs=(id,root)=>{for(let current=id;current!=null;current=parents.get(current))if(current===root)return true;return false;};
 for(const root of roots){const item=await insert('project_baseline_items',{baseline_id:baseline.id,ticket_id:tickets[root],title:definition.titles[root],budget});for(const m of months)await insert('project_baseline_months',{item_id:item.id,month:m,amount:budget/3});}
 for(const [i,m] of months.entries()){
  await insert('project_time_entries',{ticket_id:tickets[2],employee_id:adminId,work_date:m.slice(0,8)+'10',minutes:[360,480,600][i]+index*120,note:text('月次の開発・検証作業','Monthly development and verification work')});
  await insert('project_expenses',{project_id:projectId,code:definition.code+'-'+stamp(m),ticket_id:tickets[0],incurred_on:m.slice(0,8)+'15',amount:rate*(i+1),category:text('検証環境','Verification environment'),evidence:text('月次の利用明細を確認','Monthly usage statement reviewed'),author_id:adminId});
  const rows=[],evidence=[];
  for(const root of roots){
   const progress=await insert('project_progress_records',{project_id:projectId,ticket_id:tickets[root],month:m,version:1,percent:[25,55,85][i]-index*5,evidence:text('受入済み成果物を基に累積進捗を確認','Cumulative progress assessed from accepted deliverables'),author_id:adminId});
   const descendants=scope.filter(t=>belongs(t.id,tickets[root])).map(t=>t.id),end=month(i-2);
   const time=(await db.query('SELECT id,ticket_id AS "ticketId",updated_at AS "updatedAt",minutes,work_date AS "workDate",round(minutes*$3::numeric/60,$4) AS amount FROM project_time_entries WHERE ticket_id=ANY($1::int[]) AND work_date >= $2::date AND work_date < $5::date AND deleted_at IS NULL',[descendants,months[0],rate,digits,end])).rows;
   const expenses=(await db.query('SELECT * FROM project_expenses WHERE ticket_id=ANY($1::int[]) AND incurred_on >= $2::date AND incurred_on < $3::date AND deleted_at IS NULL',[descendants,months[0],end])).rows.map(camel);
   const actual=(await db.query('SELECT COALESCE(sum(value::numeric),0)::text value FROM unnest($1::text[]) value',[[...time,...expenses].map(t=>String(t.amount))])).rows[0].value;
   rows.push({ticketId:tickets[root],title:definition.titles[root],budget:String(budget),planned:String(budget/3*(i+1)),progress:String(progress.percent),actual,progressRecord:camel(progress)});
   evidence.push(...time.map(t=>({...t,source:'time',minutes:String(t.minutes),rateId:costRate.id,rate:String(rate),amount:String(t.amount),work:tickets[root]})),...expenses.map(e=>({...e,source:'expense',amount:String(e.amount),work:tickets[root]})));
  }
  const result=(await db.query(`WITH sums AS (SELECT sum((r->>'budget')::numeric) bac,sum((r->>'planned')::numeric) pv,sum((r->>'budget')::numeric*(r->>'progress')::numeric/100) ev,sum((r->>'actual')::numeric) ac FROM jsonb_array_elements($1::jsonb) r),ratios AS (SELECT *,ev/nullif(ac,0) cpi,ev/nullif(pv,0) spi FROM sums) SELECT bac::text,pv::text,round(ev,$2)::text ev,ac::text,(ev-ac)::text cv,(ev-pv)::text sv,round(cpi,6)::text cpi,round(spi,6)::text spi,round(bac/nullif(cpi,0),$2)::text eac,round(bac-bac/nullif(cpi,0),$2)::text vac FROM ratios`,[JSON.stringify(rows),digits])).rows[0];
  const snapshot={baselineId:baseline.id,baselineVersion:1,month:stamp(m),currency,rows,evidence,unresolved:[],totals:{currency,...result}};
  await insert('project_evm_reports',{project_id:projectId,baseline_id:baseline.id,month:m,version:1,stale:false,snapshot:JSON.stringify(snapshot),author_id:adminId});
 }
}
