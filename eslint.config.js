import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
export default [
  // Base configuration for all files
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'dist/**',
      '*.min.js',
      '*.bundle.js',
      '*.chunk.js',
      'public/**',
      '.cache/**',
      'coverage/**',
      '.nyc_output/**',
      'storybook-static/**',
      '.vscode/**',
      '.idea/**',
      '*.log',
      '.env*',
      '*.tsbuildinfo',
      'supabase/**',
      '.ruru/**',
      'scripts/**',
      'tests/**',
      'mivaa-pdf-extractor/**',
      'src/api/**',
      'src/pages/PDFProcessing.tsx',
      'src/debug/**',
      // GENERATED — `npm run types:generate` (supabase gen types) overwrites this
      // wholesale with double-quoted output. It accounted for 3007 of the 3014
      // `quotes` errors; auto-fixing it is pure churn that reverts on the next
      // schema change and would re-break the lint gate. Never lint generated code.
      'src/integrations/supabase/types.ts',
    ],
  },

  // TypeScript and React files
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      import: importPlugin,
    },
    rules: {
      // Basic JavaScript rules
      'no-console': 'off',
      'no-debugger': 'error',
      'no-unused-vars': 'off', // Handled by TypeScript

      // TypeScript rules - more lenient
      // Surface unused vars/imports as warnings (not errors so CI stays green).
      // Convention: prefix intentionally-unused names with `_` to silence.
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-var-requires': 'off',

      // React rules
      'react/react-in-jsx-scope': 'off', // Not needed in Next.js
      'react/prop-types': 'off', // Using TypeScript
      'react/display-name': 'off',
      'react/no-unescaped-entities': 'off',

      // React Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',

      // Import rules - basic only
      'import/no-unresolved': 'off', // TypeScript handles this
      'import/order': 'off',

      // Accessibility — WARN, ratcheted by scripts/check-a11y.mjs against
      // .github/a11y-baseline.json. They were ALL 'off' under a comment reading
      // "off for now", which is why the counts could only grow: every one of the 280
      // unnamed icon buttons and 72 mouse-only handlers was added AFTER the plugin was
      // installed. `warn` + a baseline that fails CI when a count RISES turns an unbounded
      // backlog into a monotonically shrinking one without blocking the build today.
      // Ratchet the numbers down; never edit them upward. (audit #302 finding 8)
      // At ZERO — promoted from warn to error so it can never regress. This is the workflow
      // the ratchet documents: drive a rule to 0, promote it, drop its baseline entry.
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-is-valid': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/label-has-associated-control': 'warn',
      // Configured with the ignore lists from the rule's OWN documentation, which the bare
      // 'warn' form does not apply.
      //
      // Without them the rule double-reports: it flagged 57 <input> and 18 <textarea> that
      // `label-has-associated-control` above already covers — and covers BETTER, because the
      // right fix for an input is a real <label htmlFor>, not an aria-label bolted onto the
      // control. Chasing those warnings would have produced 75 aria-labels papering over
      // missing labels.
      //
      // It also flagged 7 <tr>, 7 <video> and 4 <canvas>, none of which is a form control at
      // all. `th`/`td` are deliberately NOT ignored — an unlabelled header cell is a real (if
      // minor) defect, and those are fixed in the code rather than configured away.
      'jsx-a11y/control-has-associated-label': ['warn', {
        labelAttributes: ['label'],
        controlComponents: [],
        ignoreElements: ['audio', 'canvas', 'embed', 'input', 'textarea', 'tr', 'video'],
        ignoreRoles: [
          'grid', 'listbox', 'menu', 'menubar', 'radiogroup', 'row',
          'tablist', 'toolbar', 'tree', 'treegrid',
        ],
        depth: 5,
      }],
      'jsx-a11y/aria-props': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'warn',

      // Formatting - errors for auto-fix
      'quotes': ['error', 'single', { avoidEscape: true }],
      'semi': ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],
      'indent': 'off', // Too many conflicts with existing code
      'no-trailing-spaces': 'error',
      'eol-last': 'error',
    },
    settings: {
      react: {
        version: 'detect',
      },
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
  },

  // JavaScript files - very lenient
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      import: importPlugin,
    },
    rules: {
      // Very basic rules for JS files
      'no-console': 'off',
      'no-debugger': 'error',
      'no-unused-vars': 'off',
      'quotes': 'off',
      'semi': 'off',
      'comma-dangle': 'off',
      'indent': 'off',
      'no-trailing-spaces': 'off',
      'eol-last': 'off',
    },
  },

  // Configuration files
  {
    files: ['*.config.{js,ts}', '*.config.*.{js,ts}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
