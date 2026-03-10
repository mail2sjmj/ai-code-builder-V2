import { Check, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useCodeStore } from '@/store/codeStore'
import { useExecutionStore } from '@/store/executionStore'
import { useInstructionStore } from '@/store/instructionStore'
import { useSessionStore } from '@/store/sessionStore'
import { cn } from '@/lib/utils'

const STEPS = [
  { id: 1, label: 'Instructions', description: 'Describe what you need' },
  { id: 2, label: 'Refine', description: 'AI-enhanced prompt' },
  { id: 3, label: 'Generate Code', description: 'Python script created' },
  { id: 4, label: 'Execute', description: 'Run and view results' },
] as const

// Circle diameter h-9 = 2.25rem; half aligns the bar to circle centers.
const CIRCLE_HALF = '1.125rem'

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`
}

function normalizeDuration(ms: number | null): number | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null
  // Protect against rendering absolute timestamps as elapsed time.
  if (ms > 7 * 24 * 60 * 60 * 1000) return null
  return ms
}

export function WorkflowStepper() {
  const currentStep = useSessionStore((s) => s.currentStep)
  const isRefining = useInstructionStore((s) => s.isRefining)
  const isGenerating = useCodeStore((s) => s.isGenerating)
  const executionStatus = useExecutionStore((s) => s.status)
  const executionTimeMs = useExecutionStore((s) => s.executionTimeMs)

  // Final step durations in milliseconds.
  const [durations, setDurations] = useState<Partial<Record<number, number>>>({})
  // Live ms for whichever step is currently spinning.
  const [elapsed, setElapsed] = useState(0)

  const instructionsStartRef = useRef<number | null>(null)
  const refineStartRef = useRef<number | null>(null)
  const generateStartRef = useRef<number | null>(null)
  const executeStartRef = useRef<number | null>(null)

  // Step 1 timing: from entering step 1 until we move past it.
  useEffect(() => {
    if (currentStep === 0) {
      setDurations({})
      instructionsStartRef.current = null
      refineStartRef.current = null
      generateStartRef.current = null
      executeStartRef.current = null
      return
    }

    if (currentStep === 1 && instructionsStartRef.current === null) {
      instructionsStartRef.current = Date.now()
    }

    if (currentStep > 1 && instructionsStartRef.current !== null) {
      const step1Ms = Date.now() - instructionsStartRef.current
      setDurations((d) => ({ ...d, 1: step1Ms }))
      instructionsStartRef.current = null
    }
  }, [currentStep])

  // Step 2 timing: refine request lifecycle.
  useEffect(() => {
    if (isRefining && refineStartRef.current === null) {
      refineStartRef.current = Date.now()
      return
    }

    if (!isRefining && refineStartRef.current !== null) {
      const step2Ms = Date.now() - refineStartRef.current
      setDurations((d) => ({ ...d, 2: step2Ms }))
      refineStartRef.current = null
    }
  }, [isRefining])

  // Step 3 timing: generate request lifecycle.
  useEffect(() => {
    if (isGenerating && generateStartRef.current === null) {
      generateStartRef.current = Date.now()
      return
    }

    if (!isGenerating && generateStartRef.current !== null) {
      const step3Ms = Date.now() - generateStartRef.current
      setDurations((d) => ({ ...d, 3: step3Ms }))
      generateStartRef.current = null
    }
  }, [isGenerating])

  // Step 5 start marker (final duration comes from backend).
  useEffect(() => {
    if (executionStatus === 'queued' || executionStatus === 'running') {
      if (executeStartRef.current === null) executeStartRef.current = Date.now()
      return
    }
    executeStartRef.current = null
  }, [executionStatus])

  // Live elapsed counter while any step is spinning.
  const anySpinning =
    isRefining ||
    isGenerating ||
    executionStatus === 'queued' ||
    executionStatus === 'running'

  useEffect(() => {
    if (!anySpinning) {
      setElapsed(0)
      return
    }

    const id = setInterval(() => {
      const ref = isRefining
        ? refineStartRef.current
        : isGenerating
          ? generateStartRef.current
          : executeStartRef.current
      setElapsed(ref != null ? Date.now() - ref : 0)
    }, 100)

    return () => clearInterval(id)
  }, [anySpinning, isRefining, isGenerating])

  const isStepSpinning = (stepId: number): boolean => {
    if (stepId === 2) return isRefining
    if (stepId === 3) return isGenerating
    if (stepId === 4) return executionStatus === 'queued' || executionStatus === 'running'
    return false
  }

  const getDuration = (stepId: number): number | null => {
    // Do not show elapsed time under "Instructions".
    if (stepId === 1) return null
    const raw = stepId === 4 && executionTimeMs != null ? executionTimeMs : (durations[stepId] ?? null)
    return normalizeDuration(raw)
  }

  // Fraction based on visible steps: done steps out of total gaps.
  const doneCount = STEPS.filter((s) => s.id < currentStep).length
  const progressFraction = doneCount / (STEPS.length - 1)

  return (
    <div className="border-b bg-background/95 backdrop-blur-sm">
      <nav className="mx-auto max-w-7xl px-6 py-5">
        <div className="relative mx-auto max-w-2xl">
          <div
            className="absolute h-1 rounded-full bg-border"
            style={{ top: CIRCLE_HALF, left: CIRCLE_HALF, right: CIRCLE_HALF, transform: 'translateY(-50%)' }}
          />

          <div
            className="absolute h-1 rounded-full bg-green-500 transition-all duration-500"
            style={{
              top: CIRCLE_HALF,
              left: CIRCLE_HALF,
              width: `calc((100% - 2 * ${CIRCLE_HALF}) * ${progressFraction})`,
              transform: 'translateY(-50%)',
            }}
          />

          <div className="relative flex justify-between">
            {STEPS.map((step) => {
              const isStep5Terminal = step.id === 4 && (executionStatus === 'success' || executionStatus === 'error')
              const isDone = step.id < currentStep || isStep5Terminal
              const isActive = step.id === currentStep && !isStep5Terminal
              const isPending = step.id > currentStep
              const spinning = isActive && isStepSpinning(step.id)
              const dur = getDuration(step.id)

              return (
                <div key={step.id} className="relative z-10 flex flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      'relative flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-300',
                      isDone && 'border-green-500 bg-green-500 text-white shadow-md shadow-green-500/25',
                      spinning &&
                        'border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-primary/15',
                      isActive &&
                        !spinning &&
                        'border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-primary/15',
                      isPending && 'border-border bg-background text-muted-foreground',
                    )}
                  >
                    {isDone && <Check className="h-4 w-4 stroke-[3]" />}
                    {spinning && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isActive && !spinning && <span className="h-2 w-2 rounded-full bg-primary-foreground" />}
                    {isPending && <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />}
                  </div>

                  <div className="flex flex-col items-center gap-0.5">
                    <span
                      className={cn(
                        'text-xs font-semibold whitespace-nowrap transition-colors',
                        isDone ? 'text-green-600' : isActive ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {step.label}
                    </span>
                    <span
                      className={cn(
                        'hidden sm:block text-[10px] whitespace-nowrap transition-colors',
                        spinning
                          ? 'text-primary font-medium'
                          : isDone
                            ? 'text-green-600/70'
                            : isActive
                              ? 'text-primary font-medium'
                              : 'text-muted-foreground/60',
                      )}
                    >
                      {step.description}
                    </span>

                    {spinning && (
                      <span className="text-[10px] font-mono tabular-nums text-primary">
                        {formatDuration(elapsed)}
                      </span>
                    )}

                    {isDone && dur != null && (
                      <span className="text-[10px] font-mono tabular-nums text-green-600/80">
                        {formatDuration(dur)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </nav>
    </div>
  )
}
