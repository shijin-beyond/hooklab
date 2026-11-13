import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "web/dist/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Tests may assert shape after explicit length checks; keep src strict.
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  prettier,
);
