const js = require("@eslint/js");
const tseslint = require("@typescript-eslint/eslint-plugin");
const tsparser = require("@typescript-eslint/parser");
const prettierConfig = require("eslint-config-prettier");
const globals = require("globals");

module.exports = [
  {
    // src/generated is rewritten by `npm run generate` from openapi.json (weekly,
    // via the upstream watch), so lint findings there cannot be fixed by hand.
    ignores: ["dist/**", "node_modules/**", "coverage/**", "*.js", "src/generated/**"],
  },
  js.configs.recommended,
  ...tseslint.configs["flat/recommended"],
  ...tseslint.configs["flat/strict"],
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
        project: "./tsconfig.json",
      },
      globals: {
        ...globals.node,
        ...globals.es2020,
      },
    },
    rules: {
      // The codebase deliberately uses static-only classes as namespaces
      // (DhanAuth) and constructor-only classes as composition roots
      // (GeneratedClient) — both intentional, not style slips.
      "@typescript-eslint/no-extraneous-class": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      // ignoreRestSiblings: `const { secret: _secret, ...rest } = obj` is the
      // idiom for dropping a key, not an unused variable.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      curly: ["error", "all"],
      "prefer-const": "error",
    },
  },
  {
    files: ["spec/**/*.ts", "**/*.spec.ts", "**/*.test.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },
  prettierConfig,
];
