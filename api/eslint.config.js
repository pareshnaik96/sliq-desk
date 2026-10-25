// ESLint flat config using only core ESLint rules (no plugins or shared configs).
// Formatting is Prettier's job, so no stylistic rules are enabled here.

const nodeGlobals = Object.fromEntries(
  [
    'process',
    'Buffer',
    'console',
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'URL',
    'URLSearchParams',
    'fetch',
  ].map((name) => [name, 'readonly']),
);

/**
 * Tenant isolation guard: Mongoose and the models may only be touched from the
 * persistence layer. Routes, services, policies, jobs and realtime code must go
 * through the repositories, which always scope by orgId.
 */
const persistenceOnly = {
  paths: [
    {
      name: 'mongoose',
      message: 'Use a repository from src/repositories instead of Mongoose directly.',
    },
  ],
  patterns: [
    {
      group: ['**/models', '**/models/*', '**/models/*.js'],
      message: 'Models may only be imported from src/repositories (tenant isolation).',
    },
  ],
};

export default [
  { ignores: ['node_modules/**', 'coverage/**'] },
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: nodeGlobals },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-fallthrough': 'error',
      'no-self-assign': 'error',
      'no-cond-assign': 'error',
      'no-empty': 'error',
      'no-redeclare': 'error',
      'no-import-assign': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['src/**/*.js'],
    ignores: ['src/repositories/**', 'src/models/**', 'src/db/**'],
    rules: { 'no-restricted-imports': ['error', persistenceOnly] },
  },
];
