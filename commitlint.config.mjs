/**
 * Conventional Commits, enforced on every commit message and on PR titles
 * (squash merges take the PR title as the commit subject, so CI lints it too).
 */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 100],
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ],
    ],
    "scope-enum": [
      2,
      "always",
      [
        "domain",
        "db",
        "auth",
        "api",
        "ui",
        "charts",
        "jobs",
        "email",
        "docs",
        "ci",
        "deps",
        "config",
        "test",
        "release",
        "",
      ],
    ],
  },
};

export default config;
