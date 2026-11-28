import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractDocumentText } from '../../shared/document-text';

// Literal executable + argument array: source names/URLs never become shell commands.
// Bound scan work and retain the incomplete flag for any pages not inspected.
export async function ocrGovernmentPdf(bytes:Buffer,pages:number) {
 const directory=await mkdtemp(join(tmpdir(),'janaseva-official-pdf-'));
 const input=join(directory,'source.pdf'),output=join(directory,'page');
 const limit=Math.min(pages,5);const text:string[]=[];
 try{
  await writeFile(input,bytes);
  for(let page=1;page<=limit;page++){
   await promisify(execFile)('pdftoppm',['-f',String(page),'-l',String(page),'-r','120','-scale-to','1800','-png','-singlefile',input,output],{timeout:25000,windowsHide:true,maxBuffer:65536});
   text.push(await extractDocumentText(await readFile(output+'.png'),'image/png'));
  }
  return {text:text.join('\n'),partial:pages>limit};
 }finally{await rm(directory,{recursive:true,force:true});}
}
