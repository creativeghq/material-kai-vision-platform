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
      // Cloudflare Worker (#342 inbound email). A different runtime with its own ambient types,
      // deliberately outside tsconfig.json and dependency-free — wrangler bundles it with esbuild
      // and does not typecheck it. Typed linting therefore cannot resolve it ("was not found by
      // the project service") and failed the whole pipeline, lint included, on every push.
      // It is not unguarded: tests/security/inbound-email-isolation.test.ts greps this source and
      // fails the build if tenancy resolution ever appears in it.
      'cloudflare/**',
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

      // Accessibility — ALL AT ZERO, ALL 'error'. (audit #302)
      //
      // These were every one of them 'off', under a comment reading "off for now", while the
      // plugin sat installed and registered. That is how the backlog reached 407: every unnamed
      // icon button and every mouse-only handler was added AFTER the tool that would have caught
      // it was switched off. The failure was never a missing tool.
      //
      // The route back was: turn them on as 'warn', let .github/a11y-baseline.json absorb the
      // existing count so the build was not red on day one, then ratchet each rule to 0 and
      // promote it to 'error'. That is now finished — the baseline is empty and every rule is an
      // error, so a new violation fails the build instead of joining a queue.
      //
      // NEVER move one of these back to 'warn' or 'off' to get a build green. The whole 407 came
      // from exactly that decision, made once. tests/unit/a11yRatchet.test.ts fails if you do.
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
      // `controlComponents` names the custom components that ARE form controls. Without it the
      // rule cannot see through <Checkbox>/<Switch>/<Slider>/<RadioGroup> and reports every
      // `<label><span>Text</span><Switch/></label>` as unlabelled — 37 of them here.
      //
      // That markup is already correct: Radix renders a labelable <button role="switch">, the
      // wrapping <label> names it, and clicking the label toggles it. The alternative "fix" was
      // 37 hand-minted ids, and several of these labels sit inside .map() loops where a static id
      // would be DUPLICATED across rows — an id collision is a worse defect than the warning.
      //
      // This only relaxes the NESTING form. A label that is merely a SIBLING of a <Checkbox>
      // still fails, which is the shape that is genuinely broken and is fixed in the code.
      //
      // `depth` is how far down the label's subtree the rule looks for its TEXT. The default of 2
      // misses `<label><Button asChild><span>Browse Files</span></Button></label>`, where the text
      // is real and visible but sits under two wrappers.
      // At ZERO — promoted to error (see alt-text above).
      'jsx-a11y/label-has-associated-control': ['error', {
        controlComponents: ['Checkbox', 'Switch', 'Slider', 'RadioGroup', 'Toggle'],
        depth: 4,
      }],
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
      'jsx-a11y/control-has-associated-label': ['error', {
        labelAttributes: ['label'],
        controlComponents: [],
        // The documented list, plus two of our own:
        //   option — inside a <datalist>, `<option value="x" />` is the CORRECT idiom; the browser
        //     renders the value as the suggestion. "Fixing" those by adding label text would have
        //     been wrong, not merely unnecessary.
        //   td     — a data cell is not a control, and an empty one is ordinary table structure
        //     (spacers, alignment). <th> is deliberately NOT here: a blank column header really
        //     does get announced as nothing, so those are fixed in the markup.
        ignoreElements: ['audio', 'canvas', 'embed', 'input', 'option', 'td', 'textarea', 'tr', 'video'],
        ignoreRoles: [
          'grid', 'listbox', 'menu', 'menubar', 'radiogroup', 'row',
          'tablist', 'toolbar', 'tree', 'treegrid',
        ],
        depth: 5,
      }],
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',

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
