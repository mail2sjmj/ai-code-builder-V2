import { useState } from 'react'
import { Download, Loader2, Play, Wrench } from 'lucide-react'
import { useCodeExecution } from '@/hooks/useCodeExecution'
import { useDownload } from '@/hooks/useDownload'
import { useAutoFix } from '@/hooks/useAutoFix'
import { apiPost } from '@/services/apiClient'
import { useCodeStore } from '@/store/codeStore'
import { useExecutionStore } from '@/store/executionStore'
import { useSessionStore } from '@/store/sessionStore'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { OutputPreviewTable } from './OutputPreviewTable'
import { formatDuration } from '@/utils/formatters'
import { toastError, toastSuccess } from '@/utils/toast'
import type { SaveCodeLibraryRequest, SaveCodeLibraryResponse } from '@/types/api.types'

export function ExecutionPanel() {
  const generatedCode = useCodeStore((s) => s.generatedCode)
  const editedCode = useCodeStore((s) => s.editedCode)
  const sessionId = useSessionStore((s) => s.sessionId)
  const { status, errorMessage, executionTimeMs } = useExecutionStore()
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveVisibility, setSaveVisibility] = useState<'public' | 'private'>('public')
  const [saveLabel, setSaveLabel] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const { executeCode, isExecuting } = useCodeExecution()
  const { downloadCsv, isDownloading } = useDownload()
  const { autoFix, isFixing } = useAutoFix()

  if (!generatedCode || !sessionId) return null

  const canRun = !isExecuting && !isFixing

  const saveToLibrary = async () => {
    const label = saveLabel.trim()
    if (!label) {
      toastError('Please provide a label for the code.')
      return
    }
    setIsSaving(true)
    try {
      const payload: SaveCodeLibraryRequest = {
        code: editedCode || generatedCode,
        label,
        visibility: saveVisibility,
      }
      await apiPost<SaveCodeLibraryResponse>('/code-library/save', payload)
      window.dispatchEvent(new Event('code-library-updated'))
      toastSuccess('Code saved to Code Library.')
      setSaveOpen(false)
      setSaveLabel('')
      setSaveVisibility('public')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save code.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Execute Code</span>
          <StatusBadge status={status} />
          {status === 'success' && executionTimeMs != null && (
            <span className="text-xs text-muted-foreground">
              Completed in {formatDuration(executionTimeMs)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void executeCode()}
            disabled={!canRun}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExecuting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {isExecuting ? 'Running…' : 'Run Code'}
          </button>

          {status === 'success' && (
            <>
              <button
                onClick={() => void downloadCsv()}
                disabled={isDownloading}
                className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                {isDownloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download CSV
              </button>
              <button
                onClick={() => setSaveOpen(true)}
                className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Save in Code Library
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error display with Auto-fix */}
      {status === 'error' && errorMessage && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-destructive">Execution Error</p>
            <button
              onClick={() => void autoFix(sessionId, editedCode, errorMessage)}
              disabled={isFixing || isExecuting}
              className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isFixing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Wrench className="h-3 w-3" />
              )}
              {isFixing ? 'Fixing…' : 'Auto-fix'}
            </button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-destructive">
            {errorMessage}
          </pre>
        </div>
      )}

      {/* Preview table */}
      <OutputPreviewTable />

      {saveOpen && (
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="mb-3 text-sm font-semibold text-foreground">Save the code as:</p>
          <div className="mb-3 flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-xs text-foreground">
              <input
                type="radio"
                checked={saveVisibility === 'public'}
                onChange={() => setSaveVisibility('public')}
              />
              Public
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-foreground">
              <input
                type="radio"
                checked={saveVisibility === 'private'}
                onChange={() => setSaveVisibility('private')}
              />
              Private
            </label>
          </div>
          <input
            type="text"
            value={saveLabel}
            onChange={(e) => setSaveLabel(e.target.value)}
            placeholder="Code label"
            className="mb-3 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => void saveToLibrary()}
              disabled={isSaving}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setSaveOpen(false)}
              disabled={isSaving}
              className="rounded-lg border px-4 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
