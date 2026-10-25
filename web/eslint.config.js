// ESLint flat config using only core ESLint rules (no plugins or shared configs).
// Formatting is Prettier's job, so no stylistic rules are enabled here.

const readonly = (names) => Object.fromEntries(names.map((name) => [name, 'readonly']));

const browserGlobals = readonly([
  'window',
  'document',
  'navigator',
  'console',
  'fetch',
  'URLSearchParams',
  'FormData',
  'setTimeout',
  'clearTimeout',
]);

// Core no-unused-vars can't see components used only as JSX tags (<TicketCard />).
// This tiny local rule marks those names as used, so unused imports are still caught.
const jsxUsesVars = {
  create(context) {
    return {
      JSXOpeningElement(node) {
        let name = node.name;
        while (name.type === 'JSXMemberExpression') name = name.object; // <Ctx.Provider>
        if (name.type === 'JSXIdentifier') context.sourceCode.markVariableAsUsed(name.name, node);
      },
    };
  },
};

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['**/*.{js,jsx}'],
    plugins: { local: { rules: { 'jsx-uses-vars': jsxUsesVars } } },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: browserGlobals,
    },
    rules: {
      'local/jsx-uses-vars': 'error',
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
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
    // Build config runs in Node.
    files: ['vite.config.js'],
    languageOptions: { globals: readonly(['process']) },
  },
];
