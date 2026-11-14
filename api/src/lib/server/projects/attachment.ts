import { Unzip, UnzipInflate } from 'fflate';
import { attachmentType } from '#lib/server/workflow/attachment.js';
import { throwApiError } from '#lib/server/api/response.js';

function bad():never{return throwApiError(422,'INVALID_ATTACHMENT','The file format or archive limits are invalid.');}
const maxFile=10*1024*1024,maxExpanded=100*1024*1024;
const mime:Record<string,string>={txt:'text/plain',csv:'text/csv',md:'text/markdown',zip:'application/zip',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function archive(bytes:Buffer,ext:string){
 // Check the central directory as well as streaming content; do not trust declared sizes.
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
 if(end<0||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))bad();
 const count=bytes.readUInt16LE(end+10),directory=bytes.readUInt32LE(end+16),directorySize=bytes.readUInt32LE(end+12);if(!count||count>1000||directory+directorySize!==end||bytes.readUInt16LE(end+8)!==count)bad();
 const expected=new Map<string,{size:number;crc:number}>();let pos=directory,declared=0;
 const decoder=new TextDecoder('utf-8',{fatal:true});
 for(let i=0;i<count;i++){
  if(pos+46>end||bytes.readUInt32LE(pos)!==0x02014b50)bad();const flags=bytes.readUInt16LE(pos+8),method=bytes.readUInt16LE(pos+10),size=bytes.readUInt32LE(pos+24),nl=bytes.readUInt16LE(pos+28),extra=bytes.readUInt16LE(pos+30),comment=bytes.readUInt16LE(pos+32),offset=bytes.readUInt32LE(pos+42);
  if(flags&1||![0,8].includes(method)||pos+46+nl+extra+comment>end||offset+30>directory||bytes.readUInt32LE(offset)!==0x04034b50)bad();
  const raw=bytes.subarray(pos+46,pos+46+nl);let name:string;try{name=decoder.decode(raw);}catch{bad();}
  if(!name||name.length>1024||name.includes('\\')||name.includes('\0')||name.startsWith('/')||/^[a-z]:/i.test(name)||name.split('/').some(p=>p==='..')||expected.has(name))bad();
  const localNameLength=bytes.readUInt16LE(offset+26),localExtra=bytes.readUInt16LE(offset+28),packed=bytes.readUInt32LE(pos+20);
  if(offset+30+localNameLength+localExtra+packed>directory||!bytes.subarray(offset+30,offset+30+localNameLength).equals(raw)||bytes.readUInt16LE(offset+6)!==flags||bytes.readUInt16LE(offset+8)!==method)bad();
  declared+=size;if(declared>maxExpanded)bad();expected.set(name,{size,crc:bytes.readUInt32LE(pos+16)});pos+=46+nl+extra+comment;
 }
 if(pos!==end)bad();
 let total=0,completed=0,failed=false;const received=new Set<string>(),xml=new Map<string,string>();
 const unzip=new Unzip(file=>{
  const entry=expected.get(file.name);if(!entry||received.has(file.name)){failed=true;return;}received.add(file.name);
  let size=0,crc=0xffffffff;const keep=['[Content_Types].xml','_rels/.rels'].includes(file.name);const parts:Uint8Array[]=[];
  file.ondata=(error,data,final)=>{
   if(error){failed=true;file.terminate();return;}size+=data.length;total+=data.length;
   if(size>entry.size||total>maxExpanded||keep&&size>1024*1024){failed=true;file.terminate();return;}
   for(const n of data)crc=crcTable[(crc^n)&255]^(crc>>>8);if(keep)parts.push(data);
   if(final){if(size!==entry.size||((crc^0xffffffff)>>>0)!==entry.crc){failed=true;return;}completed++;if(keep){try{xml.set(file.name,decoder.decode(Buffer.concat(parts)));}catch{failed=true;}}}
  };file.start();
 });unzip.register(UnzipInflate);
 try{for(let i=0;i<bytes.length;i+=1024){unzip.push(bytes.subarray(i,i+1024),i+1024>=bytes.length);if(failed)bad();}}catch{bad();}
 if(failed||completed!==count)bad();
 if(ext!=='zip'){
  const main={docx:'word/document.xml',xlsx:'xl/workbook.xml',pptx:'ppt/presentation.xml'}[ext];
  const type=xml.get('[Content_Types].xml')??'',relationships=xml.get('_rels/.rels')??'';
  if(!main||!expected.has(main)||!type.includes('/'+main)||!relationships.includes('officeDocument')||!relationships.includes(main)||/<!DOCTYPE|<!ENTITY/i.test(type+relationships)||[...expected.keys()].some(n=>/vbaproject|activex|macrosheets/i.test(n))||/macroEnabled/i.test(type))bad();
 }
}
export async function validateProjectAttachment(file:{name:string;mime:string;bytes:Buffer}){
 if(!file.name||file.name.length>255||file.bytes.length===0||file.bytes.length>maxFile)bad();
 const ext=file.name.split('.').at(-1)?.toLowerCase()??'';
 if(['png','jpg','jpeg','webp','pdf'].includes(ext)){
  const detected=attachmentType(file.bytes),expected={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',pdf:'application/pdf'}[ext];if(!detected||detected!==expected)bad();file.mime=detected;return;
 }
 if(!mime[ext])bad();
 if(['txt','csv','md'].includes(ext)){try{const value=new TextDecoder('utf-8',{fatal:true}).decode(file.bytes);if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))bad();}catch{bad();}}
 else archive(file.bytes,ext);
 file.mime=mime[ext];
}
