import { z } from 'zod';
import { env } from '../../config/env';
import { publisherForHost, searchPublishers } from './catalog.publishers';
import { canonicalSource, compact, metadataSchema, officialSourceUrl } from './catalog.types';
import type { SourceDocument } from './catalog.types';

const searchUrl='https://api.search.brave.com/res/v1/web/search';
const searchResponse=z.object({
  web:z.object({results:z.array(z.object({url:z.string()})).max(20)}).optional(),
});
const topics=['scheme eligibility benefits application', 'yojana guidelines application subsidy', 'pension grant welfare scheme eligibility'];
const scopeSchema=z.object({cursor:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0)});

export async function searchOfficialSchemes(settings:unknown) {
  const {cursor}=scopeSchema.parse(settings);
  const publisher=searchPublishers[cursor % searchPublishers.length];
  const cycle=Math.floor(cursor / searchPublishers.length);
  const url=new URL(searchUrl);
  url.search=new URLSearchParams({
    q:'site:'+publisher.host+' '+topics[cycle % topics.length],
    country:'IN', result_filter:'web', count:'20',
  }).toString();
  const response=await fetch(url,{
    headers:{Accept:'application/json','X-Subscription-Token':env.SCHEME_SEARCH_API_KEY},
    signal:AbortSignal.timeout(12000),
    redirect:'error',
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('Official web search returned HTTP '+response.status+'.');
  }
  const results=searchResponse.parse(await response.json()).web?.results ?? [];
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
  const schemeTitle=/\b(?:schemes?|yojana|pension|scholarship|subsidy|fellowship)\b|योजना|छात्रवृत्ति|पेंशन/iu;
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
