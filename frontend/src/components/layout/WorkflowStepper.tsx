import { Check, Loader2 } from 'lucide-react'
import { useCodeStore } from '@/store/codeStore'
import { useExecutionStore } from '@/store/executionStore'
import { useInstructionStore } from '@/store/instructionStore'
import { useSessionStore } from '@/store/sessionStore'
import { cn } from '@/lib/utils'

const STEPS = [
  { id: 1, label: 'Upload Data',         description: 'Import your dataset' },
  { id: 2, label: 'Instructions',        description: 'Describe what you need' },
  { id: 3, label: 'Refine',              description: 'AI-enhanced prompt' },
  { id: 4, label: 'Generate Code',       description: 'Python script created' },
  { id: 5, label: 'Execute',             description: 'Run & download results' },
] as const

export function WorkflowStepper() {
  const currentStep = useSessionStore((s) => s.currentStep)
  const isRefining = useInstructionStore((s) => s.isRefining)
  const isGenerating = useCodeStore((s) => s.isGenerating)
  const executionStatus = useExecutionStore((s) => s.status)

  const isStepSpinning = (stepId: number): boolean => {
    if (stepId === 3) return isRefining
    if (stepId === 4) return isGenerating
    if (stepId === 5) return executionStatus === 'queued' || executionStatus === 'running'
    return false
  }

  return (
    <div className="border-b bg-gradient-to-b from-muted/40 to-transparent">
      <nav className="mx-auto flex max-w-7xl items-center justify-center px-6 py-5">
        {STEPS.map((step, idx) => {
          const isDone    = step.id < currentStep
          const isActive  = step.id === currentStep
          const isPending = step.id > currentStep
          const spinning  = isActive && isStepSpinning(step.id)

          return (
            <div key={step.id} className="flex items-center">
              {/* Connector */}
              {idx > 0 && (
                <div className="relative mx-1 h-px w-10 sm:w-16">
                  <div className="absolute inset-0 bg-border" />
                  {isDone && (
                    <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary transition-all duration-500" />
                  )}
                </div>
              )}

              {/* Step node */}
              <div className="flex flex-col items-center gap-1.5 group">
                {/* Circle */}
                <div
                  className={cn(
                    'relative flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-300',
                    isDone  && 'border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25',
                    isActive && !spinning && 'border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-primary/15',
                    isActive && spinning && 'border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-primary/15',
                    isPending && 'border-border bg-background text-muted-foreground',
                  )}
                >
                  {isDone && <Check className="h-4 w-4 stroke-[3]" />}
                  {isActive && spinning && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isActive && !spinning && <span className="h-2 w-2 rounded-full bg-primary-foreground" />}
                  {isPending && <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />}
                </div>

                {/* Label */}
                <div className="flex flex-col items-center gap-0.5">
                  <span
                    className={cn(
                      'text-xs font-semibold whitespace-nowrap transition-colors',
                      (isDone || isActive) ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {step.label}
                  </span>
                  <span
                    className={cn(
                      'hidden sm:block text-[10px] whitespace-nowrap transition-colors',
                      isActive ? 'text-primary font-medium' : 'text-muted-foreground/60',
                    )}
                  >
                    {step.description}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </nav>
    </div>
  )
}
