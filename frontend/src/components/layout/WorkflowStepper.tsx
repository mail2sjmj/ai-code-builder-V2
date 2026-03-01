import { Check, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useCodeStore } from '@/store/codeStore'
import { useExecutionStore } from '@/store/executionStore'
import { useInstructionStore } from '@/store/instructionStore'
import { useSessionStore } from '@/store/sessionStore'
import { cn } from '@/lib/utils'

const STEPS = [
  { id: 2, label: 'Instructions',  description: 'Describe what you need' },
  { id: 3, label: 'Refine',        description: 'AI-enhanced prompt' },
  { id: 4, label: 'Generate Code', description: 'Python script created' },
  { id: 5, label: 'Execute',       description: 'Run & download results' },
] as const

// Circle diameter h-9 = 2.25rem; half aligns the bar to circle vertical centers.
const CIRCLE_HALF = '1.125rem'

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`
}

export function WorkflowStepper() {
  const currentStep     = useSessionStore((s) => s.currentStep)
  const isRefining      = useInstructionStore((s) => s.isRefining)
  const isGenerating    = useCodeStore((s) => s.isGenerating)
  const executionStatus = useExecutionStore((s) => s.status)
  const executionTimeMs = useExecutionStore((s) => s.executionTimeMs)

  // durations[stepId] = ms the step's processing took (final, shown when done)
  const [durations, setDurations] = useState<Partial<Record<number, number>>>({})
  // live ms for whichever step is currently spinning
  const [elapsed, setElapsed] = useState(0)

  const stepStartTimes   = useRef<Partial<Record<number, number>>>({ 1: Date.now() })
  const prevStepRef      = useRef(currentStep)
  const refineStartRef   = useRef<number | null>(null)
  const generateStartRef = useRef<number | null>(null)
  const executeStartRef  = useRef<number | null>(null)

  // Steps 1 & 2 — record when currentStep advances
  useEffect(() => {
    const prev = prevStepRef.current
    if (currentStep > prev) {
      const start = stepStartTimes.current[prev]
      if (start != null) {
        setDurations((d) => ({ ...d, [prev]: Date.now() - start }))
      }
      stepStartTimes.current[currentStep] = Date.now()
    } else if (currentStep < prev) {
      // Session reset — clear all timings
      setDurations({})
      stepStartTimes.current = { 1: Date.now() }
    }
    prevStepRef.current = currentStep
  }, [currentStep])

  // Step 3 — AI refine
  useEffect(() => {
    if (isRefining) {
      refineStartRef.current = Date.now()
    } else if (refineStartRef.current != null) {
      setDurations((d) => ({ ...d, 3: Date.now() - refineStartRef.current! }))
      refineStartRef.current = null
    }
  }, [isRefining])

  // Step 4 — code generation
  useEffect(() => {
    if (isGenerating) {
      generateStartRef.current = Date.now()
    } else if (generateStartRef.current != null) {
      setDurations((d) => ({ ...d, 4: Date.now() - generateStartRef.current! }))
      generateStartRef.current = null
    }
  }, [isGenerating])

  // Step 5 — execution start (duration comes from executionTimeMs, tracked by backend)
  useEffect(() => {
    if (executionStatus === 'queued' || executionStatus === 'running') {
      if (executeStartRef.current == null) executeStartRef.current = Date.now()
    } else {
      executeStartRef.current = null
    }
  }, [executionStatus])

  // Live elapsed counter — ticks every 100 ms while any step is spinning
  const anySpinning =
    isRefining || isGenerating ||
    executionStatus === 'queued' || executionStatus === 'running'

  useEffect(() => {
    if (!anySpinning) { setElapsed(0); return }
    const id = setInterval(() => {
      const ref = isRefining   ? refineStartRef.current
               : isGenerating  ? generateStartRef.current
               :                 executeStartRef.current
      setElapsed(ref != null ? Date.now() - ref : 0)
    }, 100)
    return () => clearInterval(id)
  }, [anySpinning, isRefining, isGenerating])

  const isStepSpinning = (stepId: number): boolean => {
    if (stepId === 3) return isRefining
    if (stepId === 4) return isGenerating
    if (stepId === 5) return executionStatus === 'queued' || executionStatus === 'running'
    return false
  }

  // Step 5 uses the backend-reported time; all others use our wall-clock tracking
  const getDuration = (stepId: number): number | null =>
    stepId === 5 && executionTimeMs != null ? executionTimeMs : (durations[stepId] ?? null)

  // Fraction based on visible steps: how many are done out of total gaps
  const doneCount = STEPS.filter((s) => s.id < currentStep).length
  const progressFraction = doneCount / (STEPS.length - 1)

  return (
    <div className="border-b bg-background/95 backdrop-blur-sm">
      <nav className="mx-auto max-w-7xl px-6 py-5">
        <div className="relative mx-auto max-w-2xl">

          {/* ── Track ─────────────────────────────────────────────────────────── */}
          <div
            className="absolute h-1 rounded-full bg-border"
            style={{ top: CIRCLE_HALF, left: CIRCLE_HALF, right: CIRCLE_HALF, transform: 'translateY(-50%)' }}
          />

          {/* ── Fill ──────────────────────────────────────────────────────────── */}
          <div
            className="absolute h-1 rounded-full bg-green-500 transition-all duration-500"
            style={{
              top:   CIRCLE_HALF,
              left:  CIRCLE_HALF,
              width: `calc((100% - 2 * ${CIRCLE_HALF}) * ${progressFraction})`,
              transform: 'translateY(-50%)',
            }}
          />

          {/* ── Step nodes ────────────────────────────────────────────────────── */}
          <div className="relative flex justify-between">
            {STEPS.map((step) => {
              const isDone    = step.id < currentStep
              const isActive  = step.id === currentStep
              const isPending = step.id > currentStep
              const spinning  = isActive && isStepSpinning(step.id)
              const dur       = getDuration(step.id)

              return (
                <div key={step.id} className="relative z-10 flex flex-col items-center gap-1.5">

                  {/* Circle */}
                  <div
                    className={cn(
                      'relative flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-300',
                      isDone    && 'border-green-500 bg-green-500 text-white shadow-md shadow-green-500/25',
                      spinning  && 'border-yellow-400 bg-yellow-400 text-yellow-900 shadow-lg shadow-yellow-400/30 ring-4 ring-yellow-400/20',
                      isActive && !spinning && 'border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-primary/15',
                      isPending && 'border-border bg-background text-muted-foreground',
                    )}
                  >
                    {isDone           && <Check   className="h-4 w-4 stroke-[3]" />}
                    {spinning         && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isActive && !spinning && <span className="h-2 w-2 rounded-full bg-primary-foreground" />}
                    {isPending        && <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />}
                  </div>

                  {/* Label + description + duration */}
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
                        spinning   ? 'text-yellow-600 font-medium'
                        : isDone   ? 'text-green-600/70'
                        : isActive ? 'text-primary font-medium'
                        :            'text-muted-foreground/60',
                      )}
                    >
                      {step.description}
                    </span>

                    {/* Live elapsed while spinning */}
                    {spinning && (
                      <span className="text-[10px] font-mono tabular-nums text-yellow-600">
                        {formatDuration(elapsed)}
                      </span>
                    )}

                    {/* Final duration once done */}
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
