import { Lexer, type Token, type Tokens } from 'marked';
import { Prisma } from '$lib/server/generated/prisma/client';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import { requireOperationApi, writeAuditLog } from '$lib/server/api/admin';
import { success, throwApiError } from '$lib/server/api/response';
import { getPrisma } from '$lib/server/prisma';
import { attachmentType } from '$lib/server/workflow/attachment';
import { access } from './service';
import { parseTicketCode,projectCodePattern } from './codes';

type Tx=Prisma.TransactionClient;
export type MarkdownTarget={targetType:'project'|'ticket'|'comment';projectId:number|null;ticketId:number|null;commentId:number|null};
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
function fail(code='INVALID_MARKDOWN_IMAGE',status=422):never{return throwApiError(status,code,'The Markdown image is unavailable or the image limit was exceeded.');}
function missing():never{return fail('NOT_FOUND',404);}
const imageSelect={id:true,recordKey:true,uploaderId:true,targetType:true,projectId:true,ticketId:true,commentId:true,bound:true,size:true} as const;

export function markdownImageKeys(source:string):string[]{
 const keys=new Set<string>();let count=0;
 function walk(tokens:Token[],depth=0){
  if(depth>48||count>10000)fail('MARKDOWN_TOO_COMPLEX');
  for(const token of tokens){
   if(++count>10000)fail('MARKDOWN_TOO_COMPLEX');
   if(token.type==='image'){
    const href=(token as Tokens.Image).href;
    if(href.startsWith('sph-image:')){const key=href.slice(10);if(!uuid.test(key))fail();keys.add(key);}
   }else if(token.type==='list')for(const item of (token as Tokens.List).items)walk(item.tokens,depth+1);
   else if(token.type==='table'){const table=token as Tokens.Table;for(const cell of [...table.header,...table.rows.flat()])walk(cell.tokens,depth+1);}
   else if(['paragraph','heading','blockquote','strong','em','del','link','text'].includes(token.type)&&'tokens' in token&&token.tokens)walk(token.tokens,depth+1);
  }
 }
 if(source.length>20000)fail('INVALID_TEXT');
 try{walk(Lexer.lex(source,{gfm:true}));}catch(error){if(error&&typeof error==='object'&&'status' in error)throw error;fail('MARKDOWN_TOO_COMPLEX');}
 if(keys.size>20)fail('MARKDOWN_IMAGE_LIMIT');return [...keys];
}

export async function bindMarkdownImages(tx:Tx,actor:AuthenticatedUser,source:string,target:MarkdownTarget){
 const keys=markdownImageKeys(source);if(!keys.length)return;
 await tx.$queryRaw(Prisma.sql`SELECT id FROM project_markdown_images WHERE record_key IN (${Prisma.join(keys.map(key=>Prisma.sql`${key}::uuid`))}) ORDER BY id FOR UPDATE`);
 const images=await tx.projectMarkdownImage.findMany({where:{recordKey:{in:keys},deletedAt:null},select:imageSelect});
 if(images.length!==keys.length||images.reduce((total,image)=>total+image.size,0)>50*1024*1024)fail('MARKDOWN_IMAGE_LIMIT');
 for(const image of images){
  if(image.targetType!==target.targetType)fail();
  if(image.bound){if(image.projectId!==target.projectId||image.ticketId!==target.ticketId||image.commentId!==target.commentId)fail();}
  else {
   requireOperationApi(actor,'projects.images.create');
   if(image.uploaderId!==actor.id||image.projectId!==null&&image.projectId!==target.projectId||image.ticketId!==null&&image.ticketId!==target.ticketId||image.commentId!==null&&image.commentId!==target.commentId)fail();
   await tx.projectMarkdownImage.update({where:{id:image.id},data:{...target,bound:true}});
  }
 }
}

async function writable(tx:Tx,actor:AuthenticatedUser,target:MarkdownTarget){
 if(target.projectId===null){if(target.targetType!=='project')fail();requireOperationApi(actor,'projects.create');return;}
 const {p,role}=await access(tx,actor,target.projectId,true,target.targetType==='project');
 if(p.status==='archived')fail('PROJECT_ARCHIVED',409);
 requireOperationApi(actor,target.targetType==='project'?'projects.update':target.targetType==='ticket'?(target.ticketId?'projects.tickets.update':'projects.tickets.create'):'projects.comments.manage');
 if(target.ticketId!==null&&!await tx.projectTicket.findFirst({where:{id:target.ticketId,projectId:target.projectId,deletedAt:null},select:{id:true}}))missing();
 if(target.commentId!==null){
  const comment=await tx.projectComment.findFirst({where:{id:target.commentId,ticketId:target.ticketId!,deletedAt:null},select:{authorId:true}});
  if(!comment)missing();if(comment.authorId!==actor.id&&role!=='manager')fail('COMMENT_OWNER_REQUIRED',403);
 }
}

async function queryTarget(tx:Tx,url:URL):Promise<MarkdownTarget>{
 if([...url.searchParams.keys()].some(key=>!['target','project','ticket','comment'].includes(key))||[...url.searchParams.keys()].some(key=>url.searchParams.getAll(key).length!==1))fail();
 const targetType=url.searchParams.get('target');if(!['project','ticket','comment'].includes(targetType??''))fail();
 const code=url.searchParams.get('project'),ticketCode=url.searchParams.get('ticket'),comment=url.searchParams.get('comment');
 if(code!==null&&!projectCodePattern.test(code))fail();
 const project=code?await tx.project.findFirst({where:{code,deletedAt:null},select:{id:true}}):null;
 if(code&&!project)missing();
 const ref=ticketCode?parseTicketCode(ticketCode):null;
 if(ticketCode&&(!ref||ref.projectCode!==code))fail();
 const ticket=ref&&project?await tx.projectTicket.findFirst({where:{projectId:project.id,number:ref.number,deletedAt:null},select:{id:true}}):null;
 if(ticketCode&&!ticket)missing();
 if(comment!==null&&(!/^[1-9]\d{0,9}$/.test(comment)||Number(comment)>2147483647))fail();
 if(targetType==='project'&&(ticketCode||comment)||targetType==='ticket'&&(!project||comment)||targetType==='comment'&&(!project||!ticket))fail();
 return {targetType:targetType as MarkdownTarget['targetType'],projectId:project?.id??null,ticketId:ticket?.id??null,commentId:comment?Number(comment):null};
}

export async function uploadMarkdownImage(user:AuthenticatedUser|null,request:Request,url:URL){
 const actor=requireOperationApi(user,'projects.images.create');requireOperationApi(actor,'projects.read');
 const target=await getPrisma().$transaction(async tx=>{const t=await queryTarget(tx,url);await writable(tx,actor,t);return t;});
 const reader=request.body?.getReader();if(!reader)fail();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>11*1024*1024){await reader.cancel();fail('MARKDOWN_IMAGE_LIMIT',413);}chunks.push(r.value);}}finally{reader.releaseLock();}
 const form=await new Response(new Uint8Array(Buffer.concat(chunks)),{headers:{'content-type':request.headers.get('content-type')??''}}).formData().catch(()=>fail());
 const file=form.get('file');if(!(file instanceof File)||[...form.keys()].some(key=>key!=='file')||!file.name||file.name.length>255||file.size>10*1024*1024)fail();
 const content=Buffer.from(await file.arrayBuffer()),mime=attachmentType(content);
 if(!mime||!['image/png','image/jpeg','image/webp'].includes(mime))fail();
 return getPrisma().$transaction(async tx=>{
  if(target.projectId)await tx.$queryRaw`SELECT id FROM projects WHERE id=${target.projectId} FOR UPDATE`;
  await writable(tx,actor,target);
  await tx.$queryRaw`SELECT id FROM employees WHERE id=${actor.id} FOR UPDATE`;
  const quota=await tx.projectMarkdownImage.aggregate({where:{uploaderId:actor.id,bound:false,deletedAt:null},_count:true,_sum:{size:true}});
  if(quota._count>=20||(quota._sum.size??0)+content.length>50*1024*1024)fail('MARKDOWN_IMAGE_LIMIT');
  const image=await tx.projectMarkdownImage.create({data:{...target,uploaderId:actor.id,name:file.name,mime,size:content.length,content}});
  await writeAuditLog(tx,actor.id,'project.markdown_image.created','project_markdown_images',image.id);
  return success({key:image.recordKey,name:image.name,mime:image.mime,size:image.size},201);
 });
}

export async function markdownImage(user:AuthenticatedUser|null,key:string,method:'GET'|'DELETE'){
 const actor=requireOperationApi(user,method==='GET'?'projects.images.read':'projects.images.delete');requireOperationApi(actor,'projects.read');if(!uuid.test(key))missing();
 return getPrisma().$transaction(async tx=>{
  if(method==='DELETE')await tx.$queryRaw`SELECT id FROM project_markdown_images WHERE record_key=${key}::uuid FOR UPDATE`;
  const image=await tx.projectMarkdownImage.findFirst({where:{recordKey:key,deletedAt:null}});if(!image)missing();
  if(!image.bound){if(image.uploaderId!==actor.id)missing();if(method==='GET')await writable(tx,actor,image as MarkdownTarget);}
  else {
   if(image.projectId===null)missing();await access(tx,actor,image.projectId);
   if(image.ticketId&&!await tx.projectTicket.findFirst({where:{id:image.ticketId,projectId:image.projectId,deletedAt:null},select:{id:true}}))missing();
   if(image.commentId&&!await tx.projectComment.findFirst({where:{id:image.commentId,ticketId:image.ticketId!,deletedAt:null},select:{id:true}}))missing();
  }
  if(method==='DELETE'){
   if(image.uploaderId!==actor.id)missing();
   // Cleanup is draft-only. Saved/history images are never deleted implicitly.
   if(image.bound)return success({deleted:false});
   await tx.projectMarkdownImage.update({where:{id:image.id},data:{deletedAt:new Date()}});
   await writeAuditLog(tx,actor.id,'project.markdown_image.deleted','project_markdown_images',image.id);
   return success({deleted:true});
  }
  return success({key:image.recordKey,mime:image.mime,size:image.size,data:Buffer.from(image.content).toString('base64')});
 });
}
