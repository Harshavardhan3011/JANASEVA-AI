import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEligibility } from '../modules/eligibility/eligibility.engine';

export const eligible = {
  name:'Asha Student',institution_name:'Example College',course_name:'B.Sc.',
  annual_family_income:450000,board_percentile:80.1,regular_degree:true,
  recognized_institution:true,other_scholarship:false,gap_after_class_xii:false,fresh_first_year:true,board_listed:true,
};

test('the income ceiling is inclusive while the 80th percentile is exclusive',() => {
  assert.equal(evaluateEligibility(eligible).overall,'ELIGIBLE');
  assert.equal(evaluateEligibility({...eligible,board_percentile:80}).overall,'NOT_ELIGIBLE');
  assert.equal(evaluateEligibility({...eligible,annual_family_income:450001}).overall,'NOT_ELIGIBLE');
  assert.equal(evaluateEligibility({...eligible,annual_family_income:0}).overall,'ELIGIBLE');
});
test('missing facts differ from failed conditions',() => {
  assert.equal(evaluateEligibility({}).overall,'INSUFFICIENT_INFORMATION');
  assert.equal(evaluateEligibility({...eligible,gap_after_class_xii:true}).overall,'NOT_ELIGIBLE');
  assert.equal(evaluateEligibility({...eligible,other_scholarship:true}).overall,'NOT_ELIGIBLE');
  assert.equal(evaluateEligibility({...eligible,recognized_institution:false}).overall,'NOT_ELIGIBLE');
  assert.equal(evaluateEligibility({...eligible,regular_degree:false}).overall,'NOT_ELIGIBLE');
});
