# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project purpose

A learning/demo repo for the **Web Speech API** (语音识别 `SpeechRecognition` + 语音合成 `SpeechSynthesis`), built on the official `vue-ts` scaffold. The scaffold's boilerplate (`HelloWorld`, `TheWelcome`, `AboutView`, `stores/counter.ts`) has been deleted — `src/` now contains only real project code.

Current state: the **语音合成 (SpeechSynthesis)** demo is done and lives at route `/synthesis` (`src/views/SpeechSynthesisView.vue`). 语音识别 is not started yet.

## Commands

Package manager is **pnpm** (lockfile v9). There is no `packageManager` field in `package.json`, so corepack will not pin a version — use whatever pnpm is on PATH.

| Task | Command |
| --- | --- |
| Dev server | `pnpm dev` (Vite, `http://localhost:5173`) |
| Production build | `pnpm build` (runs `type-check` + `build-only` in parallel) |
| Build without type-check | `pnpm build-only` |
| Type check | `pnpm type-check` (`vue-tsc --build`, incremental) |
| Lint + autofix | `pnpm lint` (oxlint, then eslint — both `--fix`) |
| Format | `pnpm format` (`oxfmt src/`) |
| Preview a production build | `pnpm preview` |

- **No test runner is installed.** `vitest` / `cypress` / `playwright` appear only as glob patterns in `tsconfig.node.json`'s `include` and in `.gitignore` — they are not dependencies. There is no `pnpm test`.
- Node engine: `^22.18.0 || >=24.12.0`.
- `pnpm lint` and `pnpm format` **rewrite files in place**. Run them before committing.

## Architecture

- **Vue 3.5, `<script setup lang="ts">` everywhere.** Single-file components, no Options API.
- **Routing** — `src/router/index.ts`, `createWebHistory(import.meta.env.BASE_URL)`. Route-level code splitting via dynamic `import()` (pattern in the `about` route).
- **State** — Pinia 4, registered in `src/main.ts`. Only `src/stores/counter.ts` (template demo) exists so far.
- **Path alias** — `@` → `src`, declared in *both* `vite.config.ts` (`resolve.alias`) and `tsconfig.app.json` (`paths`). Import as `@/foo/bar`, never `../../foo/bar`.
- **TS project references** — root `tsconfig.json` is a solution file pointing at `tsconfig.app.json` (DOM lib) and `tsconfig.node.json` (Node/tooling config files). `vue-tsc --build` type-checks both.
- `tsconfig.app.json` extends `@vue/tsconfig/tsconfig.dom.json` and enables **`noUncheckedIndexedAccess`** — array index access is typed `T | undefined`. This bites directly in speech code, where `results[i]` and `alternatives[j]` are the normal access pattern.
- **Global design tokens** live in `src/assets/base.css` (`--color-text`, `--color-heading`, `--color-border`, `--color-background-mute`, plus the raw `--vt-c-*` palette). `base.css` also carries the `prefers-color-scheme: dark` overrides and the global reset; `src/assets/main.css` is imported once in `main.ts` and only adds `#app` sizing. Use the semantic `--color-*` tokens in components rather than the raw `--vt-c-*` palette, so dark mode keeps working.
- `vite-plugin-vue-devtools` is enabled in `vite.config.ts` and injects its overlay during `pnpm dev`.

## Tooling conventions

- The formatter is **oxfmt, not Prettier**: `semi: false`, `singleQuote: true` (`.oxfmtrc.json`). VS Code's default formatter is `oxc.oxc-vscode`. Do not introduce Prettier-formatted style (no semicolons, single quotes).
- **ESLint** is flat config (`eslint.config.ts`): `@vue/eslint-config-typescript` + `eslint-plugin-vue` (`flat/essential`) + `eslint-plugin-oxlint` (which reads `.oxlintrc.json`), with `eslint-config-prettier/flat` applied last to switch off formatting rules.
- `.oxlintrc.json` enables plugins `eslint, typescript, unicorn, oxc, vue` and treats the `correctness` category as error.
- No Cursor rules (`.cursor/`) and no Copilot instructions (`.github/`) exist in this repo.

## Web Speech API specifics

The point of this repo — read this before writing any speech code.

### TypeScript gap

TypeScript 6.0's `lib.dom.d.ts` provides:

- ✅ `SpeechSynthesis`, `SpeechSynthesisUtterance`, `SpeechSynthesisVoice`, `SpeechSynthesisEvent`, `SpeechSynthesisErrorEvent` (the `SpeechSynthesisErrorCode` union in TS 6 misspells `"language-unavailable"` as `"language&available"` and omits the correct spelling — do not exhaustively switch on that union)
- ✅ recognition **data/event** types: `SpeechRecognitionEvent`, `SpeechRecognitionResult`, `SpeechRecognitionResultList`, `SpeechRecognitionAlternative`, `SpeechRecognitionErrorEvent`, `SpeechRecognitionErrorCode`
- ❌ **not** the `SpeechRecognition` **controller** interface, and not `SpeechGrammarList` / `SpeechGrammar`

`new SpeechRecognition()` is therefore a compile error out of the box. An ambient declaration file is required (e.g. `src/types/speech.d.ts`) covering the controller's `start()` / `stop()` / `abort()`, the `lang` / `continuous` / `interimResults` / `maxAlternatives` / `grammars` / `processLocally` properties, and the `on*` event-handler properties. Do **not** add `@types/dom-speech-recognition` — it redeclares types the DOM lib already ships and will conflict.

### Runtime / browser realities

- `SpeechRecognition` is Chromium-only in practice (Chrome, Edge; Safari 14.1+ only through the `webkitSpeechRecognition` prefix). Feature-detect **both** `window.SpeechRecognition` and `window.webkitSpeechRecognition` before use.
- Chrome's recognition is **cloud-backed** — audio is streamed to Google servers. Offline ⇒ `network` error. Mic permission denied ⇒ `not-allowed`. Silence ⇒ `no-speech`. No microphone ⇒ `audio-capture`. `SpeechRecognitionErrorCode` covers all of these plus `aborted`, `language-not-supported`, `phrases-not-supported`, `service-not-allowed`.
- Requires a **secure context** (`https` or `localhost`) and explicit microphone permission. Permission is per-origin and can only be re-prompted after the user clears site data — so handle `not-allowed` as a terminal state, not a retryable one.
- `SpeechSynthesis.getVoices()` is **asynchronous** — the first call usually returns `[]`, and the real list arrives via the `voiceschanged` event. Never assume a populated voice list on mount.
- Chrome silently truncates a single utterance longer than ~15 seconds. Workarounds: split long text into sentences and queue them, or periodically `pause()` / `resume()`.
- `continuous = true` sessions stop on their own — Chrome ends the stream after a period of silence, so `onend` fires and the app must decide whether to restart.
- `interimResults = true` emits partial hypotheses that are later superseded by the final result; keep interim and final text in separate buffers.
