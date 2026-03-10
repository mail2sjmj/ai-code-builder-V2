# Frontend Agent Prompt — AI Code Builder

> **Purpose:** Strategic design and development guide for building the React/TypeScript frontend.
> This document describes *what* to build and *why*, not *how* to code it line-by-line.
> Follow every section in order. Consult `AGENT_GUIDE.md` for exact implementation details.

---

## 1. Understand the Application

This frontend drives a **linear 5-step workflow** plus **library and caching features**:

### Core Workflow
| Step | What the user does | UI element unlocked |
|---|---|---|
| 1 | Drops a CSV or XLSX file | File upload zone (Pilot sidebar) |
| 2 | Types transformation instructions | Instruction panel (main content) |
| 3 | Clicks "Refine" — AI rewrites instructions | Refined prompt box; code gen panel |
| 4 | Clicks "Generate Code" — AI writes Python | Monaco editor (Source Console) |
| 5 | Clicks "Run" — previews output, downloads CSV | Execution panel, results table |

The UI enforces this order — sections are conditionally rendered based on workflow progress.
Never show a section the user hasn't earned yet. Never skip a step.

### Library & Caching Features (always accessible)

- **Instructions Library** (right sidebar) — save/load/delete named instruction templates. Loading an instruction checks the Code Cache for previously generated code, restoring it instantly if found.
- **Code Library** (right sidebar) — save/load/delete/share named Python snippets. Code can be public or private. Loading a snippet resets the Monaco editor via `loadKey` increment.
- **Code Cache** (transparent) — automatically records `label → {code, raw_instructions, refined_prompt}` when the user saves to the instructions library. Queried silently when loading instructions.
- **File Summary Modal** — launched from the Pilot sidebar; shows per-column statistics for the uploaded dataset.

---

## 2. Technology Stack

| Concern | Library | Why |
|---|---|---|
| UI framework | React 18 | Concurrent rendering; hooks-based; industry standard |
| Language | TypeScript 5.5, strict mode | Catch type errors at compile time; `noUnusedLocals` enforced |
| Build tool | Vite 5 | Fast HMR; built-in `/api` proxy to backend |
| State management | Zustand 4 | Minimal boilerplate; no provider wrapping; store-per-concern |
| Server state | TanStack React Query 5 | Manages mutation loading/error state; used for file upload |
| HTTP client | Axios 1.7 | Used for all non-streaming endpoints |
| Streaming | Native `fetch` + `ReadableStream` | Axios cannot read SSE streams progressively — do not use it for SSE |
| Code editor | `@monaco-editor/react` 4 | VS Code-quality editor; Python syntax highlighting |
| Icons | Lucide React | Consistent icon set; tree-shakeable |
| Toasts | Sonner | Accessible, minimal toast notifications |
| Styling | Tailwind CSS 3 + CSS custom properties | Utility-first; design tokens via HSL variables |
| Testing | Vitest 2 + Testing Library | Co-located with Vite; compatible with jsdom |

Do not introduce additional libraries without justification. In particular, do not add
a routing library — this is a single-page app with no URL-based navigation.

---

## 3. Project Structure Strategy

Organise `src/` into these concerns — one directory per concern:

- **`config/`** — All magic numbers and environment values in `app.config.ts`. No hardcoded URLs, timeouts, or limits anywhere else.
- **`types/`** — API DTOs in `api.types.ts`. Mirror the backend Pydantic schemas exactly. One source of truth.
- **`services/`** — Axios client setup only. No business logic here.
- **`utils/`** — Stateless pure functions: SSE stream parser, file validator, value formatters, toast helpers.
- **`store/`** — Zustand stores. One store per concern: session, instructions, code, execution.
- **`hooks/`** — Custom hooks. One hook per backend interaction. Hooks call stores and utils; they do not contain UI.
- **`components/layout/`** — App shell: header, workflow stepper.
- **`components/upload/`** — Upload zone, file metadata card.
- **`components/instructions/`** — Raw input box, refined prompt display, panel wrapper.
- **`components/codegen/`** — Monaco editor wrapper, code generation panel.
- **`components/execution/`** — Run controls, output preview table, download button.
- **`components/shared/`** — Reusable primitives: status badge, error boundary.

**Key rule:** Components read from stores; they do not call the API directly. That is the
hook's job. Hooks do not render anything. Stores do not import from components or hooks.

---

## 4. Configuration Design

**Strategy: one config object, all values in one place, nothing hardcoded elsewhere.**

Create `src/config/app.config.ts` as a single exported `APP_CONFIG` constant covering:

- API base URL (from `import.meta.env.VITE_API_BASE_URL` with fallback to empty string `''`)
- API prefix path and request timeout
- Upload constraints (max file size in MB, allowed extensions, allowed MIME types)
- Editor options (theme, language, font size, minimap, word wrap)
- Preview row count
- Execution polling interval and max attempts

Every other file that needs a config value imports from here. This makes changing
a value a one-line edit in one place.

---

## 5. State Management Design

**Strategy: four Zustand stores, one per workflow concern. Flat shape. No nesting.**

### Session Store
Tracks `sessionId`, file metadata, and `currentStep` (1–5).
- `setSession(id, meta)` — called after a successful upload; advances step to 2.
- `advanceStep(to)` — only moves forward, never backward.
- `reset()` — clears everything; returns to step 1. Called when the user removes the file.

### Instruction Store
Tracks `rawInstructions`, `refinedPrompt`, `isRefining`, plus library/cache fields.
- `setRawInstructions(text)` — bound to textarea `onChange`; clears `isFromCache` and `instructionsOutOfSync`.
- `appendRefinedChunk(chunk)` — called by SSE stream consumer as chunks arrive.
- `activeSavedLabel` — the label of the currently-loaded saved instruction (used for cache lookup).
- `isFromCache` — `true` when the current code was loaded from cache (not freshly generated).
- `instructionsOutOfSync` — `true` when instructions were edited after code was generated.
- `loadCachedState(raw, refined, label)` — atomically restores cached instruction+prompt+label.

### Code Store
Tracks `generatedCode`, `editedCode`, `isGenerating`, and `loadKey`.
- `loadKey` — an incrementing counter used as `key={loadKey}` on the Monaco editor to force full remount when new code is loaded. **Critical:** always use `setGeneratedCode('')` (not `resetCode()`) at the start of a load operation because only `setGeneratedCode` increments `loadKey`.
- `generatedCode` and `editedCode` start identical; user may edit `editedCode` after generation.
- `appendCode(chunk)` — called by the SSE stream consumer.
- `setEditedCode(code)` — called by the Monaco editor's `onChange` when not generating.
- `resetCode()` — clears code but does NOT increment `loadKey`. Use only for full workflow resets.

### Execution Store
Tracks `status`, `jobId`, `previewRows`, `previewColumns`, `errorMessage`, `executionTimeMs`.
- Status type: `'idle' | 'queued' | 'running' | 'success' | 'error'`
- `setResult(rows, cols, ms)` — sets status to `'success'` and stores preview data.
- `setError(msg)` — sets status to `'error'`.

---

## 6. Custom Hooks Design

**Strategy: one hook per backend interaction. Hooks own the async logic; stores own the state.**

### `useFileUpload`
- Uses TanStack `useMutation`.
- Calls `POST /api/v1/upload` with multipart form data via Axios.
- Tracks `uploadProgress` via Axios's `onUploadProgress`.
- On success, calls `sessionStore.setSession()`.
- On error, resets progress and shows a toast.

### `useInstructionRefine`
- Uses native `fetch` (not Axios) to access `ReadableStream`.
- Calls `POST /api/v1/instructions/refine`.
- Sets `isRefining` in the instruction store, clears `refinedPrompt`, then streams chunks via `parseSSEStream` into `appendRefined`.
- After the stream ends, clears `isRefining`.

### `useCodeGeneration`
- Same streaming pattern as `useInstructionRefine`.
- Calls `POST /api/v1/codegen/generate`.
- Streams chunks into the code store via `appendCode`.
- On stream completion, calls `sessionStore.advanceStep(4)`.

### `useCodeExecution`
- Calls `POST /api/v1/execute` via Axios to get `job_id`.
- Immediately sets execution status to `'running'`.
- Polls `GET /api/v1/execute/{session_id}/{job_id}` every `pollIntervalMs` milliseconds.
- On `'success'`: calls `setResult`; advances session step to 5; shows success toast.
- On `'error'`: calls `setError`; shows error toast.
- Stops polling after `maxPollAttempts` to prevent infinite loops.

### `useAutoFix`
- Calls `POST /api/v1/codegen/fix` with the broken code and error message.
- Streams the fixed code into the code store (same pattern as code generation).
- On completion, shows a toast prompting the user to run again.

### `useDownload`
- Calls `GET /api/v1/execute/{session_id}/{job_id}/output` via Axios with `responseType: 'blob'`.
- Creates an object URL and triggers a programmatic anchor click to download the file.
- Revokes the object URL after the click.

---

## 7. SSE Streaming Design

**Strategy: a single reusable async generator handles all SSE streams.**

Create `src/utils/streamParser.ts` as an async generator that:
- Accepts a `ReadableStream<Uint8Array>` (from `fetch` response body).
- Decodes chunks with `TextDecoder`, buffers incomplete lines.
- Splits on newlines, extracts `data:` prefix, parses JSON.
- Yields `{ chunk?, error?, done }` objects.
- Releases the reader lock in a `finally` block to prevent leaks.

All three SSE hooks (`useInstructionRefine`, `useCodeGeneration`, `useAutoFix`) reuse
this same generator. Do not duplicate the parsing logic.

---

## 8. Component Design

### Layout Components

**AppHeader**
- Sticky, `z-20`, blurred backdrop — always visible while scrolling.
- Title ("Code Genie") centred using flex spacers, not absolute positioning.
- Apply a gradient to the product name: `from-blue-600 via-indigo-500 to-purple-500`.
- Session ID shown as a small pill on the right when a session is active.

**WorkflowStepper**
- Horizontal row of 5 numbered steps connected by lines.
- Visual states: `pending` (outlined circle), `active` (filled primary with ring glow), `done` (filled with checkmark icon).
- Active step shows a spinner (`Loader2` with `animate-spin`) while the step is processing.
- Step labels and short descriptions shown below each circle.
- The stepper is display-only — it shows progress but does not allow clicking to jump steps.

### Upload Components

**FileUploadZone**
- Renders `FileMetadataCard` when `sessionId` is set; renders the drop zone otherwise.
- Drag-and-drop: wire `onDrop`, `onDragOver`, `onDragLeave`; toggle `isDragging` state for visual feedback.
- Hidden `<input type="file">` triggered programmatically via a ref on zone click.
- Validate the file with `validateFile()` before calling the upload hook.
- Show a progress bar while `isPending` from the upload mutation.
- Dashed border (`border-2 border-dashed`) changes to `border-primary` on drag.

**FileMetadataCard**
- Reads from `sessionStore.fileMetadata`.
- Shows filename, row count, column count, file size (formatted).
- Lists first 5 columns; shows `+N more` if there are additional columns.
- Provides a "Remove" button that calls `sessionStore.reset()`.

### Instruction Components

**RawInstructionBox**
- Controlled `<textarea>` bound to `instructionStore.rawInstructions`.
- 5,000 character hard limit; character counter shown below (turns red when fewer than 100 remain).
- Monospace font; include a helpful `placeholder` with a brief example.

**RefinedPromptBox**
- Displays `instructionStore.refinedPrompt` as read-only text by default.
- Toggle to edit mode via a pencil icon (icon changes to a check icon in edit mode).
- While `isRefining`: show a blinking cursor animation; disable editing.
- Empty state: dashed border with guiding text explaining this box will fill after refinement.

**InstructionPanel**
- Two-column grid: raw box on the left, refined box on the right.
- "Refine Instructions" button centred below the grid.
- Disable the button unless `rawInstructions.trim().length >= 20` and not already refining.
- Show a spinner inside the button while `isRefining`.

### Code Generation Components

**MonacoCodeEditor**
- Python language, `vs-dark` theme.
- Uses `key={loadKey}` — this is **critical** for correct behaviour. `loadKey` increments when `setGeneratedCode` is called, forcing a full editor remount. Without this, switching between library functions causes stale code to appear.
- `value` prop: use `generatedCode` while generating (read-only); switch to `editedCode` when done.
- `onChange` only calls `setEditedCode` when `isGenerating` is false.
- `readOnly` option enabled while generating.
- Show a small "Generating…" badge in the bottom-right corner while streaming.

**CodeGenPanel**
- Returns `null` if `refinedPrompt` is empty — the panel is hidden until step 3.
- Toolbar: "Generate Code" (primary button) when no code exists; "Regenerate" + "Clear" when code is present.
- Body: `MonacoCodeEditor`.

### Execution Components

**ExecutionPanel**
- Controls row: `StatusBadge`, execution time, "Run Code" (green), "Download CSV" (secondary, only when status is `'success'`).
- Error box: shown only when `status === 'error'`; displays `errorMessage` in a red card with an "Auto-fix" button.
- Body: `OutputPreviewTable`.

**OutputPreviewTable**
- Reads `previewRows` and `previewColumns` from the execution store.
- Sticky header row.
- Monospace cells; alternating row colours; hover highlight.
- Shows up to `APP_CONFIG.preview.rowCount` rows.

### Shared Components

**StatusBadge**
- Maps status strings (`idle`, `queued`, `running`, `success`, `error`, `refining`, `generating`) to label + colour class.
- Use `animate-pulse` for in-progress states (`queued`, `running`, `refining`, `generating`).

**ErrorBoundary**
- Class component (required for `getDerivedStateFromError`).
- In development, shows the full error stack in a `<pre>` block.
- In production, shows only a generic message and a "Reload" button.

---

## 9. App Assembly Design

**Strategy: 3-panel layout with conditional rendering. Providers at the root.**

- Wrap everything in `QueryClientProvider` (TanStack Query) — required for `useMutation`.
- Place `<Toaster>` (Sonner) at the root with `richColors` and `position="top-right"`.
- `QueryClient` defaults: `retry: 1` for queries, `retry: 0` for mutations, `staleTime: 30_000`.
- Wrap `<App>` in `<ErrorBoundary>` in `main.tsx` as a safety net.

### 3-Panel Layout (`flex h-screen flex-col overflow-hidden`)

1. **Top bar** (`flex-shrink-0`, `z-20`): `<AppHeader />` + `<WorkflowStepper />`
2. **Body** (`flex flex-1 overflow-hidden`):
   - **Left: `PilotSidebar`** (`w-72`, `overflow-y-auto`) — Data Workspace header, Dataset Details collapsible (column table + File Summary + Re-upload), Data Ingestion collapsible (`FileUploadZone`). `FileSummaryModal` portals from here.
   - **Center: `MainContent`** (`flex-1`, `overflow-y-auto`) — conditionally renders Instruction Panel (after upload), Code Gen Panel (when Source Console toggled on), Execution Panel (after execution completes).
   - **Right: `CodeSidebar`** (`w-80`, `overflow-y-auto`) — Engineering Workspace header, Source Console toggle switch, `InstructionsLibraryPanel`, `CodeLibraryPanel`.

### Rendering Logic

- `InstructionPanel`: visible when `sessionId` is truthy.
- `CodeGenPanel`: visible when `codeStudioOpen === true && currentStep >= 2`.
- `ExecutionPanel`: visible when `executionStatus === 'success' || 'error'`.
- `FileSummaryModal`: rendered conditionally as an overlay when the File Summary button is clicked.

### Library Panel Interaction Pattern

When a user loads an item from a library panel:
1. Call `setGeneratedCode('')` (not `resetCode()`) to clear editor **and** increment `loadKey`.
2. Call `resetExecution()` to clear execution state.
3. Fetch content from backend.
4. Call `setGeneratedCode(code)` to load new content (increments `loadKey` again, causing Monaco remount).
5. Optionally restore instruction state via `loadCachedState` or `setRawInstructions`.

---

## 10. Styling Design

**Strategy: Tailwind utility classes + CSS custom properties for design tokens. No component library.**

- All colour tokens are defined as CSS HSL variables in `src/index.css` under `:root` and `.dark`.
- Tailwind's `theme.extend.colors` references these variables using `hsl(var(--token) / <alpha-value>)` syntax.
- This pattern enables dark mode by toggling a `.dark` class on `<html>` — no other changes needed.
- Use `cn()` (from `clsx` + `tailwind-merge`) for conditional class merging. Never template-string Tailwind classes.
- Prefer composing Tailwind utilities over writing custom CSS. Only write custom CSS for animations not available in Tailwind.

---

## 11. Environment Variables

- All browser-accessible variables must be prefixed with `VITE_`.
- Only one variable is needed: `VITE_API_BASE_URL` (defaults to empty, so relative paths are used).
- In local dev, keep it empty and rely on Vite proxy (`/api` to `http://127.0.0.1:8000`).
- Store this in `frontend/.env.local` (gitignored). Do not commit API URLs.
- During development, Vite proxies `/api` requests to `http://127.0.0.1:8000`.

---

## 12. Common Mistakes to Avoid

| Mistake | Correct Approach |
|---|---|
| Using Axios for SSE endpoints | Use native `fetch` + `ReadableStream` for all streaming endpoints |
| Hardcoding URLs or config values | Always read from `APP_CONFIG` |
| Mutating Zustand state outside `set` | All state changes must go through the store's `set` function |
| Calling the API directly in a component | The component calls a hook; the hook calls the API |
| Reading store state in a hook with `getState()` | Use the selector pattern (`useStore(s => s.field)`) to get reactive subscriptions |
| Passing `generatedCode` to Monaco `value` while also wiring `onChange` | Switch the `value` source and `readOnly` mode based on `isGenerating` |
| Forgetting `noUnusedLocals` is enforced | Remove all unused imports and variables before finishing a file |
| Using `any` type | Define proper types in `api.types.ts`; use `unknown` when type is genuinely unknown |
| Missing `/// <reference types="vite/client" />` | Without this, `import.meta.env` will be a TypeScript error |
| Polling indefinitely on execution | Cap polling at `maxPollAttempts` and surface a timeout error to the user |
| Using `resetCode()` when loading a library function | Use `setGeneratedCode('')` instead — only `setGeneratedCode` increments `loadKey`, forcing Monaco to remount and clear stale state |
| Forgetting to add `key={loadKey}` to Monaco Editor | Without this, the editor does not remount when switching between library functions and stale code persists |
| Direct component fetch in library panels | Library panels fetch directly (not via hooks) since they manage their own local list state; this is intentional for collapsible panel UX |
