import { useState } from 'react'
import { AlertTriangle, Download, Loader2, Play, Wrench } from 'lucide-react'
import { useCodeExecution } from '@/hooks/useCodeExecution'
import { useDownload } from '@/hooks/useDownload'
import { useAutoFix } from '@/hooks/useAutoFix'
import { apiPost } from '@/services/apiClient'
import { useCodeStore } from '@/store/codeStore'
import { useExecutionStore } from '@/store/executionStore'
import { useSessionStore } from '@/store/sessionStore'
import { useInstructionStore } from '@/store/instructionStore'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { OutputPreviewTable } from './OutputPreviewTable'
import { formatDuration } from '@/utils/formatters'
import { toastError, toastSuccess } from '@/utils/toast'
import type { SaveCodeLibraryRequest, SaveCodeLibraryResponse, SaveInstructionLibraryRequest } from '@/types/api.types'

export function ExecutionPanel() {
  const generatedCode = useCodeStore((s) => s.generatedCode)
  const editedCode = useCodeStore((s) => s.editedCode)
  const sessionId = useSessionStore((s) => s.sessionId)
  const rawInstructions = useInstructionStore((s) => s.rawInstructions)
  const setActiveSavedLabel = useInstructionStore((s) => s.setActiveSavedLabel)
  const instructionsOutOfSync = useInstructionStore((s) => s.instructionsOutOfSync)
  const { status, errorMessage, executionTimeMs } = useExecutionStore()
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveVisibility, setSaveVisibility] = useState<'public' | 'private'>('public')
  const [saveLabel, setSaveLabel] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState(false)
  const [syncBlockOpen, setSyncBlockOpen] = useState(false)
  const { executeCode, isExecuting } = useCodeExecution()
  const { downloadCsv, isDownloading } = useDownload()
  const { autoFix, isFixing } = useAutoFix()

  if (!generatedCode || !sessionId) return null

  const canRun = !isExecuting && !isFixing

  const handleSaveClick = () => {
    if (instructionsOutOfSync) {
      setSyncBlockOpen(true)
      return
    }
    setSaveOpen(true)
  }

  const saveToLibrary = async (overwrite = false) => {
    const label = saveLabel.trim()
    if (!label) {
      toastError('Please provide a label for the code.')
      return
    }
    setIsSaving(true)
    setDuplicateWarning(false)
    try {
      const payload: SaveCodeLibraryRequest = {
        code: editedCode || generatedCode,
        label,
        visibility: saveVisibility,
        overwrite,
        session_id: sessionId ?? undefined,
      }
      await apiPost<SaveCodeLibraryResponse>('/code-library/save', payload)
      window.dispatchEvent(new Event('code-library-updated'))

      // Auto-save instructions paired with this function label
      const instruction = rawInstructions.trim()
      if (instruction) {
        const instrLabel = `${label}_instr`
        const instrPayload: SaveInstructionLibraryRequest = {
          instruction,
          label: instrLabel,
          overwrite: true,
          session_id: sessionId ?? undefined,
        }
        await apiPost('/instructions-library/save', instrPayload)
        window.dispatchEvent(new Event('instructions-library-updated'))
        setActiveSavedLabel(instrLabel)

        // Keep code cache in sync so loading from library always shows latest instructions
        void apiPost('/code-cache/save', {
          label: instrLabel,
          code: editedCode || generatedCode,
          raw_instructions: instruction,
          refined_prompt: useInstructionStore.getState().refinedPrompt,
        })
      }

      toastSuccess('Code saved to Functions Library.')
      setSaveOpen(false)
      setSaveLabel('')
      setSaveVisibility('public')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('[LABEL_EXISTS]')) {
        setDuplicateWarning(true)
      } else {
        toastError(msg || 'Failed to save code.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Results</span>
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
            {isExecuting ? 'Running…' : 'Re-run'}
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
                onClick={handleSaveClick}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  instructionsOutOfSync
                    ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : 'hover:bg-muted'
                }`}
              >
                {instructionsOutOfSync && <AlertTriangle className="h-4 w-4" />}
                Save in Functions Library
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

      {/* Instructions out-of-sync block — shown when user skipped the sync dialog */}
      {syncBlockOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setSyncBlockOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-lg border border-border bg-white shadow-xl">
              <div className="border-b border-border bg-amber-600 px-5 py-3 rounded-t-lg">
                <p className="text-sm font-semibold text-white">Instructions Out of Sync</p>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <p className="text-sm text-foreground">
                    Your instructions are out of sync with the current code. Please update your
                    instructions before saving this function to ensure the library stays consistent.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Go to the <strong>Source Console</strong>, click <strong>Regenerate</strong>, and
                  choose <em>"Yes, Update Instructions"</em> when prompted.
                </p>
              </div>
              <div className="flex justify-end border-t border-border px-5 py-3">
                <button
                  onClick={() => setSyncBlockOpen(false)}
                  className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Save to Functions Library — modal */}
      {saveOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => { if (!isSaving) { setSaveOpen(false); setSaveLabel(''); setSaveVisibility('public'); setDuplicateWarning(false) } }}
          />
          {/* Dialog */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-lg border border-border bg-white shadow-xl">
              {/* Header */}
              <div className="border-b border-border bg-[#1e3a5f] px-5 py-3 rounded-t-lg">
                <p className="text-sm font-semibold text-slate-100">Save to Functions Library</p>
              </div>
              {/* Body */}
              <div className="px-5 py-4 space-y-4">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visibility</p>
                  <div className="flex items-center gap-5">
                    <label className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <input
                        type="radio"
                        checked={saveVisibility === 'public'}
                        onChange={() => setSaveVisibility('public')}
                        className="accent-primary"
                      />
                      Public
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <input
                        type="radio"
                        checked={saveVisibility === 'private'}
                        onChange={() => setSaveVisibility('private')}
                        className="accent-primary"
                      />
                      Private
                    </label>
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Code Label</p>
                  <input
                    type="text"
                    value={saveLabel}
                    onChange={(e) => { setSaveLabel(e.target.value); setDuplicateWarning(false) }}
                    placeholder="Enter a label for this code..."
                    autoFocus
                    className="w-full rounded border border-border bg-slate-50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {duplicateWarning && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5">
                    <p className="mb-2 text-xs font-semibold text-amber-800">
                      A file with this label already exists in the library. Override it?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void saveToLibrary(true)}
                        disabled={isSaving}
                        className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        Yes, Override
                      </button>
                      <button
                        onClick={() => setDuplicateWarning(false)}
                        className="rounded border border-amber-400 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {/* Footer */}
              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                <button
                  onClick={() => { setSaveOpen(false); setSaveLabel(''); setSaveVisibility('public'); setDuplicateWarning(false) }}
                  disabled={isSaving}
                  className="rounded border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                {!duplicateWarning && (
                  <button
                    onClick={() => void saveToLibrary()}
                    disabled={isSaving}
                    className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
