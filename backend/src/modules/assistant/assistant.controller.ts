import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { classify } from '../../ai/providers/llm.provider';
import { database } from '../../config/db';
import { successResponse } from '../../shared/response';
import { AppError } from '../../shared/errors';
import { retrievePolicyEvidence, SCHEME_ID } from '../policy/policy.controller';

export async function chat(req: Request, res: Response) {
  const input = z.object({ message:z.string().trim().min(1).max(1500), conversation_id:z.uuid().optional() }).parse(req.body);
  const userId = req.user!.id;
  const db = await database();
  if (input.conversation_id) {
    const { rows } = await db.query('select id from public.conversations where id=$1 and user_id=$2', [input.conversation_id,userId]);
    if (!rows.length) throw AppError.notFound('Conversation not found');
  }
  const intent = await classify(input.message);
  const evidenceQuery = {
    discover: 'family income percentile regular degree',
    eligibility: 'family income percentile regular degree',
    documents: 'income certificate documents verification',
    policy: input.message,
    unknown: '',
  }[intent];
  const citations = evidenceQuery ? await retrievePolicyEvidence(evidenceQuery) : [];
  const response = {
    conversation_id: input.conversation_id ?? randomUUID(),
    reply: citations.length
      ? ['PM-USP CSSS supports college and university students. ', ...citations.map(c => c.evidence),
         intent === 'documents' ? 'The demo asks for an income certificate and a Class XII marksheet for the evidence review.' :
         'You can open a guided application to check the criteria against your details.'].join('\n\n')
      : 'I could not verify an answer for that request. This workspace supports fresh applications for PM-USP CSSS. Try asking about income, board percentile, required documents or scholarship amounts.',
    citations,
    scheme_id: citations.length ? SCHEME_ID : null,
    suggested_actions: [],
  };
  await db.query(`insert into public.conversations(id,user_id,turns) values($1,$2,$3)
      on conflict (id) do update set turns=conversations.turns || excluded.turns, updated_at=now()
      where conversations.user_id=excluded.user_id`, [
    response.conversation_id,userId,JSON.stringify([{ message:input.message, ...response, at:new Date().toISOString() }]),
  ]);
  successResponse(res,response);
}

export async function conversations(req: Request, res: Response) {
  const { rows } = await (await database()).query(
    "select id, turns->0->>'message' as title, updated_at from public.conversations where user_id=$1 order by updated_at desc",
    [req.user!.id]);
  successResponse(res, rows);
}
export async function conversation(req: Request, res: Response) {
  const { rows:[entry] } = await (await database()).query(
    'select id, turns, updated_at from public.conversations where id=$1 and user_id=$2',
    [z.uuid().parse(req.params.id),req.user!.id]);
  if (!entry) throw AppError.notFound('Conversation not found');
  successResponse(res, entry);
}
