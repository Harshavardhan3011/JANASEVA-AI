import { z } from 'zod';
import { load } from 'cheerio';
import { database } from '../../config/db';
import { supportedHosts, officialSourceUrl, compact } from './catalog.types';
import type { OfficialReader } from './catalog.fetch';

export const registryInput=z.object({
 id:z.string().regex(/^[a-z0-9-]{3,80}$/),label:z.string().trim().min(3).max(200),
 url:z.url({protocol:/^https$/}).refine(value=>{
   const url=new URL(value);
   return /\.(gov|nic)\.in$/.test(url.hostname) && !url.port && !url.username && !url.password;
 }),
 purpose:z.string().trim().min(5).max(500),jurisdiction:z.string().trim().min(2).max(120),
 department:z.string().trim().min(2).max(120),
 access_method:z.enum(['manual_review','api','feed','listing','document']),
 access_note:z.string().trim().min(10).max(1000),approved:z.boolean(),
});
export async function loadApprovedHosts() {
 const {rows}=await (await database()).query<{url:string}>('select url from public.scheme_source_registry where approved');
 for (const row of rows) supportedHosts.add(new URL(row.url).hostname);
}
export async function discoverListing(read:OfficialReader,url:string) {
 const page=await read(url);
 const $=load(page.bytes.toString('utf8'));
 const links:Array<{url:string;title:string}>=[];
 $('a[href]').each((_,element)=>{
   const title=compact($(element).text());
   if (!/scheme|yojana|scholarship|pension|subsidy|योजना/i.test(title)) return;
   const target=officialSourceUrl.safeParse(new URL($(element).attr('href')!,page.url).href);
   if (target.success && target.data!==page.url) links.push({title:title.slice(0,255),url:target.data});
 });
 return [...new Map(links.map(link=>[link.url,link])).values()].slice(0,8);
}
