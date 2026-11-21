import { assertPublicHost } from './catalog.network';
import { load } from 'cheerio';
import robotsParser from 'robots-parser';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { compact, officialSourceUrl } from './catalog.types';
import type { SourceDocument } from './catalog.types';
import { officialDate } from './record.schema';
import { matchesSchemeName } from './catalog.identity';

const agent='JANASEVA-AI';
const fetchHeaders={'User-Agent':agent+'/1.0'};
const maximum=8*1024*1024;
const textLimit=60000;
const nextRequest=new Map<string,number>();
async function pace(host:string,delaySeconds=1) {
 const now=Date.now();
 const next=Math.max(now,nextRequest.get(host) || now);
 nextRequest.set(host,next+Math.max(1,delaySeconds)*1000);
 if (next>now) await new Promise(resolve=>setTimeout(resolve,next-now));
}

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

export function createOfficialReader(checkHost=assertPublicHost) {
  const rules=new Map<string,Promise<ReturnType<typeof robotsParser>>>();
  async function robots(origin:string) {
    const original=origin+'/robots.txt';
    const host=new URL(origin).hostname.replace(/^www\./,'');
    let url=original;
    for (let hop=0;hop<4;hop++) {
      await checkHost(new URL(url).hostname);
      await pace(new URL(url).hostname);
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
      await checkHost(url.hostname);
      const policy=rules.get(url.origin) ?? robots(url.origin);
      rules.set(url.origin,policy);
      if ((await policy).isAllowed(url.href,agent)===false) throw new Error('The publisher disallows automated access to this URL.');
      await pace(url.hostname,(await policy).getCrawlDelay(agent) || 1);
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
  let doc;
  try {doc=await pdf(bytes,{max:300});} catch {throw new Error('PDF extraction failed. The file may be encrypted, damaged, or unsupported. Upload an accessible official PDF.');}
  const text=doc.text.trim();
  if (text.length<30) throw new Error('This PDF has no readable text layer. Scanned PDFs need OCR; upload a text-based official version.');
  const info=doc.info as {Title?:string}|undefined;
  const originalTitle=compact(info?.Title && !/^Microsoft (?:Word|PowerPoint)|^Document\d*/i.test(info.Title)?info.Title:title).slice(0,255);
  const applicationMatch=compact(text).match(/Form Submission\s+(https:\/\/[^\s]+)/i);
  const nspApplication=/apply online in the National Scholarships Portal/i.test(compact(text)) && /www\.scholarships\.gov\.in/i.test(text)?'https://scholarships.gov.in/':null;
  const application=applicationMatch?officialSourceUrl.safeParse(applicationMatch[1]):nspApplication?officialSourceUrl.safeParse(nspApplication):null;
  // Retain both ends of long bilingual documents so an English part after a Hindi part is not silently lost.
  const english=text.search(/MINISTRY OF LABOUR AND EMPLOYMENT|MINISTRY OF [A-Z ]{4,80}\n/);
  const selected=text.length>textLimit?
    (english>textLimit/2?text.slice(0,6000)+'\n[English section excerpt]\n'+text.slice(english,english+42000)+'\n[Final document excerpt]\n'+text.slice(-6000):text.slice(0,textLimit/2)+'\n[Document excerpt truncated; inspect the complete official PDF.]\n'+text.slice(-textLimit/2)):text;
  return { url, originalTitle, text:selected, applyUrl:application?.success?application.data:null,
    extraction:{method:'pdf',pages:doc.numpages,characters:text.length,truncated:text.length>textLimit || doc.numpages>300},
    incomplete:text.length<150 || text.length>textLimit || doc.numpages>300 };
}

export async function readDocument(read:OfficialReader,url:string,title:string):Promise<SourceDocument> {
  const { bytes,url:resolved,mime }=await read(url);
  if (bytes.subarray(0,5).toString()==='%PDF-') {
    try { return await extractPdf(bytes,resolved,title); }
    catch(error) { return {url:resolved,originalTitle:title,text:'',applyUrl:null,incomplete:true,
      extraction:{method:'pdf',characters:0,truncated:false,error:error instanceof Error?error.message:'PDF extraction failed.'}}; }
  }
  if (!/html/i.test(mime)) return {url:resolved,originalTitle:title,text:'',applyUrl:null,incomplete:true};
  const $=load(bytes.toString('utf8'));
  const publicationText=compact($('.ReleaseDateSubHeaddateTime, .ReleaseDateSubHead, time').first().text()) ||
    (compact($('body').text()).match(/Posted On:\s*\d{1,2}\s+[A-Z]+\s+20\d{2}[^\n]{0,25}/i)?.[0] || '');
  const publicationDate=officialDate(publicationText);
  const language=$('html').attr('lang') || (/^[\s\S]*[\u0900-\u097f]/.test(title)?'hi':'und');
  const publisher=compact($('.ReleaseMinistry').first().text());
  let identityUrl:string|undefined;
  if (/(^|\.)pib.gov.in$/.test(new URL(resolved).hostname)) {
    $('a[href]').each((_,link)=>{if (/^english$/i.test(compact($(link).text()))) {
      try {const candidate=new URL($(link).attr('href')!,resolved);if (/^(www\.)?pib.gov.in$/.test(candidate.hostname) && candidate.searchParams.has('PRID')) identityUrl=candidate.href;} catch { /* Ignore malformed translation links. */ }
    }});
  }
  $('script,style,nav,footer,header,noscript').remove();
  const body=$('.innner-page-main-about-us-content-right-part, article, main, #main-content, #mainContent').first();
  // NSP has a navigation <main> before its actual scheme cards. Scope to the requested card,
  // including its h6 title, timeline spans and guideline links rather than the first <main>.
  const card=/^(www\.)?scholarships\.gov\.in$/.test(new URL(resolved).hostname)?$('h6').filter((_,node)=>matchesSchemeName($(node).text(),{title,aliases:[]})).first().parent():$();
  const area=card.length?card:body.length ? body : $('body');
  const links:Array<{url:string;title:string}>=[];
  area.find('a[href]').each((_,node)=>{try{const target=officialSourceUrl.parse(new URL($(node).attr('href')!,resolved).href);if(links.length<30)links.push({url:target,title:compact($(node).text()).slice(0,255)});}catch{/* Only approved public links. */}});
  const lines=area.find('h1,h2,h3,h4,h5,h6,p,li,tr,span').toArray().map(node=>compact($(node).text())).filter(Boolean);
  const text=[...new Set([publisher,publicationText,...lines].filter(Boolean))].join('\n');
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
  return { url:resolved, originalTitle:heading || title, text:text.slice(0,textLimit), applyUrl,publicationDate,
    sourceId:new URL(identityUrl || resolved).searchParams.get('PRID') || undefined,originalLanguage:/[\u0900-\u097f]/u.test(heading)?'hi':language,identityUrl,
    extraction:{method:'html',characters:text.length,truncated:text.length>textLimit},
    links,incomplete:!(body.length || card.length) || text.length<150 || text.length>textLimit };
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
    if (/योजना|छात्रवृत्ति|पेंशन|सब्सिडी|कल्याण|बैठक|अदालत|नियम|\b(?:scheme|scholarship|pension|yojana|subsidy|fellowship|meeting|hearing|adalat|certificate|recruitment|rules|notification|consultation|faq|helpline|service)\b/iu.test(title)) {
      result.push({title,url:link.data});
    }
  });
  return result.slice(0,12);
}
