import { database } from '../../config/db';
import { embed } from '../../ai/providers/llm.provider';
import { AppError } from '../../shared/errors';
import { Citation } from '../../shared/types';
import { Request, Response } from 'express';
import { z } from 'zod';
import { successResponse } from '../../shared/response';

export const SCHEME_ID = '518d8549-a22c-45bd-8a19-1484b42b30bd';
export const GUIDELINES_URL = 'https://scholarships.gov.in/public/schemeGuidelines/CSSS_GUIDLINES_07022024_updated.pdf';
export const FAQ_URL = 'https://scholarships.gov.in/public/schemeGuidelines/FAQ_DOHE_CSSS.pdf';

export async function retrievePolicyEvidence(question: string): Promise<Citation[]> {
  const db = await database();
  const vector = await embed(question).catch(() => null);
  const { rows } = await db.query<Citation & { rank: number; distance: number | null }>(`
    select p.title as source_document_name, c.metadata->>'section' as section, c.page_number as page,
           p.source_url as official_url, p.document_version, c.content as evidence,
           p.last_verified_at::date::text as verified_date,
           ts_rank(to_tsvector('english', c.content || ' ' || coalesce(c.metadata->>'keywords','')),
             websearch_to_tsquery('english', $2)) as rank,
           case when $3::vector is not null then c.embedding <=> $3::vector end as distance
    from public.document_chunks c join public.policy_documents p on p.id=c.policy_document_id
    where p.scheme_id=$1 and p.processing_status='INDEXED'
    order by rank desc, distance asc nulls last, c.chunk_index
  `, [SCHEME_ID, question, vector ? JSON.stringify(vector) : null]);
  const terms = question.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  const results = rows.map(({ rank, distance, ...source }) => ({
    source,
    score: rank + (distance !== null && distance < 0.66 ? (1 - distance) : 0) +
      terms.filter(term => source.evidence.toLowerCase().includes(term) &&
        !['the','and','can','what','which','for','how','are','have','should','want','need','eligible','apply'].includes(term)).length * 0.1,
  }));
  return results.sort((a,b) => b.score - a.score).filter(row => row.score > 0).slice(0,3).map(row => row.source);
}

export async function queryPolicy(req: Request, res: Response) {
  const body = z.object({ scheme_id: z.literal(SCHEME_ID).optional(), question: z.string().trim().min(1).max(1000) }).parse(req.body);
  const citations = await retrievePolicyEvidence(body.question);
  successResponse(res, {
    citations,
    answer: citations.map(c => c.evidence).join('\n\n') || 'I could not verify an answer in the indexed Ministry publications.',
  });
}

export async function getPolicyDocuments(_req: Request, res: Response) {
  const { rows } = await (await database()).query(
    "select id, scheme_id, title, source_url, document_version, last_verified_at from public.policy_documents where scheme_id=$1 and processing_status='INDEXED'",
    [SCHEME_ID],
  );
  successResponse(res, rows);
}

export async function indexCuratedVectors() {
  if (!process.env.EMBEDDING_API_KEY) throw AppError.badRequest('Set EMBEDDING_API_KEY before indexing.');
  const db = await database();
  const { rows } = await db.query<{ id: string; content: string }>(
    "select c.id,c.content from public.document_chunks c join public.policy_documents p on p.id=c.policy_document_id where p.scheme_id=$1", [SCHEME_ID]);
  for (const row of rows) {
    const vector = await embed(row.content);
    if (!vector) throw AppError.badRequest('Embedding service returned no valid vector.');
    await db.query('update public.document_chunks set embedding=$1::vector where id=$2', [JSON.stringify(vector),row.id]);
  }
  return rows.length;
}
