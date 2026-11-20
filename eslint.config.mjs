// ESLint (conventions: code/formatting): typescript-eslint's recommended rules, Prettier owns the layout. The data layer's boundary
// (conventions: architecture/data-layer): only src/db/ holds the database client, the query builder and the migrations.
import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", ".superpowers/"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    ignores: ["src/db/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "better-sqlite3", message: "Only src/db/ talks to the database; use rt.store." },
            { name: "kysely", message: "Only src/db/ builds queries; use rt.store.", allowTypeImports: true },
          ],
        },
      ],
    },
  },
  { files: ["*.mjs"], languageOptions: { globals: { process: "readonly" } } },
  prettier,
);
