import { create } from 'zustand'

type ExecutionStatus = 'idle' | 'queued' | 'running' | 'success' | 'error'

interface ExecutionState {
  jobId: string | null
  sessionId: string | null
  status: ExecutionStatus
  previewRows: Record<string, unknown>[]
  previewColumns: string[]
  errorMessage: string | null
  executionTimeMs: number | null
  setJobId: (id: string) => void
  setSessionId: (id: string) => void
  setStatus: (status: ExecutionStatus) => void
  setResults: (rows: Record<string, unknown>[], columns: string[], timeMs: number | null) => void
  setError: (msg: string) => void
  clearError: () => void
  reset: () => void
}

export const useExecutionStore = create<ExecutionState>((set) => ({
  jobId: null,
  sessionId: null,
  status: 'idle',
  previewRows: [],
  previewColumns: [],
  errorMessage: null,
  executionTimeMs: null,
  setJobId: (id) => set({ jobId: id }),
  setSessionId: (id) => set({ sessionId: id }),
  setStatus: (status) => set({ status }),
  setResults: (rows, columns, timeMs) =>
    set({ previewRows: rows, previewColumns: columns, executionTimeMs: timeMs, status: 'success', errorMessage: null }),
  setError: (msg) => set({ errorMessage: msg, status: 'error' }),
  clearError: () => set({ errorMessage: null }),
  reset: () =>
    set({
      jobId: null,
      status: 'idle',
      previewRows: [],
      previewColumns: [],
      errorMessage: null,
      executionTimeMs: null,
    }),
}))
