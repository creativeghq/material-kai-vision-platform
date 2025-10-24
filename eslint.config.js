import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import nextPlugin from '@next/eslint-plugin-next';

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
      '@next/next': nextPlugin,
    },
    rules: {
      // Basic JavaScript rules
      'no-console': 'off',
      'no-debugger': 'error',
      'no-unused-vars': 'off', // Handled by TypeScript

      // TypeScript rules - more lenient
      '@typescript-eslint/no-unused-vars': 'off',
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

      // Accessibility - off for now
      'jsx-a11y/alt-text': 'off',
      'jsx-a11y/anchor-is-valid': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',

      // Formatting - warnings only
      'quotes': ['warn', 'single', { avoidEscape: true }],
      'semi': ['warn', 'always'],
      'comma-dangle': ['warn', 'always-multiline'],
      'indent': 'off', // Too many conflicts with existing code
      'no-trailing-spaces': 'warn',
      'eol-last': 'warn',
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
