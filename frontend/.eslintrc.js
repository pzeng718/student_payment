module.exports = {
  root: true,
  extends: [
    'react-app',
    'react-app/jest'
  ],
  rules: {
    // Relax some common strict rules
    'no-console': 'warn', // Allow console statements but warn
    'no-debugger': 'warn', // Allow debugger but warn
    'no-unused-vars': 'warn', // Allow unused vars but warn

    // Relax React-specific rules
    'react-hooks/exhaustive-deps': 'warn', // Allow incomplete deps but warn
    'react/prop-types': 'off', // Turn off prop-types validation (using TypeScript)
    'react/react-in-jsx-scope': 'off', // Not needed in React 17+

    // Relax formatting rules that might be handled by Prettier
    'indent': 'off',
    'quotes': 'off',
    'semi': 'off',
    'comma-dangle': 'off',

    // Allow common patterns
    'jsx-a11y/alt-text': 'warn', // Allow missing alt text but warn
    'jsx-a11y/anchor-is-valid': 'warn', // Allow invalid anchors but warn

    // Turn off overly strict rules
    'no-shadow': 'off',
    'prefer-const': 'warn', // Allow let where const isn't appropriate but warn
    'no-var': 'warn' // Allow var but warn
  },
  settings: {
    react: {
      version: 'detect'
    }
  }
};
