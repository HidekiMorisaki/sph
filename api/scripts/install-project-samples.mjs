// Original fictional examples. Called only inside the initial sample-data transaction.
const tables=new Set(['projects','project_members','project_ticket_types','project_ticket_statuses','project_type_statuses','project_tickets','project_ticket_relations','project_comments','project_checklists','project_time_entries','project_watchers','project_history','audit_logs']);
export async function installProjectSamples(client,{adminId,displayLanguage}){
 if(!['ja','en'].includes(displayLanguage))throw Error('Unsupported project sample language');
 const ja=displayLanguage==='ja',text=(j,e)=>ja?j:e;
 const insert=async(table,row)=>{if(!tables.has(table)||Object.keys(row).some(k=>!/^[a-z_]+$/.test(k)))throw Error('Invalid project sample table');const keys=Object.keys(row);return (await client.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id`,keys.map(k=>row[k]))).rows[0].id;};
 const today=(await client.query('SELECT CURRENT_DATE::text AS day')).rows[0].day;
 const day=offset=>new Date(Date.parse(today+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
 const definitions=[
  {code:'DEVELOP',name:text('社内ツール開発','Internal tool development'),label:text('開発','development'),titles:ja?['リリースを計画する','ログイン画面を設計する','ログイン画面を実装する','入力チェックの不具合を修正する','結合テストを実施する','リリース判定','開発環境を準備する','実装をレビューする','旧方式の採用を取りやめる','次期改善を検討する']:['Plan the release','Design the login screen','Implement the login screen','Fix input validation','Run integration tests','Release decision','Prepare the development environment','Review the implementation','Cancel the old approach','Plan follow-up improvements']},
  {code:'MIGRATION',name:text('環境移行','Environment migration'),label:text('移行','migration'),titles:ja?['移行を計画する','バックアップ手順を準備する','試験移行を実施する','接続の不具合を修正する','移行結果を検証する','移行完了判定','ネットワークを確認する','移行手順をレビューする','旧移行案を取りやめる','運用改善を検討する']:['Plan the migration','Prepare the backup procedure','Run a trial migration','Fix connection issues','Verify migration results','Migration completion','Check the network','Review the migration procedure','Cancel the old migration plan','Plan operational improvements']},
  {code:'WEBSITE',name:text('Webサイト改善','Website improvement'),label:text('Web改善','website'),titles:ja?['改善を計画する','トップページを設計する','トップページを実装する','モバイル表示を修正する','アクセシビリティを確認する','公開判定','掲載内容を整理する','文章をレビューする','不要ページの作成を取りやめる','次期機能を検討する']:['Plan the improvements','Design the home page','Implement the home page','Fix the mobile layout','Check accessibility','Publication decision','Organize the content','Review the copy','Cancel the obsolete page','Plan the next features']}
 ];
 // Story -> Task -> Bug provides three levels. Undated work remains visible too.
 const rows=[
  {type:2,status:1,parent:null,start:-14,end:10}, {type:0,status:3,parent:1,start:-14,end:-7},
  {type:0,status:1,parent:1,start:-6,end:1}, {type:1,status:3,parent:2,start:-13,end:-9},
  {type:0,status:0,parent:1,start:2,end:6}, {type:3,status:0,parent:1,start:7,end:7},
  {type:0,status:3,parent:null,start:-12,end:-8}, {type:0,status:2,parent:null,start:0,end:4},
  {type:1,status:4,parent:null,start:-5,end:-2}, {type:0,status:0,parent:null,start:null,end:null}
 ];
 for(const [index,definition] of definitions.entries()){
  const projectId=await insert('projects',{code:definition.code,name:definition.name,description:text('画面操作の確認用にインストーラーが登録した架空のプロジェクトです。親子チケット・状態・依存関係・日程を確認できます。','Fictional examples installed for previewing hierarchy, status, dependencies and dates.'),visibility:'internal',status:index===1?'on_hold':'active',next_ticket_number:11});
  await insert('project_members',{project_id:projectId,employee_id:adminId,role:'manager'});
  const statuses=[];
  for(const [position,names] of [['未着手','Open'],['進行中','In progress'],['レビュー中','In review'],['完了','Done'],['中止','Cancelled']].entries())statuses.push(await insert('project_ticket_statuses',{project_id:projectId,name:names[ja?0:1],category:['open','active','active','done','cancelled'][position],position}));
  const types=[];
  for(const [position,names] of [['タスク','Task'],['バグ','Bug'],['ストーリー','Story'],['マイルストーン','Milestone']].entries()){
   const typeId=await insert('project_ticket_types',{project_id:projectId,name:names[ja?0:1],position,milestone:position===3});types.push(typeId);
   for(const [position,statusId] of statuses.entries())await insert('project_type_statuses',{project_id:projectId,type_id:typeId,status_id:statusId,position,initial:position===0});
  }
  await insert('project_history',{project_id:projectId,actor_id:adminId,kind:'project.created',detail:JSON.stringify({initialData:true,name:definition.name,code:definition.code})});
  const tickets=[];
  for(const [i,row] of rows.entries()){
   const id=await insert('project_tickets',{project_id:projectId,number:i+1,title:definition.titles[i],description:text('これは操作確認用のチケットです。\n完了条件：担当内容を確認し、結果をレビューします。','This is a ticket for exploring the application.\nAcceptance: review the work and verify the result.'),type_id:types[row.type],status_id:statuses[row.status],parent_id:row.parent===null?null:tickets[row.parent-1],author_id:adminId,assignee_id:[1,2,6,7].includes(i)?adminId:null,priority:i===3?'high':i===8?'low':'normal',starts_on:row.start===null?null:day(row.start),due_on:row.end===null?null:day(row.end),estimated_minutes:[0,0,120,60,90,0,60,30,30,0][i],position:i,labels:JSON.stringify([definition.label])});
   tickets.push(id);
   await insert('project_history',{project_id:projectId,ticket_id:id,actor_id:adminId,kind:'ticket.created',detail:JSON.stringify({initialData:true,title:definition.titles[i],number:i+1})});
  }
  for(const [from,to] of [[2,3],[3,5],[5,6]])await insert('project_ticket_relations',{project_id:projectId,from_id:tickets[from-1],to_id:tickets[to-1],kind:'finish_start'});
  await insert('project_comments',{ticket_id:tickets[2],author_id:adminId,body:text('実装と日程を確認し、レビューを進めてください。','Check the implementation and dates, then continue the review.')});
  for(const [position,completed] of [true,false].entries())await insert('project_checklists',{ticket_id:tickets[2],text:position===0?text('要件を確認する','Review requirements'):text('動作を確認する','Verify behavior'),completed,position});
  await insert('project_time_entries',{ticket_id:tickets[6],employee_id:adminId,work_date:day(-8),minutes:60,note:text('準備作業を完了しました。','Preparation completed.')});
  await insert('project_watchers',{ticket_id:tickets[2],employee_id:adminId});
  await insert('audit_logs',{actor_id:adminId,action:'initial_data_import',resource:'projects',resource_id:projectId,detail:JSON.stringify({initialData:true,language:displayLanguage,code:definition.code,tickets:10})});
 }
}
