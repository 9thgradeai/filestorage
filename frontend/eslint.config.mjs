import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'public/**',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      // Standard fetch-on-mount / data-loading-in-effect patterns are used
      // across the app; this React-19 rule is too aggressive for them.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];

export default eslintConfig;