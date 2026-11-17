import { z } from 'zod';
import { EligibilityCondition, EligibilityResult } from '../../shared/types';

export const applicantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  institution_name: z.string().trim().min(2).max(180),
  course_name: z.string().trim().min(2).max(120),
  annual_family_income: z.number().int().min(0).max(1000000000),
  board_percentile: z.number().min(0).max(100),
  regular_degree: z.boolean(),
  recognized_institution: z.boolean(),
  other_scholarship: z.boolean(),
  gap_after_class_xii: z.boolean(),
  fresh_first_year: z.boolean(),
  board_listed: z.boolean(),
});
export type Applicant = z.infer<typeof applicantSchema>;

export function evaluateEligibility(input: Partial<Applicant>): EligibilityResult {
  const conditions: EligibilityCondition[] = [];
  function check(key: keyof Applicant, requirement: string, passed: boolean, evidence: string) {
    const value = input[key];
    const result = value === undefined ? 'MISSING' : passed ? 'PASS' : 'FAIL';
    conditions.push({
      condition: key, result, required_value: requirement, user_value: typeof value === 'boolean' ? String(value) : value ?? null, evidence,
      explanation: result === 'MISSING' ? 'Provide this detail to complete the screening.' :
        passed ? 'Meets the published condition.' : 'Falls outside the published condition.',
    });
  }
  check('annual_family_income','₹4,50,000 or less annually',(input.annual_family_income ?? Infinity) <= 450000,'PM-USP CSSS Guidelines §4(v)');
  check('board_percentile','Above the 80th board and stream percentile',(input.board_percentile ?? 0) > 80,'PM-USP CSSS Guidelines §4(i)');
  check('regular_degree','Regular degree course',input.regular_degree === true,'PM-USP CSSS Guidelines §4(ii)');
  check('recognized_institution','Recognized institution',input.recognized_institution === true,'PM-USP CSSS Guidelines §4(iii)');
  check('other_scholarship','No other scholarship, fee waiver or reimbursement',input.other_scholarship === false,'PM-USP CSSS Guidelines §4(iv)');
  check('gap_after_class_xii','No gap after Class XII',input.gap_after_class_xii === false,'PM-USP CSSS FAQs 2025–26, Q1');
  check('fresh_first_year','Completed Class XII in the prior academic year and entered the first year of a regular degree',input.fresh_first_year === true,'PM-USP CSSS FAQs 2025–26, Q10(a)');
  check('board_listed','Listed by the Class XII board as eligible for fresh PM-USP CSSS',input.board_listed === true,'PM-USP CSSS FAQs 2025–26, Q10(a)');
  const missing_fields = conditions.filter(c => c.result === 'MISSING').map(c => c.condition);
  const failed = conditions.some(c => c.result === 'FAIL');
  return { conditions, missing_fields,
    overall: failed ? 'NOT_ELIGIBLE' : missing_fields.length ? 'INSUFFICIENT_INFORMATION' : 'ELIGIBLE',
    summary: failed ? 'One or more published conditions were not met.' : missing_fields.length ?
      'Complete the missing details to continue.' : 'Your answers meet the indexed fresh-applicant criteria. Official selection is subject to verification and merit.' };
}
