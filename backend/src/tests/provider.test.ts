import test from 'node:test';
import assert from 'node:assert/strict';
test('an unavailable Gemini model is recovered from the authenticated model list without logging secrets',async()=>{
 process.env.NODE_ENV='test';process.env.LLM_PROVIDER='gemini';process.env.LLM_API_KEY='fixture-secret-key';
 const {env}=await import('../config/env');env.LLM_PROVIDER='gemini';env.LLM_API_KEY='fixture-secret-key';env.LLM_MODEL='models/unavailable';
 const {generateProviderJson}=await import('../ai/providers/llm.provider');
 const original=globalThis.fetch;const requests:string[]=[];
 try{
  globalThis.fetch=async(input)=>{const url=String(input);requests.push(url);
   assert.ok(!url.includes(env.LLM_API_KEY),'Credential must be in a header, not a URL');
   if(url.includes('/unavailable:'))return Response.json({error:'private provider body'},{status:404});
   if(url.includes('/models?'))return Response.json({models:[{name:'models/gemini-3.0-flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-3.0-image',supportedGenerationMethods:['generateContent']}]});
   assert.match(url,/gemini-3.0-flash:generateContent/);return Response.json({candidates:[{content:{parts:[{text:'{"verified":true}'}]}}]});
  };
  assert.deepEqual(await generateProviderJson('Return JSON.','source evidence'),{verified:true});assert.equal(requests.length,3);
  requests.length=0;assert.deepEqual(await generateProviderJson('Return JSON.','source evidence'),{verified:true});assert.equal(requests.length,1,'Reuse the recovered model');
  globalThis.fetch=async()=>Response.json({error:'fixture-secret-key'},{status:401});
  await assert.rejects(generateProviderJson('JSON','evidence'),error=>error instanceof Error && error.message.includes('401') && !error.message.includes('fixture-secret-key'));
 }finally{globalThis.fetch=original;}
});
