import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP, BlockList } from 'node:net';

const blocked = new BlockList();
for (const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]] as const) blocked.addSubnet(address,prefix,'ipv4');
// Only global unicast IPv6; transition/mapped ranges are rejected to prevent embedded private IPv4.
for (const [address,prefix] of [['2001::',23],['2001:db8::',32],['2002::',16]] as const) blocked.addSubnet(address,prefix,'ipv6');
const globalV6 = new BlockList(); globalV6.addSubnet('2000::',3,'ipv6');
export function publicAddress(address: string): boolean {
 const family = isIP(address);
 return family === 4 ? !blocked.check(address,'ipv4') : family === 6 && globalV6.check(address,'ipv6') && !blocked.check(address,'ipv6');
}
export function publicUrl(input: string): URL {
 const u = new URL(input);
 if (u.protocol !== 'https:' || u.port && u.port !== '443' || u.username || u.password || u.hash || u.search || u.href.length > 2048) throw new Error('Public HTTPS JSON URL required (no credentials/query/fragment)');
 const host = u.hostname.replace(/^\[|\]$/g,'');
 if (!host.includes('.') && !isIP(host) || isIP(host) && !publicAddress(host) || /(?:^|\.)(localhost|local|internal|home|test|invalid)$/.test(host)) throw new Error('Public hostname required');
 return u;
}
/** DNS resolved once, all answers checked, chosen address pinned to socket; redirects never followed. */
export async function publicJson(input: string): Promise<unknown> {
 const u = publicUrl(input), host = u.hostname.replace(/^\[|\]$/g,'');
 const addresses = await Promise.race([lookup(host,{all:true}), new Promise<never>((_,reject) => {const t=setTimeout(()=>reject(new Error('DNS timeout')),5000);t.unref();})]);
 if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('Non-public DNS answer');
 const chosen = addresses[0];
 return new Promise((resolve,reject) => {
  const req = request(u, { method:'GET', agent:false, headers:{Accept:'application/json','User-Agent':'SPH-Widgets/1.0 (https://github.com/HidekiMorisaki/sph)'}, lookup: (_hostname,_options,callback) => callback(null,[chosen]) }, response => {
   if (response.statusCode !== 200 || !/^application\/(?:[\w.+-]*\+)?json(?:;|$)/i.test(response.headers['content-type'] ?? '')) { response.destroy();reject(new Error('JSON response required'));return; }
   const buffers: Buffer[]=[]; let length=0;
   response.on('data',(part:Buffer) => {length+=part.length;if(length>4*1024*1024){response.destroy(new Error('Catalogue too large'));return;}buffers.push(part);});
   response.on('error',reject);
   response.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(buffers).toString('utf8')));}catch{reject(new Error('Invalid JSON'));}});
  });
  const deadline=setTimeout(()=>req.destroy(new Error('Request timeout')),10000);deadline.unref();
  req.on('close',()=>clearTimeout(deadline));req.on('error',reject);req.end();
 });
}
