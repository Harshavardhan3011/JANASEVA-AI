// Public CA only. Never relax TLS verification or print database connection strings.
const {X509Certificate}=require('node:crypto');
const {writeFile}=require('node:fs/promises');
const officialUrl='https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt';
const expected='80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';
async function main(){
 const response=await fetch(officialUrl,{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Official Supabase CA download failed.');
 const pem=await response.text();if(pem.length>16000)throw Error('Unexpected CA size.');
 const certificate=new X509Certificate(pem);
 if(!certificate.ca || certificate.fingerprint256!==expected || Date.parse(certificate.validTo)<Date.now()+86400000)throw Error('Supabase CA verification failed; review the official certificate before updating the pin.');
 await writeFile(process.argv[2] || '/tmp/supabase-ca.crt',pem,{mode:0o644});
 console.log('Verified Supabase database CA installed.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
