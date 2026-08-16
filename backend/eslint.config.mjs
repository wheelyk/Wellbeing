import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/**", "src/generated/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Express handlers here already use a leading underscore for intentionally-unused
      // parameters (e.g. `(_req, res) => ...` in app.ts/auth.ts) - this tells the rule that's
      // a deliberate convention, not something to flag.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  eslintConfigPrettier,
);
