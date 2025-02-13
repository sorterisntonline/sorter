module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["dist", ".eslintrc.cjs"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: ["./tsconfig.json", "./tsconfig.node.json"],
    tsconfigRootDir: ".",
    ecmaFeatures: {
      jsx: true,
    },
  },
  settings: {
    react: { version: "18.2" },
  },
  plugins: ["react-refresh", "@typescript-eslint", "react"],
  rules: {
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
    "@typescript-eslint/no-explicit-any": "warn",
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      },
    ],
    "no-unused-vars": "off",
    "react/no-unescaped-entities": "off",
    "react/no-unknown-property": "off",
    "react/jsx-key": "warn",
    "react-hooks/exhaustive-deps": "warn",
  },
  reportUnusedDisableDirectives: true,
  overrides: [
    {
      files: ["*.js", "*.jsx", "*.cjs"],
      rules: {
        "@typescript-eslint/no-unused-vars": "off",
        "no-unused-vars": [
          "warn",
          {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
            ignoreRestSiblings: true,
          },
        ],
      },
    },
    {
      files: ["vite.config.ts", "tailwind.config.js", "vite.config.js"],
      parserOptions: {
        project: ["./tsconfig.node.json"],
      },
    },
  ],
};
