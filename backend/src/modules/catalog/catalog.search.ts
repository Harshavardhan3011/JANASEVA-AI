import { z } from 'zod';
import { env } from '../../config/env';
import { publisherForHost, searchPublishers } from './catalog.publishers';
import { canonicalSource, compact, metadataSchema, officialSourceUrl } from './catalog.types';
import type { SourceDocument } from './catalog.types';

const braveUrl='https://api.search.brave.com/res/v1/web/search';
const tavilyUrl='https://api.tavily.com/search';
const searchResults=z.array(z.object({url:z.string()})).max(20);
const braveResponse=z.object({web:z.object({results:searchResults}).optional()});
const tavilyResponse=z.object({results:searchResults});
const topics=['scheme eligibility benefits application', 'yojana guidelines application subsidy', 'pension grant welfare scheme eligibility',
  'citizen service certificate licence documents fee application', 'recruitment examination result official notification',
  'government public notice hearing consultation deadline', 'rules Gazette circular FAQ official helpline grievance RTI'];
const scopeSchema=z.object({cursor:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0)});

export const hasSearchKey=()=>Boolean(env.TAVILY_API_KEY || env.SCHEME_SEARCH_API_KEY);

async function fetchSearchJson(url:URL|string, options:RequestInit, provider:string) {
  const response=await fetch(url,{
    ...options, signal:AbortSignal.timeout(12000), redirect:'error',
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(provider+' web search returned HTTP '+response.status+'.');
  }
  return response.json();
}

async function findResults(host:string, topic:string) {
  if (env.TAVILY_API_KEY) {
    const response=await fetchSearchJson(tavilyUrl,{
      method:'POST',
      headers:{Authorization:'Bearer '+env.TAVILY_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({
        query:topic, include_domains:[host,'www.'+host], include_domains_mode:'restrict',
        search_depth:'basic', auto_parameters:false, max_results:20,
        include_raw_content:false, include_answer:false,
      }),
    },'Tavily');
    return tavilyResponse.parse(response).results;
  }

  const url=new URL(braveUrl);
  url.search=new URLSearchParams({
    q:'site:'+host+' '+topic, country:'IN', result_filter:'web', count:'20',
  }).toString();
  const response=await fetchSearchJson(url,{
    headers:{Accept:'application/json','X-Subscription-Token':env.SCHEME_SEARCH_API_KEY},
  },'Brave');
  return braveResponse.parse(response).web?.results ?? [];
}

export async function searchSchemeFields(title:string,state:string,fields:string[],hosts:string[]) {
  if(!hasSearchKey())return [];
  const queries=[fields.filter(field=>/eligibility|documents|benefits|fees/.test(field)),fields.filter(field=>/application|dates|contacts/.test(field))].filter(group=>group.length);
  const found:string[]=[];
  for(const [index,group] of queries.entries()) {
    const host=hosts[index % hosts.length];if(!host)break;
    const labels:Record<string,string>={eligibility:'eligibility conditions',documents:'required documents',benefits:'benefit amount',fees:'application fees',applicationSteps:'application steps how to apply',dates:'application deadlines current cycle',contacts:'official contact helpline'};
    const results=await findResults(host,'"'+title+'" '+state+' '+group.map(field=>labels[field] || field).join(' ')+' official guidelines PDF amendments');
    for(const result of results){const parsed=officialSourceUrl.safeParse(result.url);if(parsed.success && new URL(parsed.data).hostname.replace(/^www\./,'')===host.replace(/^www\./,''))found.push(canonicalSource(parsed.data));}
  }
  return [...new Set(found)].slice(0,4);
}

export async function searchOfficialSchemes(settings:unknown) {
  const {cursor}=scopeSchema.parse(settings);
  const publisher=searchPublishers[cursor % searchPublishers.length];
  const cycle=Math.floor(cursor / searchPublishers.length);
  const results=await findResults(publisher.host, topics[cycle % topics.length]);
  const urls=[...new Set(results.flatMap(result=>{
    const parsed=officialSourceUrl.safeParse(result.url);
    if (!parsed.success) return [];
    const candidate=new URL(parsed.data);
    if (publisherForHost(candidate.hostname)!==publisher || candidate.pathname==='/') return [];
    return [canonicalSource(candidate.href)];
  }))];
  // Rotate through the results of each topic across successive sweeps.
  const position=(Math.floor(cycle/topics.length)*4) % (urls.length || 1);
  const candidates=[...urls.slice(position),...urls.slice(0,position)].slice(0,4)
    .map(url=>({url,title:''}));
  return {candidates,nextCursor:(cursor+1)%Number.MAX_SAFE_INTEGER};
}

export function searchMetadata(document:SourceDocument, candidateUrl:string) {
  const publisher=publisherForHost(new URL(candidateUrl).hostname);
  if (!publisher || publisherForHost(new URL(document.url).hostname)!==publisher) {
    throw new Error('The discovered document redirected to a different publisher.');
  }
  const lines=document.text.split(/\r?\n/).map(compact).filter(Boolean);
  const schemeTitle=/\b(?:schemes?|yojana|pension|scholarship|subsidy|fellowship|certificate|licen[cs]e|recruitment|vacanc|exam|result|rules|notification|circular|faq|helpline|directory|hearing|adalat|meeting|service|consultation)\b|योजना|छात्रवृत्ति|पेंशन|नियम|अदालत|बैठक/iu;
  const heading=compact(document.originalTitle);
  const title=schemeTitle.test(heading) && compact(document.text).includes(heading)
    ? heading
    : lines.slice(0,15).find(line=>schemeTitle.test(line) && line.length>=8 && line.length<=160);
  if (!title) return null;
  const generic=/^(?:list of |all |our |current |ongoing )|\bschemes\s*$/i.test(title);
  return metadataSchema.parse({
    title,issuer:publisher.issuer,state:publisher.state,category:publisher.category,discovery:'official_search',
    reviewNote:generic ? 'The official page appears to be a list of schemes.' : undefined,
  });
}
