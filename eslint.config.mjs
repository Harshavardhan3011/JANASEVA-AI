import tsParser from '@typescript-eslint/parser';

const rules = {
  'no-debugger': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
};
export default [
  { ignores: ['**/dist/**','**/.data/**','**/node_modules/**'] },
  { files:['backend/src/**/*.ts','frontend/src/**/*.{ts,tsx}'],
    languageOptions:{ parser:tsParser,parserOptions:{ ecmaFeatures:{ jsx:true } } },rules },
  { files:['mock-portal/**/*.js','database/**/*.js'],rules },
];
