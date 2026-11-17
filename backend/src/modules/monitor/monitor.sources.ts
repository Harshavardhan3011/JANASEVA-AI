import { load } from 'cheerio';
import { AppError } from '../../shared/errors';
import { draftNotice } from '../../ai/providers/llm.provider';
import { draftSchema, officialUrl, sourceConfigSchema } from './monitor.types';
import type { Draft, Observation, Source } from './monitor.types';

const normalize = (text: string) => text.replace(/\s+/g,' ').trim();
const programme = /\b(scheme|yojana|scholarship|fellowship|pension|subsidy|welfare|grant|livelihood|housing)\b/i;
const hindiProgramme = /योजना|छात्रवृत्ति|पेंशन|सब्सिडी|कल्याण|आवास|अनुदान/u;
const maxBytes = 2 * 1024 * 1024;
function statedDeadline(text:string) {
  const match=text.match(/\bapplication deadline\s*:\s*(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})(?!\d)/i);
  if (!match) return null;
  const date=match[1].includes('/') ? match[1].split('/').reverse().join('-') : match[1];
  return draftSchema.shape.deadline.safeParse(date).success ? date : null;
}

export async function readSource(start: string, allowedHosts: Set<string>) {
  let url = new URL(start);
  for (let redirects=0; redirects<=3; redirects++) {
    if (!officialUrl.safeParse(url.href).success || !allowedHosts.has(url.hostname)) {
      throw new Error('The source tried to leave its registered government host.');
    }
    const response = await fetch(url,{ redirect:'manual', signal:AbortSignal.timeout(12000),
      headers:{ Accept:'text/html, application/rss+xml, application/xml, text/xml', 'User-Agent':'JANASEVA-AI/1.0' } });
    if (response.status>=300 && response.status<400 && response.headers.has('location')) {
      await response.body?.cancel();
      url = new URL(response.headers.get('location')!, url);
      continue;
    }
    if (!response.ok || !response.body) throw new Error(`Government source returned HTTP ${response.status}.`);
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size>maxBytes) {
        await reader.cancel();
        throw new Error('The source exceeded the monitor’s download limit.');
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  throw new Error('The source returned too many redirects.');
}

export async function enrichDraft(draft: Draft, evidence: string): Promise<Draft> {
  if (evidence.length < 35) return draft;
  const result = await draftNotice(evidence).catch(() => null);
  if (!result) return draft;
  const model = draftSchema.pick({ category:true, description:true, eligibility:true, benefits:true, deadline:true }).safeParse(result);
  if (!model.success) return draft;
  return { ...draft, ...model.data };
}

function structured(source: Source, html: string): Observation[] {
  const $ = load(html);
  const origin = new URL(source.url).origin;
  const config=sourceConfigSchema.parse(source.source_config);
  if (source.feed_type==='state_profile') {
    if (!config.title || !config.state) throw new Error('The state profile requires a scheme name and state.');
    const heading = $('h3, h2').filter((_,element)=>normalize($(element).text())===config.title)
      .filter((_,element)=>Boolean($(element).parent().find('p').first().text())).first();
    const summary = normalize(heading.parent().find('p').first().text());
    if (!summary) throw new Error('The registered state profile no longer matches its expected layout.');
    const draft = draftSchema.parse({
      title:config.title, issuer:source.label, description:config.description || '',
      category:config.category || 'Other', level:'State', state:config.state, sourceUrl:source.url, deadline:statedDeadline(summary),
    });
    return [{ reference:source.url, draft, evidence:summary.slice(0,8000), autoPublish:true }];
  }
  if (!config.state || !config.district) throw new Error('The district catalog requires a state and district.');
  const rows:Observation[]=[];
  $('.schemeItem').each((_,element)=>{
    const card=$(element);
    const title = normalize(card.find('h2').first().text());
    const summary = normalize(card.find('p').first().text());
    const href = card.find('a[href]').first().attr('href');
    if (!title || !summary || !href) return;
    const url = new URL(href,source.url);
    if (url.origin!==origin || !/^\/scheme\/[\w-]+\/?$/.test(url.pathname)) return;
    const sourceUrl=url.origin+url.pathname.replace(/\/?$/,'/');
    const evidence=normalize([title,summary,card.find('.pub-date').text()].join(' '));
    const draft=draftSchema.parse({
      title, issuer:source.label, description:'Programme listed by the district administration. See the official source for details.',
      category:/literacy|education|saakshar/i.test(title+' '+summary) ? 'Education' : /fiber|broadband/i.test(title) ? 'Infrastructure' : 'Other',
      level:'District', state:config.state, district:config.district, sourceUrl, deadline:statedDeadline(summary),
    });
    rows.push({ reference:sourceUrl, draft, evidence:evidence.slice(0,8000), autoPublish:true });
  });
  if (!rows.length) throw new Error('The district index did not contain scheme cards in the expected layout.');
  return rows.slice(0,50);
}

export async function parseSource(source: Source, raw: string): Promise<Observation[]> {
  if (source.feed_type!=='pib_rss') return structured(source,raw);
  const $=load(raw,{ xml:true });
  if (!$('rss > channel').length) throw new Error('The PIB source did not return an RSS channel.');
  const observations:Observation[]=[];
  for (const node of $('channel > item').toArray().slice(0,50)) {
    const item=$(node);
    const title=normalize(item.find('title').first().text()).slice(0,255);
    const summary=normalize(load(item.find('description').first().text()).text());
    const link=officialUrl.safeParse(item.find('link').first().text().trim());
    const text=title+' '+summary;
    if ((!programme.test(text) && !hindiProgramme.test(text)) || title.length<3 || !link.success) continue;
    const url=new URL(link.data);
    if (!['pib.gov.in','www.pib.gov.in'].includes(url.hostname)) continue;
    const evidence=normalize([title,summary,item.find('pubDate').first().text()].join(' ')).slice(0,8000);
    const draft=draftSchema.parse({ title, issuer:source.label, level:'National', sourceUrl:link.data });
    observations.push({ reference:url.pathname+url.search, draft, evidence, autoPublish:false });
  }
  return observations;
}

export async function fetchObservations(source: Source) {
  if (!officialUrl.safeParse(source.url).success) throw AppError.badRequest('The registered source URL is invalid.');
  const host = new URL(source.url).hostname;
  const allowedHosts = new Set([host, host.startsWith('www.') ? host.slice(4) : 'www.'+host]);
  const observations=await parseSource(source,await readSource(source.url,allowedHosts));
  if (source.feed_type !== 'pib_rss') return observations;
  await Promise.all(observations.slice(0,5).map(async observation=>{
    try {
      const article=load(await readSource(observation.draft.sourceUrl!,allowedHosts));
      article('script,style').remove();
      const text=article('.innner-page-main-about-us-content-right-part p').toArray()
        .map(paragraph=>normalize(article(paragraph).text())).filter(Boolean).join('\n');
      if (text) observation.evidence=(observation.evidence+'\n'+text).slice(0,8000);
    } catch { /* A release with only feed evidence remains a draft for review. */ }
  }));
  return observations;
}
