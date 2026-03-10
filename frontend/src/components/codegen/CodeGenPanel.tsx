import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Play, RefreshCw, Trash2 } from 'lucide-react'
import { useCodeGeneration } from '@/hooks/useCodeGeneration'
import { useInstructionRefine } from '@/hooks/useInstructionRefine'
import { useCodeExecution } from '@/hooks/useCodeExecution'
import { useCodeStore } from '@/store/codeStore'
import { useInstructionStore } from '@/store/instructionStore'
import { useSessionStore } from '@/store/sessionStore'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { MonacoCodeEditor } from './MonacoCodeEditor'

type SyncStep = 'idle' | 'refining' | 'generating' | 'executing' | 'done'

const STEP_ORDER: SyncStep[] = ['refining', 'generating', 'executing']

const STEP_LABELS: Record<string, string> = {
  refining: 'Refine prompt',
  generating: 'Regenerate code',
  executing: 'Execute against dataset',
}

function StepIndicator({ step, current }: { step: SyncStep; current: SyncStep }) {
  const order = STEP_ORDER.indexOf(step)
  const currentOrder = STEP_ORDER.indexOf(current as SyncStep)

  const isDone = current === 'done' || (currentOrder > order && order >= 0)
  const isActive = step === current
  const isPending = order > currentOrder || currentOrder === -1

  return (
    <div className="flex items-center gap-2">
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
        isDone ? 'bg-green-500 text-white' :
        isActive ? 'bg-primary text-primary-foreground' :
        'bg-muted text-muted-foreground'
      }`}>
        {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : order + 1}
      </span>
      <span className={`text-xs ${
        isActive ? 'font-semibold text-foreground' :
        isDone ? 'text-green-700' :
        'text-muted-foreground'
      }`}>
        {STEP_LABELS[step]}
      </span>
      {isActive && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
    </div>
  )
}

export function CodeGenPanel() {
  const refinedPrompt = useInstructionStore((s) => s.refinedPrompt)
  const setRawInstructions = useInstructionStore((s) => s.setRawInstructions)
  const setInstructionsOutOfSync = useInstructionStore((s) => s.setInstructionsOutOfSync)
  const instructionsOutOfSync = useInstructionStore((s) => s.instructionsOutOfSync)
  const sessionId = useSessionStore((s) => s.sessionId)

  const { generatedCode, isGenerating, resetCode } = useCodeStore()
  const { generateCode } = useCodeGeneration()
  const { refine } = useInstructionRefine()
  const { executeCode } = useCodeExecution()

  const [showSyncDialog, setShowSyncDialog] = useState(false)
  const [syncInstructionsText, setSyncInstructionsText] = useState('')
  const [syncStep, setSyncStep] = useState<SyncStep>('idle')

  if (!refinedPrompt) return null

  const isBusy = syncStep !== 'idle' || isGenerating
  const status = isGenerating ? 'generating' : generatedCode ? 'success' : 'idle'

  const handleRegenerate = () => {
    const { editedCode, generatedCode: currentGenerated } = useCodeStore.getState()
    const hadManualEdits = editedCode.trim() !== currentGenerated.trim()

    if (hadManualEdits) {
      // Show sync dialog FIRST — user decides on instruction update before anything runs
      setSyncInstructionsText(useInstructionStore.getState().rawInstructions)
      setSyncStep('idle')
      setShowSyncDialog(true)
    } else {
      // No edits — regenerate straight from existing refined prompt
      void generateCode()
    }
  }

  const handleSyncYes = async () => {
    try {
      // 1. Update raw instructions in store
      setRawInstructions(syncInstructionsText)

      // 2. Re-refine prompt with updated instructions
      setSyncStep('refining')
      await refine()

      // 3. Regenerate code from new refined prompt
      setSyncStep('generating')
      await generateCode()

      // 4. Execute new code against the uploaded dataset and show results
      if (sessionId) {
        setSyncStep('executing')
        await executeCode()
      }

      setInstructionsOutOfSync(false)
      setSyncStep('done')
      // Brief moment to show "done" before closing
      setTimeout(() => {
        setShowSyncDialog(false)
        setSyncStep('idle')
      }, 700)
    } catch {
      setSyncStep('idle')
      setShowSyncDialog(false)
    }
  }

  const handleSyncNo = () => {
    // User skips instruction update — still regenerate from existing prompt
    // Flag as out-of-sync to gate save until instructions are updated
    setInstructionsOutOfSync(true)
    setShowSyncDialog(false)
    void generateCode()
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Console</span>
          <StatusBadge status={status} />
          {instructionsOutOfSync && (
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              Instructions out of sync
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!generatedCode && !isGenerating && (
            <button
              onClick={() => void generateCode()}
              disabled={isBusy}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Generate Code
            </button>
          )}
          {generatedCode && (
            <>
              <button
                onClick={handleRegenerate}
                disabled={isBusy}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                Regenerate
              </button>
              <button
                onClick={resetCode}
                disabled={isBusy}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* Monaco Editor */}
      <div className="px-2 pb-2 min-h-[420px]">
        <MonacoCodeEditor />
      </div>

      {/* Sync Instructions Dialog */}
      {showSyncDialog && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-lg border border-border bg-white shadow-xl">

              <div className="border-b border-border bg-[#1e3a5f] px-5 py-3 rounded-t-lg">
                <p className="text-sm font-semibold text-slate-100">Update Instructions Before Regenerating</p>
              </div>

              <div className="px-5 py-4 space-y-4">
                {/* Warning banner */}
                <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-sm text-amber-800">
                    Your code was manually edited. Update the instructions below to reflect
                    your changes — the prompt will be re-refined and code regenerated automatically,
                    then executed against your dataset.
                  </p>
                </div>

                {/* Instructions textarea */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Instructions
                    <span className="ml-1 font-normal normal-case text-muted-foreground/70">
                      — edit to reflect your code changes
                    </span>
                  </label>
                  <textarea
                    rows={6}
                    value={syncInstructionsText}
                    onChange={(e) => setSyncInstructionsText(e.target.value)}
                    disabled={syncStep !== 'idle'}
                    className="w-full resize-none rounded border border-border bg-slate-50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                    placeholder="Describe what the code does after your changes…"
                  />
                </div>

                {/* Step progress — shown while processing */}
                {syncStep !== 'idle' && (
                  <div className="space-y-2 rounded-md border border-border bg-muted/20 px-4 py-3">
                    <StepIndicator step="refining" current={syncStep} />
                    <StepIndicator step="generating" current={syncStep} />
                    {sessionId && <StepIndicator step="executing" current={syncStep} />}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                <button
                  onClick={handleSyncNo}
                  disabled={syncStep !== 'idle'}
                  className="rounded border border-border px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-slate-50 disabled:opacity-50"
                >
                  No, Skip
                </button>
                <button
                  onClick={() => void handleSyncYes()}
                  disabled={syncStep !== 'idle' || !syncInstructionsText.trim()}
                  className="flex items-center gap-2 rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {syncStep !== 'idle' && syncStep !== 'done' && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  {syncStep === 'done' ? 'Done!' : 'Yes, Update & Regenerate'}
                </button>
              </div>

            </div>
          </div>
        </>
      )}
    </div>
  )
}
