// SPH bounded extraction of pinned npm archives; never executes archive content.
import{gunzipSync}from'node:zlib';
export function filesFromTar(bytes){
 const files=new Map(),tar=gunzipSync(bytes,{maxOutputLength:256*1024*1024});let offset=0,archiveRoot;
 while(offset+512<=tar.length){const h=tar.subarray(offset,offset+512);if(h.every(b=>b===0))break;
  const str=(a,b)=>h.subarray(a,b).toString().split('\0')[0];
  const expected=parseInt(str(148,156).trim()||'0',8);
  let checksum=0;for(let i=0;i<512;i++)checksum+=i>=148&&i<156?32:h[i];
  if(checksum!==expected)throw Error('Archive header checksum differs');
  const size=parseInt(str(124,136).trim()||'0',8);let name=str(0,100);const prefix=str(345,500);if(prefix)name=prefix+'/'+name;
  if(!Number.isSafeInteger(size)||size<0||offset+512+size>tar.length)throw Error('Invalid archive size');
  const kind=str(156,157);if(kind==='0'||kind===''){
   const parts=name.split('/').filter(part=>part!=='.');
   if(parts.length<2||!parts[0]||parts.some(p=>p==='..'||p==='')||name.includes('\\'))throw Error('Unsafe archive path: '+JSON.stringify(name));
   if(archiveRoot&&archiveRoot!==parts[0])throw Error('Multiple archive roots');
   archiveRoot=parts.shift();name=parts.join('/');
   const data=Buffer.from(tar.subarray(offset+512,offset+512+size)),mode=parseInt(str(100,108).trim()||'644',8)&0o777;
   const previous=files.get(name);
   if(previous&&(!previous.data.equals(data)||previous.mode!==mode))throw Error('Conflicting duplicate archive path');
   files.set(name,{data,mode});
  }else if(kind!=='5')throw Error('Unsupported archive member type '+kind);
  offset+=512+Math.ceil(size/512)*512;
 }return files;
}
