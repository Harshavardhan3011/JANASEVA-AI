import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
const blocked=new BlockList();
for (const [network,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['192.0.2.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]] as const) blocked.addSubnet(network,prefix,'ipv4');
blocked.addSubnet('::',128,'ipv6');blocked.addSubnet('::1',128,'ipv6');
blocked.addSubnet('fc00::',7,'ipv6');blocked.addSubnet('fe80::',10,'ipv6');blocked.addSubnet('ff00::',8,'ipv6');
export async function assertPublicHost(host:string) {
 const addresses=await lookup(host,{all:true});
 if (!addresses.length || addresses.some(item=>item.address.toLowerCase().startsWith('::ffff:') || blocked.check(item.address,isIP(item.address)===6?'ipv6':'ipv4'))) {
   throw new Error('Official source resolved to a non-public network address.');
 }
}
