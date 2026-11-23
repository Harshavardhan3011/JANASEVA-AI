import directory from './certificate-directory.json';

export { directory as certificateDirectory };
export function findCertificateGuides(question:string,state='') {
 const normalized=question.toLowerCase();
 const words:string[]=normalized.match(/[a-z]+/g) || [];
 const location=directory.states.find(item=>normalized.includes(item.state.toLowerCase()))?.state || state;
 const generic=new Set(['certificate','certificates','central','state','digital','registration','family','member','change']);
 const scores=directory.guides.filter(guide=>(!guide.state || guide.state===location) &&
   (!guide.district || normalized.includes(guide.district.toLowerCase()) || (guide.district==='Tumakuru' && normalized.includes('tumkur'))))
  .map(guide=>({guide,score:[guide.title,...guide.aliases].join(' ').toLowerCase().split(/[^a-z]+/).filter(word=>word.length>2 && !generic.has(word) && words.includes(word)).length}))
  .filter(item=>item.score>0)
  .sort((a,b)=>b.score-a.score || Number(b.guide.level==='source_guide')-Number(a.guide.level==='source_guide'))
  ;
 const best=scores.find(item=>item.guide.level==='directory')?.guide.kind || scores[0]?.guide.kind;
 const selected=scores.filter(item=>/compare|difference/i.test(question) || item.guide.kind===best);
 return selected.filter(item=>item.guide.level==='source_guide' || !selected.some(other=>other.guide.kind===item.guide.kind && other.guide.level==='source_guide'))
  .sort((a,b)=>Number(b.guide.level==='source_guide')-Number(a.guide.level==='source_guide') || b.score-a.score)
  .slice(0,4).map(item=>item.guide);
}
export function certificateGuideAnswer(guide:typeof directory.guides[number]) {
 const unknown='Not specified in the official source.';
 return [guide.title+' · '+guide.scope,guide.overview,
  guide.level==='directory'?'Local requirements have not yet been verified. These are general navigation steps.':'Source-based guide · checked '+guide.checkedOn,
  'Eligibility: '+(guide.eligibility.join('; ') || unknown),
  'Documents / information: '+(guide.documents.join('; ') || unknown),
  ...(guide.documentNote?['Document note: '+guide.documentNote]:[]),
  'How to apply:\n'+guide.steps.map((step,index)=>(index+1)+'. '+step).join('\n'),
  'Fees: '+(guide.fees || unknown),'Processing time: '+(guide.processingTime || unknown),
  ...(guide.authority?['Issuing authority: '+guide.authority]:[]),
  ...(guide.contact?['Contact: '+guide.contact]:[]),...guide.notes.map(note=>'Check before submitting: '+note),
  ...guide.sources.map(source=>'Official evidence: '+source.url),
  ...(guide.applicationUrl?['Official portal: '+guide.applicationUrl]:['Choose your state and responsible authority: https://services.india.gov.in/'])].join('\n');
}
