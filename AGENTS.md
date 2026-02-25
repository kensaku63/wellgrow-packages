# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a monorepo for [WellGrow](https://wellgrow.ai) external packages. The primary development target is `@wellgrow/cli` located in `cli/`. The `skills/` directory contains plain markdown skill files with no build step.

### Key commands (all run from `cli/`)

| Task | Command |
|------|---------|
| Install deps | `pnpm install` |
| Build | `pnpm build` |
| Dev (watch mode) | `pnpm dev` |
| Run tests | `pnpm test` |
| Type check | `pnpm typecheck` |
| Run CLI | `node dist/index.js` |

### Notes

- **esbuild build scripts**: `pnpm.onlyBuiltDependencies` in `cli/package.json` whitelists esbuild. Without this, `tsup` (the bundler) will fail because esbuild's platform-specific binary won't be installed.
- **TypeScript errors**: `pnpm typecheck` currently has pre-existing type errors in test files and a few source files. These do not block `pnpm build` or `pnpm test`.
- **Test failures**: 1 pre-existing test failure in `src/__tests__/extensions/mcp.test.ts` (`getAllToolSets returns empty map when no connections`). All other 389 tests pass.
- **API keys for runtime**: The interactive chat mode requires an `ANTHROPIC_API_KEY` (default provider). Alternative providers (`GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`) are optional. These are NOT needed for build or tests.
- **CLI init**: Run `node dist/index.js init` to set up default agents and manual files under `~/.wellgrow/`.
- **No Docker/DB required**: This is a pure client-side CLI tool. No databases or containerized services are needed.
