import { load } from 'cheerio';
import robotsParser from 'robots-parser';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { compact, officialSourceUrl } from './catalog.types';
import type { SourceDocument } from './catalog.types';

const agent='JANASEVA-AI';
const fetchHeaders={'User-Agent':agent+'/1.0'};
const maximum=8*1024*1024;
const textLimit=60000;

async function bounded(response:Response, limit:number) {
  if (!response.body) return Buffer.alloc(0);
  const reader=response.body.getReader();
  const chunks:Buffer[]=[];
  let size=0;
  for (;;) {
    const { value,done }=await reader.read();
    if (done) return Buffer.concat(chunks);
    size+=value.length;
    if (size>limit) { await reader.cancel(); throw new Error('Official file exceeds the import limit.'); }
    chunks.push(Buffer.from(value));
  }
}

export function createOfficialReader() {
  const rules=new Map<string,Promise<ReturnType<typeof robotsParser>>>();
  async function robots(origin:string) {
    const original=origin+'/robots.txt';
    const host=new URL(origin).hostname.replace(/^www\./,'');
    let url=original;
    for (let hop=0;hop<4;hop++) {
      const response=await fetch(url,{headers:fetchHeaders,redirect:'manual',signal:AbortSignal.timeout(12000)});
      if (response.status>=300 && response.status<400 && response.headers.has('location')) {
        await response.body?.cancel();
        const target=new URL(response.headers.get('location')!,url);
        officialSourceUrl.parse(target.href);
        if (target.hostname.replace(/^www\./,'')!==host || target.pathname!=='/robots.txt') {
          throw new Error('The robots policy redirected outside its publisher.');
        }
        url=target.href;continue;
      }
      if (response.status===404 || response.status===410) {
        await response.body?.cancel();
        return robotsParser(original,'');
      }
      if (!response.ok) throw new Error(`Cannot verify automated access: robots.txt returned HTTP ${response.status}.`);
      const policy=(await bounded(response,256000)).toString('utf8');
      if (/^\s*<!doctype html/i.test(policy)) {
        if (host==='pib.gov.in' && /page you have requested is not available/i.test(load(policy)('body').text())) {
          return robotsParser(original,'');
        }
        throw new Error('The publisher returned an HTML page in place of robots.txt.');
      }
      return robotsParser(original,policy);
    }
    throw new Error('The robots policy returned too many redirects.');
  }
  return async (input:string) => {
    let url=new URL(input);
    for (let hop=0; hop<4; hop++) {
      officialSourceUrl.parse(url.href);
      const policy=rules.get(url.origin) ?? robots(url.origin);
      rules.set(url.origin,policy);
      if ((await policy).isAllowed(url.href,agent)===false) throw new Error('The publisher disallows automated access to this URL.');
      const response=await fetch(url,{headers:fetchHeaders,redirect:'manual',signal:AbortSignal.timeout(15000)});
      if (response.status>=300 && response.status<400 && response.headers.has('location')) {
        await response.body?.cancel();
        url=new URL(response.headers.get('location')!,url);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Official source returned HTTP ${response.status}.`);
      }
      return { bytes:await bounded(response,maximum), url:url.href, mime:response.headers.get('content-type') || '' };
    }
    throw new Error('Too many official-source redirects.');
  };
}
export type OfficialReader=ReturnType<typeof createOfficialReader>;

export async function extractPdf(bytes:Buffer, url:string, title:string):Promise<SourceDocument> {
  if (bytes.subarray(0,5).toString()!=='%PDF-') throw new Error('The source did not return a PDF.');
  const doc=await pdf(bytes,{max:60});
  const text=doc.text.trim();
  const info=doc.info as {Title?:string}|undefined;
  const originalTitle=compact(info?.Title || title).slice(0,255);
  return { url, originalTitle, text:text.slice(0,textLimit), applyUrl:null,
    incomplete:text.length<150 || text.length>textLimit || doc.numpages>60 };
}

export async function readDocument(read:OfficialReader,url:string,title:string):Promise<SourceDocument> {
  const { bytes,url:resolved,mime }=await read(url);
  if (bytes.subarray(0,5).toString()==='%PDF-') {
    try { return await extractPdf(bytes,resolved,title); }
    catch { return {url:resolved,originalTitle:title,text:'',applyUrl:null,incomplete:true}; }
  }
  if (!/html/i.test(mime)) return {url:resolved,originalTitle:title,text:'',applyUrl:null,incomplete:true};
  const $=load(bytes.toString('utf8'));
  $('script,style,nav,footer,header,noscript').remove();
  const body=$('.innner-page-main-about-us-content-right-part, article, main, #main-content, #mainContent').first();
  const area=body.length ? body : $('body');
  const lines=area.find('h1,h2,h3,h4,p,li,tr').toArray().map(node=>compact($(node).text())).filter(Boolean);
  const text=[...new Set(lines)].join('\n');
  const heading=compact(area.find('h1,h2').first().text() || $('title').text() || title).slice(0,255);
  let applyUrl:null|string=null;
  area.find('a[href]').each((_,link)=>{
    const label=compact($(link).text());
    if (!/^(?:apply online|apply for (?:this|the) scheme|new farmer registration|apply for pension)$/i.test(label)) return;
    try {
      const linkUrl=officialSourceUrl.parse(new URL($(link).attr('href')!,resolved).href);
      if (!applyUrl) applyUrl=linkUrl;
    } catch { /* The public link must be on the reviewed allowlist. */ }
  });
  return { url:resolved, originalTitle:heading || title, text:text.slice(0,textLimit), applyUrl,
    incomplete:!body.length || text.length<150 || text.length>textLimit };
}

export async function discoverPib(read:OfficialReader,url:string) {
  const { bytes }=await read(url);
  const $=load(bytes.toString('utf8'),{xml:true});
  if (!$('rss > channel').length) throw new Error('PIB did not return its official RSS channel.');
  const result:Array<{title:string;url:string}>=[];
  $('channel > item').each((_,node)=>{
    const item=$(node);
    const title=compact(item.find('title').first().text()).slice(0,255);
    const link=officialSourceUrl.safeParse(item.find('link').first().text().trim());
    if (!title || !link.success || !['pib.gov.in','www.pib.gov.in'].includes(new URL(link.data).hostname)) return;
    if (/योजना|छात्रवृत्ति|पेंशन|सब्सिडी|कल्याण|\b(?:scheme|scholarship|pension|yojana|subsidy|fellowship)\b/iu.test(title)) {
      result.push({title,url:link.data});
    }
  });
  return result.slice(0,12);
}
