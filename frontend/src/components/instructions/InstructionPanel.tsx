import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Play, Sparkles } from 'lucide-react'
import { useInstructionRefine } from '@/hooks/useInstructionRefine'
import { useCodeGeneration } from '@/hooks/useCodeGeneration'
import { useCodeExecution } from '@/hooks/useCodeExecution'
import { useCodeStore } from '@/store/codeStore'
import { useInstructionStore } from '@/store/instructionStore'
import { useSessionStore } from '@/store/sessionStore'
import { RawInstructionBox, SKIP_INSTRUCTION } from './RawInstructionBox'
import { cn } from '@/lib/utils'

export function InstructionPanel() {
  const [logOpen, setLogOpen] = useState(false)
  const [showAIGeneratedPrompt, setShowAIGeneratedPrompt] = useState(false)
  const { refine, isRefining } = useInstructionRefine()
  const { generateCode, isGenerating } = useCodeGeneration()
  const { executeCode, isExecuting } = useCodeExecution()
  const rawInstructions = useInstructionStore((s) => s.rawInstructions)
  const refinedPrompt = useInstructionStore((s) => s.refinedPrompt)
  const generatedCode = useCodeStore((s) => s.generatedCode)
  const sessionId = useSessionStore((s) => s.sessionId)

  const skipSelected = rawInstructions.trim() === SKIP_INSTRUCTION
  const canBuild = !!sessionId && rawInstructions.trim().length >= 20 && !isRefining && !isGenerating
  const canExecute = (!!generatedCode || skipSelected) && !isExecuting && !isRefining && !isGenerating
  const hasRefinedOutput = refinedPrompt.trim().length > 0

  const handleBuildCode = async () => {
    await refine()
    await generateCode()
  }

  const handleExecute = async () => {
    if (!generatedCode && skipSelected) {
      await handleBuildCode()
    }
    await executeCode()
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

      <div className="flex justify-center gap-3">
        <button
          onClick={() => void handleBuildCode()}
          disabled={!canBuild}
          className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isRefining || isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Building...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Build Code
            </>
          )}
        </button>

        <button
          onClick={() => void handleExecute()}
          disabled={!canExecute}
          className={cn(
            'flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium text-white shadow transition-opacity',
            skipSelected
              ? 'bg-green-600 ring-2 ring-offset-1 ring-green-400 hover:bg-green-700'
              : 'bg-green-600 hover:bg-green-700',
            'disabled:cursor-not-allowed disabled:opacity-40',
          )}
        >
          {isExecuting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Executing...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Execute
            </>
          )}
        </button>
      </div>
    </div>
  )
}
