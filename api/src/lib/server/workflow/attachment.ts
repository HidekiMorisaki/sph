import {PNG} from 'pngjs';
import {decode} from 'jpeg-js';

// Bound decoded dimensions before allocating pixel buffers. Keep the original
// bytes for evidence; image validation never replaces the uploaded document.
const bounded=(w:number,h:number)=>w>0&&h>0&&w<=16384&&h<=16384&&w*h<=16_000_000;
export function attachmentType(bytes:Buffer):string|null{
 try {
  if(bytes.length<16||bytes.length>10*1024*1024)return null;
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
   if(bytes.length<33||bytes.toString('ascii',12,16)!=='IHDR'||!bounded(bytes.readUInt32BE(16),bytes.readUInt32BE(20)))return null;
   const image=PNG.sync.read(bytes);
   return bounded(image.width,image.height)&&image.data.length===image.width*image.height*4?'image/png':null;
  }
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217){
   const image=decode(bytes,{formatAsRGBA:true,tolerantDecoding:false,maxResolutionInMP:16,maxMemoryUsageInMB:128});
   return bounded(image.width,image.height)&&image.data.length===image.width*image.height*4?'image/jpeg':null;
  }
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&bytes.readUInt32LE(4)+8===bytes.length){
   // Validate RIFF chunk boundaries and static VP8/VP8L frame dimensions.
   // Animated WebP is rejected to bound cumulative decoded frames.
   let frame=false;
   for(let offset=12;offset<bytes.length;){
    if(offset+8>bytes.length)return null;
    const kind=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8;
    if(start+size>bytes.length||['ANIM','ANMF'].includes(kind))return null;
    if(kind==='VP8X'){
     if(size!==10||(bytes[start]&2)||!bounded(bytes.readUIntLE(start+4,3)+1,bytes.readUIntLE(start+7,3)+1))return null;
    }else if(kind==='VP8 '){
     if(frame||size<10||(bytes[start]&1)||!bytes.subarray(start+3,start+6).equals(Buffer.from([157,1,42]))||!bounded(bytes.readUInt16LE(start+6)&16383,bytes.readUInt16LE(start+8)&16383))return null;
     frame=true;
    }else if(kind==='VP8L'){
     if(frame||size<6||bytes[start]!==47)return null;
     const bits=bytes.readUInt32LE(start+1);
     if(bits>>>29||!bounded((bits&16383)+1,((bits>>>14)&16383)+1))return null;
     frame=true;
    }
    offset=start+size+(size%2);if(offset>bytes.length)return null;
   }
   return frame?'image/webp':null;
  }
  if(bytes.toString('ascii',0,5)==='%PDF-'&&bytes.subarray(Math.max(0,bytes.length-2048)).includes(Buffer.from('%%EOF')))return 'application/pdf';
 }catch{/* Invalid compressed images are rejected without logging contents. */}
 return null;
}
