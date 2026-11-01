import type {Definition,Values,WorkflowRoute,Directory,FieldType} from './workflow-form';
export const choose=(ja:boolean,a:string,b:string)=>ja?a:b;
export const partNames:Record<FieldType,[string,string]>={
 text:['1行入力','Single line'],textarea:['複数行入力','Paragraph'],integer:['整数','Integer'],decimal:['小数','Decimal'],money:['金額','Money'],percent:['割合','Percentage'],date:['日付','Date'],dateRange:['日付範囲','Date range'],time:['時刻','Time'],timeRange:['時刻範囲','Time range'],datetime:['日時','Date and time'],datetimeRange:['日時範囲','Date/time range'],select:['プルダウン','Dropdown'],radio:['ラジオボタン','Radio buttons'],multiSelect:['複数選択','Multiple choice'],checkbox:['チェックボックス','Checkbox'],boolean:['はい／いいえ','Yes / No'],email:['メールアドレス','Email'],phone:['電話番号','Phone'],url:['URL','URL'],employee:['従業員選択','Employee'],branch:['拠点選択','Branch'],department:['部門選択','Department'],applicant:['申請者情報','Applicant'],attachment:['画像・PDF添付','Images / PDF'],image:['画像添付','Images'],calculated:['計算','Calculation'],heading:['見出し','Heading'],description:['説明文','Description'],divider:['区切り線','Divider'],group:['グループ','Group'],repeat:['繰り返しグループ','Repeatable group'],table:['明細表','Line items'],page:['ページ区切り','Page']
};
export function stateName(code:string,ja:boolean){
 const labels:Record<string,[string,string]>={draft:['下書き','Draft'],pending:['承認待ち','Pending'],waiting:['未到達','Waiting'],approved:['承認済み','Approved'],returned:['差戻し','Returned'],rejected:['却下','Rejected'],cancelled:['取下げ','Withdrawn'],stopped:['停止','Stopped'],submitted:['提出','Submitted'],comment:['コメント','Comment'],reassigned:['後任指定','Reassigned'],payment:['受渡し記録','Transfer recorded'],received:['受領確認','Receipt confirmed'],confirmed:['受領確認済み','Confirmed'],void:['取消','Cancelled'],payment_cancelled:['受渡し記録の取消','Transfer cancelled'],payment_correction:['受渡し記録の訂正','Transfer correction']};
 return labels[code]?.[ja?0:1]??code;
}
const messages:Record<string,[string,string]>={
 NOT_DRAFT:['一度も提出していない下書きだけ削除できます。','Only drafts that have never been submitted can be deleted.'],
 CONFLICT:['他の操作で更新されました。再読み込みしてやり直してください。','This item changed. Reload before trying again.'],
 FORM_INVALID:['入力内容を確認してください。','Please check the form.'],
 INVALID_TEXT:['入力内容または理由を確認してください。','Check the text or required reason.'],
 EMPTY_ROUTE:['承認者を設定してください。','Configure an approval route.'],
 SELF_APPROVAL_OR_EMPTY_ROUTE:['自己承認はできません。管理者に別の承認経路を依頼してください。','Self approval is not allowed. Ask an administrator for another route.'],
 APPROVER_UNAVAILABLE:['承認できない担当者が含まれています。','An approver is unavailable.'],
 CIRCULAR_REFERENCE:['条件・計算の参照が循環しています。','Conditions or calculations contain a cycle.'],
 INVALID_REFERENCE:['参照項目の型・繰り返し範囲を確認してください。','Check the referenced field type and repeated-row scope.'],
 INVALID_CALCULATION:['計算方法・参照項目・小数桁を確認してください。','Check the calculation, referenced fields and decimal places.'],
 INVALID_REPEAT:['繰り返しの入れ子と最小・最大件数を確認してください。','Check nested repeating groups and minimum/maximum item counts.'],
 INVALID_CHILDREN:['部品の階層を確認してください。ページはフォーム直下に配置します。','Check the component hierarchy. Place pages at the form root.'],
 INVALID_OPTION:['現在選択できる項目を選び直してください。','Choose a currently available option.'],
 APPROVER_STILL_AVAILABLE:['現在の担当者は承認可能です。後任の指定は承認できない担当者に限ります。','The current assignee can still approve. Replace only an unavailable approver.'],
 INVALID_ATTACHMENT:['添付ファイルの形式・内容を確認してください。','Check the attachment format and contents.'],
 ATTACHMENT_LIMIT:['添付は1件10MiB、20件・合計50MiBまでです。','Attachments: 10 MiB each, 20 files / 50 MiB total.'],
 NOT_FOUND:['対象が見つからないか、閲覧権限がありません。','This item is unavailable or you cannot view it.'],
 PERMISSION_REQUIRED:['この操作の権限がありません。','You do not have permission for this action.'],
 REQUIRED:['必須項目です。','This field is required.']
};
export function workflowError(code:string,ja:boolean){return messages[code]?.[ja?0:1]??choose(ja,'入力内容・権限・現在の状態を確認してください。','Check the input, permissions and current status.');}
export class WorkflowError extends Error {constructor(public code:string,public details:{field?:string;reason:string}[]=[]){super(code);}}
export async function workflowApi<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetch(path,{method,headers:body instanceof FormData?{}:{'content-type':'application/json'},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});
 const result=await response.json();
 if(!response.ok)throw new WorkflowError(result.error?.code??'FAILED',result.error?.details??[]);
 return result.data as T;
}
export type Attachment={attachmentKey:string;name:string;mime:string;size:number;deletedAt?:string|null};
export type Template={id:number;templateKey:string;name:string;description:string;definition:Definition;route:WorkflowRoute;revision:number;active:boolean;versionId?:number};
export type Action={id:number;actionKey:string;actorName:string;attempt:number;position:number;type:string;message:string;createdAt:string;detail:Record<string,unknown>};
export type RequestDetail={id:number;requestKey:string;applicantId:number;title:string;currency:string;values:Values;status:string;revision:number;attempt:number;currentStep:number;isApplicant:boolean;canManage:boolean;templateVersion:{name:string;definition:Definition;route:WorkflowRoute};steps:{id:number;attempt:number;position:number;employeeId:number;employeeName:string;status:string}[];actions:Action[];submissions:{id:number;attempt:number;snapshot:{definition:Definition;values:Values;currency:string;title:string;directory?:Directory;applicant?:{id:number;name:string}}}[];attachments:Attachment[]};
export type ListItem={revision:number;canDelete:boolean;requestKey:string;title:string;status:string;applicant:string;templateVersion:{name:string};updatedAt:string;steps:{employeeName:string}[]};
export const emptyDirectory:Directory={employees:[],branches:[],departments:[]};
