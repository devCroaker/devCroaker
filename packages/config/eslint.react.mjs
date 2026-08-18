import globals from 'globals';
import base from './eslint.config.mjs';

/**
 * Shared ESLint config for React / Next.js packages.
 * Next.js rules are layered on top of this by each app via eslint-config-next.
 */
export default [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
];
