# Frontend Agent Guide — AI Code Builder

> **Purpose:** Step-by-step instructions for a coding agent to recreate this React/TypeScript
> frontend from scratch. Follow every section in order. Do not skip steps.

---

## 1. Project Overview

This is a **React 18 + TypeScript + Vite** single-page application that drives a 5-step
AI-powered data transformation workflow:

| Step | Label               | What the user does                                      |
|------|---------------------|---------------------------------------------------------|
| 1    | Upload Data         | Drops a CSV or XLSX file into a drag-and-drop zone      |
| 2    | Write Instructions  | Types a plain-English description of the transformation |
| 3    | Refine              | Clicks a button; AI enhances the prompt via SSE         |
| 4    | Generate Code       | AI streams Python code into a Monaco editor             |
| 5    | Execute             | Runs the code; previews output; downloads result CSV    |

Beyond the core workflow, the app has **library and caching features** accessible from the right sidebar:

- **Instructions Library Panel** — save, browse, and load instruction templates. Loading an instruction also restores cached code (via Code Cache) if available.
- **Code Library Panel** — save, browse, share, and load Python code snippets (public/private visibility).
- **File Summary Modal** — shows per-column statistics (nulls, uniques, min/max) for the uploaded file.

**Technology choices (non-negotiable):**

| Concern            | Library / Tool                          |
|--------------------|-----------------------------------------|
| UI framework       | React 18                                |
| Language           | TypeScript 5.5 (strict mode)            |
| Build tool         | Vite 5                                  |
| State management   | Zustand 4                               |
| Server state       | TanStack React Query 5                  |
| HTTP client        | Axios 1.7                               |
| Code editor        | `@monaco-editor/react` 4                |
| Icons              | Lucide React                            |
| Toasts             | Sonner                                  |
| Styling            | Tailwind CSS 3 + CSS custom properties  |
| Testing            | Vitest 2                                |

---

## 2. Prerequisites

Before generating any code, confirm the environment has:

- Node.js >= 20 (LTS)
- npm >= 10 (or pnpm/bun)
- The backend running at `http://localhost:8000`

---

## 3. Scaffold the Project

```bash
npm create vite@latest ai-code-builder-frontend -- --template react-ts
cd ai-code-builder-frontend
```

Install all runtime dependencies:

```bash
npm install \
  react@^18.3.0 react-dom@^18.3.0 \
  zustand@^4.5.0 \
  @tanstack/react-query@^5.56.0 \
  axios@^1.7.0 \
  @monaco-editor/react@^4.6.0 \
  lucide-react@^0.400.0 \
  sonner@^1.5.0 \
  clsx@^2.1.0 \
  tailwind-merge@^2.4.0 \
  class-variance-authority@^0.7.0 \
  @radix-ui/react-slot@^1.1.0
```

Install dev dependencies:

```bash
npm install -D \
  typescript@^5.5.0 \
  @types/react@^18.3.0 \
  @types/react-dom@^18.3.0 \
  vite@^5.4.0 \
  @vitejs/plugin-react@^4.3.0 \
  tailwindcss@^3.4.0 \
  postcss@^8.4.0 \
  autoprefixer@^10.4.0 \
  eslint@^9.9.0 \
  vitest@^2.0.0 \
  @testing-library/react@^16.0.0 \
  @testing-library/jest-dom@^6.4.0 \
  jsdom@^25.0.0
```

---

## 4. Configuration Files

### 4.1 `vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

### 4.2 `tailwind.config.ts`

```typescript
import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background:  'hsl(var(--background) / <alpha-value>)',
        foreground:  'hsl(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT:    'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        border:  'hsl(var(--border) / <alpha-value>)',
        input:   'hsl(var(--input) / <alpha-value>)',
        ring:    'hsl(var(--ring) / <alpha-value>)',
        card: {
          DEFAULT:    'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
} satisfies Config
```

### 4.3 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### 4.4 `src/vite-env.d.ts`

```typescript
/// <reference types="vite/client" />
```

---

## 5. Global Styles — `src/index.css`

Define all HSL design tokens as CSS custom properties. This allows the Tailwind theme to
reference them and supports future dark-mode toggling with a single `.dark` class switch.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background:           0 0% 98%;
    --foreground:           222.2 84% 4.9%;
    --card:                 0 0% 100%;
    --card-foreground:      222.2 84% 4.9%;
    --primary:              221.2 83.2% 50%;
    --primary-foreground:   210 40% 98%;
    --secondary:            210 40% 95%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted:                210 40% 95%;
    --muted-foreground:     215.4 16.3% 46.9%;
    --accent:               210 40% 95%;
    --accent-foreground:    222.2 47.4% 11.2%;
    --destructive:          0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border:               214.3 31.8% 89%;
    --input:                214.3 31.8% 89%;
    --ring:                 221.2 83.2% 50%;
    --radius:               0.625rem;
  }
  .dark {
    --background:           222.2 84% 4.9%;
    --foreground:           210 40% 98%;
    --card:                 222.2 84% 7%;
    --card-foreground:      210 40% 98%;
    --primary:              217.2 91.2% 59.8%;
    --primary-foreground:   222.2 47.4% 11.2%;
    --secondary:            217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted:                217.2 32.6% 17.5%;
    --muted-foreground:     215 20.2% 65.1%;
    --accent:               217.2 32.6% 17.5%;
    --accent-foreground:    210 40% 98%;
    --destructive:          0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border:               217.2 32.6% 17.5%;
    --input:                217.2 32.6% 17.5%;
    --ring:                 224.3 76.3% 48%;
  }
}

@layer base {
  * { @apply border-border; }
  html { -webkit-font-smoothing: antialiased; }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}
```

---

## 6. Source Directory Structure

Create the following folder layout inside `src/` before writing any component code:

```
src/
├── components/
│   ├── codegen/          # CodeGenPanel, MonacoCodeEditor
│   ├── execution/        # ExecutionPanel, OutputPreviewTable
│   ├── instructions/     # InstructionPanel, RawInstructionBox, RefinedPromptBox
│   ├── layout/           # AppHeader, WorkflowStepper, CodeLibraryPanel,
│   │                     #   InstructionsLibraryPanel, FileSummaryModal
│   ├── shared/           # StatusBadge, ErrorBoundary
│   └── upload/           # FileUploadZone, FileMetadataCard
├── config/               # app.config.ts — all magic numbers
├── hooks/                # useFileUpload, useInstructionRefine, useCodeGeneration,
│                         #   useCodeExecution, useAutoFix, useDownload
├── lib/                  # utils.ts (cn helper)
├── services/             # apiClient.ts (Axios + apiGet/apiPost/apiDelete helpers)
├── store/                # sessionStore, instructionStore, codeStore, executionStore
├── types/                # api.types.ts — all API DTOs
└── utils/                # streamParser, fileValidation, formatters, toast
```

---

## 7. Utilities & Infrastructure

Create these files first — every hook and component depends on them.

### 7.1 `src/lib/utils.ts`

```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### 7.2 `src/config/app.config.ts`

Centralise every magic number here. No hard-coded values elsewhere.

```typescript
export const APP_CONFIG = {
  api: {
    // Empty means same-origin; Vite dev proxy forwards /api to backend.
    baseUrl:   import.meta.env.VITE_API_BASE_URL ?? '',
    prefix:    '/api/v1',
    timeoutMs: 30_000,
  },
  upload: {
    maxFileSizeMb:      50,
    allowedExtensions:  ['.csv', '.xlsx'],
    allowedMimeTypes:   [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
  editor: {
    theme:      'vs-dark' as const,
    language:   'python' as const,
    fontSize:   14,
    minimap:    false,
    wordWrap:   'on' as const,
  },
  preview: { rowCount: 50 },
  execution: {
    pollIntervalMs:  1_500,
    maxPollAttempts: 40,   // 60 seconds total
  },
} as const
```

### 7.3 `src/types/api.types.ts`

All API DTOs in one place. Keep in sync with the backend Pydantic schemas.

```typescript
export interface UploadResponse {
  session_id:       string
  filename:         string
  row_count:        number
  column_count:     number
  columns:          string[]
  dtypes:           Record<string, string>
  file_size_bytes:  number
}

export interface RefineRequest  { session_id: string; raw_instructions: string }
export interface CodeGenRequest { session_id: string; refined_prompt:   string }
export interface CodeFixRequest {
  session_id:    string
  broken_code:   string
  error_message: string
}
export interface ExecuteRequest { session_id: string; code: string }

export interface ExecutionResult {
  job_id:           string
  status:           'queued' | 'running' | 'success' | 'error'
  preview_rows:     Record<string, unknown>[]
  preview_columns:  string[]
  error_message:    string | null
  execution_time_ms: number | null
}

// ── Code Library ──────────────────────────────────────────────────────────────
export type Visibility = 'public' | 'private'

export interface CodeLibraryItem {
  filename:   string
  label:      string
  visibility: Visibility
}

export interface CodeLibraryListResponse {
  visibility: string
  items:      CodeLibraryItem[]
}

export interface CodeLibraryContentResponse {
  filename:   string
  visibility: string
  code:       string
}

export interface ShareToPublicResponse {
  filename: string
  message:  string
}

export interface ShareToUsersRequest {
  user_ids: string[]
}

export interface ShareToUsersResponse {
  filename:  string
  shared_to: string[]
}

// ── Instructions Library ──────────────────────────────────────────────────────
export interface InstructionLibraryItem {
  filename: string
  label:    string
}

export interface InstructionLibraryListResponse {
  items: InstructionLibraryItem[]
}

// ── Code Cache ────────────────────────────────────────────────────────────────
export interface CodeCacheEntry {
  label:            string
  code:             string
  raw_instructions: string
  refined_prompt:   string
}

// ── File Summary ──────────────────────────────────────────────────────────────
export interface ColumnSummary {
  column:            string
  dtype:             string
  record_count:      number
  null_count:        number
  count_with_values: number
  unique_count:      number
  is_key_column:     string
  min_value:         string | null
  max_value:         string | null
}

export interface FileSummaryResponse {
  session_id: string
  filename:   string
  columns:    ColumnSummary[]
}

export interface ColumnValuesResponse {
  column:    string
  values:    string[]
  is_sample: boolean
}

export interface MetadataPreviewResponse {
  filename:        string
  column_count:    number
  columns:         string[]
  dtypes:          Record<string, string>
  file_size_bytes: number
}
```

### 7.4 `src/services/apiClient.ts`

```typescript
import axios from 'axios'
import { APP_CONFIG } from '@/config/app.config'

export const apiClient = axios.create({
  baseURL: `${APP_CONFIG.api.baseUrl}${APP_CONFIG.api.prefix}`,
  timeout: APP_CONFIG.api.timeoutMs,
})

// Attach a request-id to every call for traceability
apiClient.interceptors.request.use((config) => {
  config.headers['X-Request-Id'] = crypto.randomUUID()
  return config
})

// Normalise error shape
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const message =
      err.response?.data?.detail ??
      err.response?.data?.message ??
      err.message ??
      'Unknown error'
    return Promise.reject(new Error(String(message)))
  },
)
```

### 7.5 `src/utils/streamParser.ts`

Used by hooks that consume SSE streaming responses from the backend.

```typescript
/**
 * Reads an SSE (Server-Sent Events) ReadableStream and yields parsed
 * JSON payloads.  Each event the backend sends looks like:
 *   data: {"chunk": "...", "done": false}
 *   data: {"done": true}
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<{ chunk?: string; error?: string; done: boolean }> {
  const reader  = stream.getReader()
  const decoder = new TextDecoder()
  let   buffer  = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''    // keep incomplete last line

      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const json = line.slice('data:'.length).trim()
        if (!json) continue
        try {
          yield JSON.parse(json) as { chunk?: string; error?: string; done: boolean }
        } catch {
          // malformed event — skip
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
```

### 7.6 `src/utils/fileValidation.ts`

```typescript
import { APP_CONFIG } from '@/config/app.config'

export function validateFile(file: File): { valid: boolean; error?: string } {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!APP_CONFIG.upload.allowedExtensions.includes(ext as '.csv' | '.xlsx'))
    return { valid: false, error: 'Only .csv and .xlsx files are supported.' }

  const maxBytes = APP_CONFIG.upload.maxFileSizeMb * 1024 * 1024
  if (file.size > maxBytes)
    return { valid: false, error: `File exceeds ${APP_CONFIG.upload.maxFileSizeMb} MB limit.` }

  return { valid: true }
}
```

### 7.7 `src/utils/formatters.ts`

```typescript
export function truncateId(id: string, len = 8): string {
  return id.length <= len ? id : `${id.slice(0, 4)}…${id.slice(-4)}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

export function formatDuration(ms: number): string {
  if (ms < 1000)  return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}
```

### 7.8 `src/utils/toast.ts`

```typescript
import { toast } from 'sonner'

export const toastSuccess = (msg: string) => toast.success(msg)
export const toastError   = (msg: string) => toast.error(msg)
export const toastInfo    = (msg: string) => toast.info(msg)
```

---

## 8. Zustand Stores

Create one store file per concern. Each store is a plain TypeScript object
managed by `zustand`. Use the pattern: `set` to update, `get` to read within
actions, and `create` with optional `devtools` middleware in development.

### 8.1 `src/store/sessionStore.ts`

Tracks the active upload session and which workflow step is unlocked.

```typescript
import { create } from 'zustand'
import type { UploadResponse } from '@/types/api.types'

interface FileMetadata {
  filename:        string
  row_count:       number
  column_count:    number
  columns:         string[]
  dtypes:          Record<string, string>
  file_size_bytes: number
}

interface SessionState {
  sessionId:    string | null
  fileMetadata: FileMetadata | null
  currentStep:  number            // 1–5
  setSession:   (id: string, meta: UploadResponse) => void
  advanceStep:  (to: number) => void
  reset:        () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId:    null,
  fileMetadata: null,
  currentStep:  1,
  setSession: (id, meta) =>
    set({
      sessionId:    id,
      fileMetadata: meta,
      currentStep:  2,
    }),
  advanceStep: (to) => set((s) => ({ currentStep: Math.max(s.currentStep, to) })),
  reset: () => set({ sessionId: null, fileMetadata: null, currentStep: 1 }),
}))
```

### 8.2 `src/store/instructionStore.ts`

Extended with library/cache fields: `activeSavedLabel`, `isFromCache`, `instructionsOutOfSync`.

```typescript
import { create } from 'zustand'

interface InstructionState {
  rawInstructions:       string
  refinedPrompt:         string
  isRefining:            boolean
  activeSavedLabel:      string | null   // label of the currently-loaded saved instruction
  isFromCache:           boolean         // true when code came from cache (not freshly generated)
  instructionsOutOfSync: boolean         // true when instructions edited after code generated
  setRawInstructions:    (text: string) => void
  appendRefinedChunk:    (chunk: string) => void
  setRefinedPrompt:      (text: string) => void
  setIsRefining:         (val: boolean) => void
  resetRefined:          () => void
  setActiveSavedLabel:   (label: string | null) => void
  setIsFromCache:        (val: boolean) => void
  setInstructionsOutOfSync: (val: boolean) => void
  /** Load raw instructions + refined prompt from a cached entry */
  loadCachedState: (rawInstructions: string, refinedPrompt: string, activeLabel: string | null) => void
}

export const useInstructionStore = create<InstructionState>((set) => ({
  rawInstructions:       '',
  refinedPrompt:         '',
  isRefining:            false,
  activeSavedLabel:      null,
  isFromCache:           false,
  instructionsOutOfSync: false,
  // Any user edit clears cache + out-of-sync flags so refine+generate run fresh
  setRawInstructions: (text) => set({ rawInstructions: text, isFromCache: false, instructionsOutOfSync: false }),
  appendRefinedChunk: (chunk) => set((s) => ({ refinedPrompt: s.refinedPrompt + chunk })),
  setRefinedPrompt:   (text) => set({ refinedPrompt: text }),
  setIsRefining:      (val)  => set({ isRefining: val }),
  resetRefined:       ()     => set({ refinedPrompt: '' }),
  setActiveSavedLabel: (label) => set({ activeSavedLabel: label }),
  setIsFromCache:      (val)   => set({ isFromCache: val }),
  setInstructionsOutOfSync: (val) => set({ instructionsOutOfSync: val }),
  loadCachedState: (rawInstructions, refinedPrompt, activeLabel) =>
    set({ rawInstructions, refinedPrompt, isFromCache: true, activeSavedLabel: activeLabel, instructionsOutOfSync: false }),
}))
```

### 8.3 `src/store/codeStore.ts`

`loadKey` is a counter incremented by `setGeneratedCode`. The Monaco editor uses
`key={loadKey}` to force a full remount whenever new code is loaded, preventing stale
editor state when switching between saved library functions.

```typescript
import { create } from 'zustand'

interface CodeState {
  generatedCode:   string
  editedCode:      string
  isGenerating:    boolean
  loadKey:         number   // incremented by setGeneratedCode to force Monaco remount
  setGeneratedCode: (code: string) => void
  appendCode:      (chunk: string) => void
  setEditedCode:   (code: string)  => void
  setIsGenerating: (v: boolean)    => void
  resetCode:       () => void       // does NOT increment loadKey
}

export const useCodeStore = create<CodeState>((set) => ({
  generatedCode:   '',
  editedCode:      '',
  isGenerating:    false,
  loadKey:         0,
  // setGeneratedCode increments loadKey → Monaco remounts cleanly
  setGeneratedCode: (code) => set((s) => ({ generatedCode: code, editedCode: code, loadKey: s.loadKey + 1 })),
  appendCode: (chunk) => set((s) => ({
    generatedCode: s.generatedCode + chunk,
    editedCode:    s.editedCode    + chunk,
  })),
  setEditedCode:   (code) => set({ editedCode: code }),
  setIsGenerating: (v)    => set({ isGenerating: v }),
  resetCode:       ()     => set({ generatedCode: '', editedCode: '' }),  // no loadKey change
}))
```

### 8.4 `src/store/executionStore.ts`

```typescript
import { create } from 'zustand'

type ExecStatus = 'idle' | 'queued' | 'running' | 'success' | 'error'

interface ExecutionState {
  status:          ExecStatus
  jobId:           string | null
  previewRows:     Record<string, unknown>[]
  previewColumns:  string[]
  errorMessage:    string | null
  executionTimeMs: number | null
  setStatus:       (s: ExecStatus) => void
  setJobId:        (id: string)    => void
  setResult:       (rows: Record<string, unknown>[], cols: string[], ms: number) => void
  setError:        (msg: string)   => void
  reset:           () => void
}

export const useExecutionStore = create<ExecutionState>((set) => ({
  status:          'idle',
  jobId:           null,
  previewRows:     [],
  previewColumns:  [],
  errorMessage:    null,
  executionTimeMs: null,
  setStatus:  (s)                => set({ status: s }),
  setJobId:   (id)               => set({ jobId: id }),
  setResult:  (rows, cols, ms)   =>
    set({ status: 'success', previewRows: rows, previewColumns: cols, executionTimeMs: ms }),
  setError:   (msg)              => set({ status: 'error', errorMessage: msg }),
  reset:      ()                 =>
    set({ status: 'idle', jobId: null, previewRows: [], previewColumns: [],
          errorMessage: null, executionTimeMs: null }),
}))
```

---

## 9. Custom Hooks

Each hook encapsulates one backend interaction. Keep hooks thin: state lives in
stores, async logic lives in hooks, UI lives in components.

### 9.1 `src/hooks/useFileUpload.ts`

```typescript
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { apiClient } from '@/services/apiClient'
import { useSessionStore } from '@/store/sessionStore'
import { toastSuccess, toastError } from '@/utils/toast'
import type { UploadResponse } from '@/types/api.types'

export function useFileUpload() {
  const [uploadProgress, setUploadProgress] = useState(0)
  const setSession = useSessionStore((s) => s.setSession)

  const { mutate: uploadFile, isPending } = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return apiClient.post<UploadResponse>('/upload', form, {
        onUploadProgress: (e) => {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100))
        },
      }).then((r) => r.data)
    },
    onSuccess: (data) => {
      setSession(data.session_id, data)
      toastSuccess(`"${data.filename}" uploaded — ${data.row_count.toLocaleString()} rows`)
    },
    onError: (err: Error) => {
      setUploadProgress(0)
      toastError(err.message)
    },
  })

  return { uploadFile, isPending, uploadProgress }
}
```

### 9.2 `src/hooks/useInstructionRefine.ts`

Uses the native `fetch` API (not Axios) because Axios does not expose the raw
`ReadableStream` required to read SSE responses progressively.

```typescript
import { APP_CONFIG } from '@/config/app.config'
import { useInstructionStore } from '@/store/instructionStore'
import { useSessionStore } from '@/store/sessionStore'
import { parseSSEStream } from '@/utils/streamParser'
import { toastError } from '@/utils/toast'

export function useInstructionRefine() {
  const sessionId        = useSessionStore((s) => s.sessionId)
  const rawInstructions  = useInstructionStore((s) => s.rawInstructions)
  const { setRefining, setRefined, appendRefined } = useInstructionStore()

  const isRefining = useInstructionStore((s) => s.isRefining)

  async function refine() {
    if (!sessionId) return
    setRefining(true)
    setRefined('')

    try {
      const res = await fetch(
        `${APP_CONFIG.api.baseUrl}${APP_CONFIG.api.prefix}/instructions/refine`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ session_id: sessionId, raw_instructions: rawInstructions }),
        },
      )
      if (!res.ok || !res.body) throw new Error(await res.text())

      for await (const event of parseSSEStream(res.body)) {
        if (event.error) throw new Error(event.error)
        if (event.chunk) appendRefined(event.chunk)
        if (event.done)  break
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Refinement failed')
    } finally {
      setRefining(false)
    }
  }

  return { refine, isRefining }
}
```

### 9.3 `src/hooks/useCodeGeneration.ts`

```typescript
import { useState } from 'react'
import { APP_CONFIG } from '@/config/app.config'
import { useCodeStore } from '@/store/codeStore'
import { useInstructionStore } from '@/store/instructionStore'
import { useSessionStore } from '@/store/sessionStore'
import { parseSSEStream } from '@/utils/streamParser'
import { toastError } from '@/utils/toast'

export function useCodeGeneration() {
  const [isGenerating, setIsGenerating] = useState(false)
  const sessionId     = useSessionStore((s) => s.sessionId)
  const advanceStep   = useSessionStore((s) => s.advanceStep)
  const refinedPrompt = useInstructionStore((s) => s.refinedPrompt)
  const { setGenerating, appendCode, resetCode } = useCodeStore()

  async function generateCode() {
    if (!sessionId || !refinedPrompt) return
    setIsGenerating(true)
    setGenerating(true)
    resetCode()

    try {
      const res = await fetch(
        `${APP_CONFIG.api.baseUrl}${APP_CONFIG.api.prefix}/codegen/generate`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ session_id: sessionId, refined_prompt: refinedPrompt }),
        },
      )
      if (!res.ok || !res.body) throw new Error(await res.text())

      for await (const event of parseSSEStream(res.body)) {
        if (event.error) throw new Error(event.error)
        if (event.chunk) appendCode(event.chunk)
        if (event.done)  { advanceStep(4); break }
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Code generation failed')
    } finally {
      setIsGenerating(false)
      setGenerating(false)
    }
  }

  return { generateCode, isGenerating }
}
```

### 9.4 `src/hooks/useCodeExecution.ts`

```typescript
import { useState } from 'react'
import { apiClient } from '@/services/apiClient'
import { useCodeStore } from '@/store/codeStore'
import { useExecutionStore } from '@/store/executionStore'
import { useSessionStore } from '@/store/sessionStore'
import { APP_CONFIG } from '@/config/app.config'
import { toastError, toastSuccess } from '@/utils/toast'
import type { ExecutionResult, ExecuteRequest } from '@/types/api.types'

export function useCodeExecution() {
  const [isExecuting, setIsExecuting] = useState(false)
  const sessionId  = useSessionStore((s) => s.sessionId)
  const advanceStep = useSessionStore((s) => s.advanceStep)
  const editedCode = useCodeStore((s) => s.editedCode)
  const { setStatus, setJobId, setResult, setError } = useExecutionStore()

  async function executeCode() {
    if (!sessionId || !editedCode) return
    setIsExecuting(true)
    setStatus('queued')

    try {
      const { data: { job_id } } = await apiClient.post<{ job_id: string }>(
        '/execute',
        { session_id: sessionId, code: editedCode } satisfies ExecuteRequest,
      )
      setJobId(job_id)
      setStatus('running')

      // Poll for result
      let attempts = 0
      while (attempts < APP_CONFIG.execution.maxPollAttempts) {
        await new Promise((r) => setTimeout(r, APP_CONFIG.execution.pollIntervalMs))
        const { data } = await apiClient.get<ExecutionResult>(
          `/execute/${sessionId}/${job_id}`,
        )
        if (data.status === 'success') {
          setResult(data.preview_rows, data.preview_columns, data.execution_time_ms ?? 0)
          advanceStep(5)
          toastSuccess('Code executed successfully')
          return
        }
        if (data.status === 'error') {
          setError(data.error_message ?? 'Execution failed')
          toastError('Execution error — see details below')
          return
        }
        attempts++
      }
      setError('Execution timed out after 60 seconds')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setIsExecuting(false)
    }
  }

  return { executeCode, isExecuting }
}
```

### 9.5 `src/hooks/useAutoFix.ts`

```typescript
import { useState } from 'react'
import { APP_CONFIG } from '@/config/app.config'
import { useCodeStore } from '@/store/codeStore'
import { parseSSEStream } from '@/utils/streamParser'
import { toastError, toastSuccess } from '@/utils/toast'

export function useAutoFix() {
  const [isFixing, setIsFixing] = useState(false)
  const { resetCode, appendCode } = useCodeStore()

  async function autoFix(sessionId: string, brokenCode: string, errorMessage: string) {
    setIsFixing(true)
    resetCode()

    try {
      const res = await fetch(
        `${APP_CONFIG.api.baseUrl}${APP_CONFIG.api.prefix}/codegen/fix`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            session_id:    sessionId,
            broken_code:   brokenCode,
            error_message: errorMessage.slice(0, 5000),
          }),
        },
      )
      if (!res.ok || !res.body) throw new Error(await res.text())

      for await (const event of parseSSEStream(res.body)) {
        if (event.error) throw new Error(event.error)
        if (event.chunk) appendCode(event.chunk)
        if (event.done)  { toastSuccess('Code fixed — try running again'); break }
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Auto-fix failed')
    } finally {
      setIsFixing(false)
    }
  }

  return { autoFix, isFixing }
}
```

### 9.6 `src/hooks/useDownload.ts`

```typescript
import { useState } from 'react'
import { apiClient } from '@/services/apiClient'
import { useExecutionStore } from '@/store/executionStore'
import { useSessionStore } from '@/store/sessionStore'
import { toastError } from '@/utils/toast'

export function useDownload() {
  const [isDownloading, setIsDownloading] = useState(false)
  const sessionId = useSessionStore((s) => s.sessionId)
  const jobId     = useExecutionStore((s) => s.jobId)

  async function downloadCsv() {
    if (!sessionId || !jobId) return
    setIsDownloading(true)
    try {
      const { data } = await apiClient.get<Blob>(
        `/execute/${sessionId}/${jobId}/output`,
        { responseType: 'blob' },
      )
      const url  = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = `output_${jobId.slice(0, 8)}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setIsDownloading(false)
    }
  }

  return { downloadCsv, isDownloading }
}
```

---

## 10. Shared Components

### 10.1 `src/components/shared/StatusBadge.tsx`

```typescript
import { cn } from '@/lib/utils'

type Status = 'idle' | 'queued' | 'running' | 'success' | 'error' | 'refining' | 'generating'

const MAP: Record<Status, { label: string; classes: string }> = {
  idle:       { label: 'Idle',       classes: 'bg-muted text-muted-foreground' },
  queued:     { label: 'Queued',     classes: 'bg-yellow-100 text-yellow-700 animate-pulse' },
  running:    { label: 'Running',    classes: 'bg-blue-100 text-blue-700 animate-pulse' },
  success:    { label: 'Success',    classes: 'bg-green-100 text-green-700' },
  error:      { label: 'Error',      classes: 'bg-red-100 text-red-700' },
  refining:   { label: 'Refining…',  classes: 'bg-purple-100 text-purple-700 animate-pulse' },
  generating: { label: 'Generating…',classes: 'bg-indigo-100 text-indigo-700 animate-pulse' },
}

export function StatusBadge({ status }: { status: Status }) {
  const { label, classes } = MAP[status]
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', classes)}>
      {label}
    </span>
  )
}
```

### 10.2 `src/components/shared/ErrorBoundary.tsx`

```typescript
import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
          <h1 className="text-xl font-bold text-destructive">Something went wrong</h1>
          {import.meta.env.DEV && (
            <pre className="max-w-2xl overflow-auto rounded bg-muted p-4 text-xs">
              {this.state.error.stack}
            </pre>
          )}
          <button
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

---

## 11. Layout Components

### 11.1 `src/components/layout/AppHeader.tsx`

- No icon — branding is text only
- Title centered using flex spacers
- Session indicator as a pill on the right

Key classes: `sticky top-0 z-20 border-b bg-background/95 backdrop-blur-sm`

Center content: wrap title in `flex flex-col items-center`, add `w-48` spacer divs on each side.

Apply gradient to "Code Genie": `bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500 bg-clip-text text-transparent`

### 11.2 `src/components/layout/WorkflowStepper.tsx`

- 5 numbered circles connected by horizontal lines
- Done: filled primary circle with bold checkmark
- Active: filled primary circle with ring glow; spinning `Loader2` if processing
- Pending: outlined circle with muted number
- Each step shows a label and a short description below it

---

## 12. Upload Components

### `src/components/upload/FileUploadZone.tsx`

- If `hasSession` is true, render `<FileMetadataCard />` instead
- Otherwise render the drop zone:
  - `onDrop`, `onDragOver`, `onDragLeave` handlers toggle `isDragging` state
  - Hidden `<input type="file" accept=".csv,.xlsx" />`
  - Click on the zone triggers `inputRef.current?.click()`
  - When uploading, show a progress bar (`uploadProgress` from hook)
  - Key style: `border-2 border-dashed rounded-xl` with `border-primary` on drag

### `src/components/upload/FileMetadataCard.tsx`

- Reads from `sessionStore.fileMetadata`
- Shows filename, row count, column count, file size
- Lists first 5 column names; shows "+N more" if there are more
- Provides a reset/remove button that calls `sessionStore.reset()`

---

## 13. Instruction Components

### `src/components/instructions/RawInstructionBox.tsx`

- Controlled `<textarea>` bound to `instructionStore.rawInstructions`
- 5000 character limit; show counter (red when < 100 remaining)
- Include an example in the placeholder attribute
- Monospace font

### `src/components/instructions/RefinedPromptBox.tsx`

- Displays `instructionStore.refinedPrompt`
- Empty state: dashed border with guiding text
- Edit mode toggle: pencil icon → check icon
- While refining: blinking cursor animation; read-only

### `src/components/instructions/InstructionPanel.tsx`

- Two-column grid: `<RawInstructionBox />` | `<RefinedPromptBox />`
- Centred "Refine Instructions" button below the grid
- Button disabled until `rawInstructions.trim().length >= 20 && !isRefining`
- Show `<Loader2 animate-spin />` while refining

---

## 14. Code Generation Components

### `src/components/codegen/MonacoCodeEditor.tsx`

**Important:** The editor uses `key={loadKey}` to force a full remount whenever
`setGeneratedCode` is called. This ensures stale editor state is cleared when loading
a new function from the code library.

```typescript
import Editor from '@monaco-editor/react'
import { useCodeStore } from '@/store/codeStore'
import { APP_CONFIG } from '@/config/app.config'

export function MonacoCodeEditor() {
  const { generatedCode, editedCode, isGenerating, loadKey, setEditedCode } = useCodeStore()

  return (
    <div className="relative">
      <Editor
        key={loadKey}                        // force remount when loadKey changes
        height="400px"
        language={APP_CONFIG.editor.language}
        theme={APP_CONFIG.editor.theme}
        value={isGenerating ? generatedCode : editedCode}
        onChange={(v) => { if (!isGenerating) setEditedCode(v ?? '') }}
        options={{
          readOnly:             isGenerating,
          fontSize:             APP_CONFIG.editor.fontSize,
          minimap:              { enabled: APP_CONFIG.editor.minimap },
          wordWrap:             APP_CONFIG.editor.wordWrap,
          automaticLayout:      true,
          scrollBeyondLastLine: false,
        }}
      />
      {isGenerating && (
        <div className="absolute bottom-3 right-3 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
          Generating…
        </div>
      )}
    </div>
  )
}
```

### `src/components/codegen/CodeGenPanel.tsx`

- Card layout with toolbar (status badge + action buttons)
- If `!refinedPrompt` return `null` (panel hidden until step 3)
- Toolbar: "Generate Code" button (primary) when no code; "Regenerate" + "Clear" when code exists
- Body: `<MonacoCodeEditor />`

---

## 15. Execution Components

### `src/components/execution/ExecutionPanel.tsx`

- Controls row: status badge, execution time, "Run Code" (green), "Download CSV" (secondary)
- Error section: shows `errorMessage` in a red box with an "Auto-fix" button
- Body: `<OutputPreviewTable />`

### `src/components/execution/OutputPreviewTable.tsx`

- Reads from `executionStore.previewRows` and `previewColumns`
- Sticky header row
- Show up to `APP_CONFIG.preview.rowCount` rows
- Monospace cells; hover highlight

---

## 16. New Layout Components — Library Panels & File Summary

### `src/components/layout/CodeLibraryPanel.tsx`

Collapsible panel in the right sidebar (Engineering Workspace). Displays public and private code snippet lists with search filtering. On load, fetches code content, calls `setGeneratedCode('')` first (to clear editor + increment `loadKey`) then calls `setGeneratedCode(code)` to populate Monaco. Also checks the code cache for matching instructions.

Key behaviours:
- Collapsible with open/close chevron
- Two sections: Public Library and Private Library (each searchable)
- Per-item actions: Load, Share (to public or specific users), Delete
- Share dialog: "Copy to Public" or "Share with users (comma-separated IDs)"
- Uses custom `window` event `code-library-updated` to refresh list after save

### `src/components/layout/InstructionsLibraryPanel.tsx`

Collapsible panel in the right sidebar. Lists saved instruction templates. On load:
1. Fetches the instruction text from the backend
2. Calls the code cache API to check if code was previously generated for this label
3. If cache hit: calls `loadCachedState(rawInstructions, refinedPrompt, label)` to restore full state
4. If no cache: calls `setRawInstructions(text)` + `resetRefined()` + `resetCode()`

Key behaviours:
- Collapsible with open/close chevron
- Searchable list
- Delete with confirmation
- Listens to `instructions-library-updated` custom window event to refresh

### `src/components/layout/FileSummaryModal.tsx`

Modal overlay showing per-column statistics for the uploaded file. Triggered by the "File Summary" button in the Pilot sidebar.

Props: `{ sessionId, filename, onClose }`

Fetches `GET /api/v1/session/{sessionId}/summary` on mount. Displays a table with columns: Field name, Type, Records, Nulls, With Values, Uniques, Key?, Min, Max.

---

## 17. App Layout — `src/App.tsx`

The app uses a **3-panel layout** (`flex h-screen`):

```
┌──────────────────────────────────────────────────────────────────┐
│  AppHeader + WorkflowStepper           (top bar, flex-shrink-0)  │
├──────────────┬─────────────────────────┬─────────────────────────┤
│ PilotSidebar │    MainContent          │    CodeSidebar          │
│ (w-72)       │    (flex-1,             │    (w-80)               │
│              │     overflow-y-auto)    │                         │
│ Data         │                         │ Engineering Workspace   │
│ Workspace    │ - InstructionPanel      │ - Source Console toggle │
│              │ - CodeGenPanel          │ - InstructionsLibrary   │
│ - Dataset    │   (when showCode=true)  │ - CodeLibraryPanel      │
│   Details    │ - ExecutionPanel        │                         │
│ - FileUpload │   (after execution)     │                         │
│   Zone       │                         │                         │
└──────────────┴─────────────────────────┴─────────────────────────┘
```

Key layout details:
- `PilotSidebar` (left, `w-72`): Dataset Details collapsible + Data Ingestion (Manual) collapsible with `FileUploadZone`. "File Summary" and "Re-upload" buttons in Dataset Details header.
- `MainContent` (center, `flex-1`): Instruction Panel always shown after upload. `CodeGenPanel` shown only when `showCode=true` (Source Console toggle). `ExecutionPanel` shown after `status === 'success' | 'error'`.
- `CodeSidebar` (right, `w-80`): Engineering Workspace header. Source Console toggle switch (controls `showCode`). `InstructionsLibraryPanel` + `CodeLibraryPanel`.
- `FileSummaryModal` renders as an overlay portal when "File Summary" clicked.

```typescript
export default function App() {
  const [showCode, setShowCode] = useState(false)
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <div className="flex-shrink-0 z-20">
          <AppHeader />
          <WorkflowStepper />
        </div>
        <div className="flex flex-1 overflow-hidden">
          <PilotSidebar />
          <MainContent codeStudioOpen={showCode} />
          <CodeSidebar showCode={showCode} setShowCode={setShowCode} />
        </div>
      </div>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  )
}
```

---

## 17. Entry Point — `src/main.tsx`

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
```

---

## 18. Build & Dev Commands

```bash
# Start development server (proxies /api → localhost:8000)
npm run dev

# Type-check only (no emit)
npx tsc --noEmit

# Production build
npm run build

# Preview production build locally
npm run preview

# Run tests once
npm run test

# Run tests in watch mode
npm run test:watch
```

---

## 19. Environment Variables

Create a `.env.local` file in the `frontend/` directory (optional for dev):

```
VITE_API_BASE_URL=
```

Keep `VITE_API_BASE_URL` empty in local development so requests use relative paths and
Vite proxies `/api` to `http://127.0.0.1:8000`. Set a full URL only when needed for
non-proxied environments.

All env variables that should be available in the browser **must** be prefixed with `VITE_`.

---

## 20. Common Pitfalls for Coding Agents

| Pitfall | Correct Approach |
|---------|-----------------|
| Using Axios for SSE streaming | Use native `fetch` + `ReadableStream` for SSE endpoints |
| Hardcoding URLs | Always read from `APP_CONFIG` |
| Mutating Zustand state directly | Always use the `set` function from the store |
| Forgetting `noUnusedLocals` is enabled | Remove all unused imports/variables before finishing |
| Using `any` type | Define proper types in `api.types.ts` |
| `import.meta.env` TS error | Ensure `src/vite-env.d.ts` exists with `/// <reference types="vite/client" />` |
| Monaco re-renders causing lost cursor position | Only update `value` prop when streaming; use `onChange` only in edit mode |
