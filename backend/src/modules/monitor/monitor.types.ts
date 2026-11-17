import { z } from 'zod';

export const categories = ['Agriculture','Education','Employment','Finance','Health','Housing','Infrastructure','Social welfare','Other'] as const;
export const coverageLevels = ['National','State','District','Village'] as const;
const text = (max: number) => z.string().trim().max(max);
export const officialUrl = z.url({ protocol: /^https$/ }).refine(value => {
  const url = new URL(value);
  return !url.username && !url.password && !url.port && /\.(gov|nic)\.in$/i.test(url.hostname);
},'Use an HTTPS government website ending in gov.in or nic.in.');

export const draftSchema = z.object({
  title: text(255).min(3),
  issuer: text(255).min(2),
  description: text(2000).default(''),
  category: z.enum(categories).default('Other'),
  level: z.enum(coverageLevels),
  state: text(120).default(''),
  district: text(120).default(''),
  village: text(120).default(''),
  sourceUrl: officialUrl.nullable().default(null),
  applyUrl: officialUrl.nullable().default(null),
  deadline: z.iso.date().nullable().default(null),
  eligibility: text(1200).default(''),
  benefits: text(1200).default(''),
});

export const publishSchema = draftSchema.superRefine((draft, context) => {
  for (const [field, required] of [
    ['sourceUrl', true], ['state', draft.level !== 'National'],
    ['district', draft.level === 'District' || draft.level === 'Village'], ['village', draft.level === 'Village'],
  ] as const) {
    if (required && !draft[field]) context.addIssue({ code:'custom', path:[field], message:'Required to publish.' });
  }
});

export type Draft = z.infer<typeof draftSchema>;
export type FeedType = 'pib_rss' | 'state_profile' | 'district_catalog';
export const sourceConfigSchema = z.object({
  title: text(255).optional(),
  state: text(120).optional(),
  district: text(120).optional(),
  category: z.enum(categories).optional(),
  description: text(2000).optional(),
});
export interface Source {
  id: string;
  label: string;
  url: string;
  feed_type: FeedType;
  interval_minutes: number;
  source_config: unknown;
}
export interface Observation {
  reference: string;
  draft: Draft;
  evidence: string;
  autoPublish: boolean;
}
