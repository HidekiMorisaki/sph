import type { SearchContext } from '$lib/server/api/search-registry';
export const projectSearchContexts:SearchContext[]=[{
 code:'project',label:{ja:'プロジェクト',en:'Project'},category:'basic',from:'',link:'',
 fields:[
  ['code','コード','Code','string','code'],['name','名称','Name','string','name'],['description','説明','Description','string','description'],
  ['visibility','公開範囲','Visibility','choice','visibility'],['status','状態','Status','choice','status'],['createdAt','作成日時','Created at','datetime','created_at'],['updatedAt','更新日時','Updated at','datetime','updated_at']
 ].map(([code,ja,en,type,column])=>({code,label:{ja,en},type:type as 'string'|'choice'|'datetime',maxLength:5000,expression:'p.'+column,source:'Project.'+code,...(code==='visibility'?{choices:['private','internal']}:code==='status'?{choices:['active','on_hold','completed','archived']}:{})}))
}];
