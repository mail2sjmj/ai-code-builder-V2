import { useState } from 'react'
import { BookmarkPlus, ChevronDown, ChevronRight, Loader2, Play } from 'lucide-react'
import { useInstructionRefine } from '@/hooks/useInstructionRefine'
import { useCodeGeneration } from '@/hooks/useCodeGeneration'
import { useCodeExecution } from '@/hooks/useCodeExecution'
import { useCodeStore } from '@/store/codeStore'
import { useInstructionStore } from '@/store/instructionStore'
import { useSessionStore } from '@/store/sessionStore'
import { apiPost } from '@/services/apiClient'
import { toastError, toastSuccess } from '@/utils/toast'
import { RawInstructionBox, SKIP_INSTRUCTION } from './RawInstructionBox'
import { cn } from '@/lib/utils'
import type { SaveInstructionLibraryRequest, SaveInstructionLibraryResponse } from '@/types/api.types'

export function InstructionPanel() {
  const [logOpen, setLogOpen] = useState(false)
  const [showAIGeneratedPrompt, setShowAIGeneratedPrompt] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveLabel, setSaveLabel] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState(false)

  const { refine, isRefining } = useInstructionRefine()
  const { generateCode, isGenerating } = useCodeGeneration()
  const { executeCode, isExecuting } = useCodeExecution()
  const rawInstructions = useInstructionStore((s) => s.rawInstructions)
  const refinedPrompt = useInstructionStore((s) => s.refinedPrompt)
  const isFromCache = useInstructionStore((s) => s.isFromCache)
  const setActiveSavedLabel = useInstructionStore((s) => s.setActiveSavedLabel)
  const generatedCode = useCodeStore((s) => s.generatedCode)
  const sessionId = useSessionStore((s) => s.sessionId)
  const setCurrentStep = useSessionStore((s) => s.setCurrentStep)

  const skipSelected = rawInstructions.trim() === SKIP_INSTRUCTION
  const canExecute = !!sessionId && (skipSelected || rawInstructions.trim().length >= 20) && !isRefining && !isGenerating && !isExecuting
  const canSave = rawInstructions.trim().length >= 1 && !skipSelected
  const hasRefinedOutput = refinedPrompt.trim().length > 0

  const handleExecute = async () => {
    if (!skipSelected && !isFromCache) {
      setCurrentStep(2)
      await refine()
      await generateCode()
    }
    await executeCode()
  }

  const saveToLibrary = async (overwrite = false) => {
    const label = saveLabel.trim()
    if (!label) {
      toastError('Please provide a label for the instruction.')
      return
    }
    setIsSaving(true)
    setDuplicateWarning(false)
    try {
      const payload: SaveInstructionLibraryRequest = {
        instruction: rawInstructions,
        label,
        overwrite,
        session_id: sessionId ?? undefined,
      }
      await apiPost<SaveInstructionLibraryResponse>('/instructions-library/save', payload)
      window.dispatchEvent(new Event('instructions-library-updated'))
      setActiveSavedLabel(label)
      toastSuccess('Instruction saved to Instructions Library.')
      setSaveOpen(false)
      setSaveLabel('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('[LABEL_EXISTS]')) {
        setDuplicateWarning(true)
      } else {
        toastError(msg || 'Failed to save instruction.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const stages = [
    {
      name: 'Stage 1: Input Validation',
      detail: 'Validate session + raw instruction quality',
      state: rawInstructions.trim().length >= 20 ? 'complete' : 'pending',
    },
    {
      name: 'Stage 2: Retrieval',
      detail: 'Resolve dataset schema and relevant context',
      state: isRefining ? 'active' : hasRefinedOutput ? 'complete' : 'pending',
    },
    {
      name: 'Stage 3: Augmentation',
      detail: 'Inject retrieved context into prompt template',
      state: isRefining ? 'active' : hasRefinedOutput ? 'complete' : 'pending',
    },
    {
      name: 'Stage 4: Structured Prompt',
      detail: 'Generate refined output for code generation',
      state: isRefining ? 'active' : hasRefinedOutput ? 'complete' : 'pending',
    },
    {
      name: 'Stage 5: Code Generation',
      detail: 'Build executable Python code from refined prompt',
      state: isGenerating ? 'active' : generatedCode ? 'complete' : 'pending',
    },
  ] as const

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-card">
        <button
          type="button"
          onClick={() => setLogOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-xs italic font-semibold text-foreground">RAG Flow Logging</span>
          <span className="text-muted-foreground">
            {logOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </button>

        {logOpen && (
          <div className="space-y-3 border-t px-4 py-3">
            <div className="space-y-2">
              {stages.map((stage) => (
                <div key={stage.name} className="flex items-start gap-2 rounded-md bg-muted/30 px-2 py-2">
                  <span
                    className={cn(
                      'mt-1 inline-block h-2 w-2 shrink-0 rounded-full',
                      stage.state === 'complete' && 'bg-green-500',
                      stage.state === 'active' && 'bg-blue-500 animate-pulse',
                      stage.state === 'pending' && 'bg-muted-foreground/40',
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">{stage.name}</p>
                    <p className="text-xs text-muted-foreground">{stage.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            <label className="inline-flex items-center gap-2 rounded-md border bg-background/70 px-3 py-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={showAIGeneratedPrompt}
                onChange={(e) => setShowAIGeneratedPrompt(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              Show AI generated prompt
            </label>

            {showAIGeneratedPrompt && (
              <div className="rounded-md border bg-background/70 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Refined Prompt Output
                </p>
                {!hasRefinedOutput && !isRefining && (
                  <p className="text-xs text-muted-foreground">
                    Run Build Code to populate RAG output logs.
                  </p>
                )}
                {(hasRefinedOutput || isRefining) && (
                  <div className={cn('max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-foreground')}>
                    {refinedPrompt}
                    {isRefining && (
                      <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-primary align-middle" />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        <RawInstructionBox />
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => { setSaveOpen(true); setDuplicateWarning(false) }}
          disabled={!canSave}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-opacity hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          title="Save instruction to library"
        >
          <BookmarkPlus className="h-4 w-4" />
          Save
        </button>

        <button
          onClick={() => void handleExecute()}
          disabled={!canExecute}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-8 py-2.5 text-sm font-medium text-white shadow transition-opacity hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isRefining ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Refining...</>
          ) : isGenerating ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Generating...</>
          ) : isExecuting ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Executing...</>
          ) : (
            <><Play className="h-4 w-4" />Execute</>
          )}
        </button>
      </div>

      {/* Save to Instructions Library — modal */}
      {saveOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => !isSaving && setSaveOpen(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-lg border border-border bg-white shadow-xl">
              <div className="border-b border-border bg-[#1e3a5f] px-5 py-3 rounded-t-lg">
                <p className="text-sm font-semibold text-slate-100">Save to Instructions Library</p>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Label</p>
                  <input
                    type="text"
                    value={saveLabel}
                    onChange={(e) => { setSaveLabel(e.target.value); setDuplicateWarning(false) }}
                    placeholder="Enter a label for this instruction..."
                    autoFocus
                    className="w-full rounded border border-border bg-slate-50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {duplicateWarning && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5">
                    <p className="mb-2 text-xs font-semibold text-amber-800">
                      An instruction with this label already exists. Override it?
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
              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                <button
                  onClick={() => { setSaveOpen(false); setDuplicateWarning(false) }}
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
