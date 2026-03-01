import { useState } from 'react'
import { Toaster } from 'sonner'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppHeader } from '@/components/layout/AppHeader'
import { WorkflowStepper } from '@/components/layout/WorkflowStepper'
import { FileUploadZone } from '@/components/upload/FileUploadZone'
import { InstructionPanel } from '@/components/instructions/InstructionPanel'
import { CodeGenPanel } from '@/components/codegen/CodeGenPanel'
import { ExecutionPanel } from '@/components/execution/ExecutionPanel'
import { useSessionStore } from '@/store/sessionStore'
import { cn } from '@/lib/utils'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
})

interface StepHeadingProps {
  title: string
  subtitle: string
  titleClassName?: string
}

function StepHeading({ title, subtitle, titleClassName }: StepHeadingProps) {
  return (
    <div className="mb-4">
      <h2 className={cn('text-base font-bold leading-tight text-foreground', titleClassName)}>{title}</h2>
      <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  )
}

interface MainContentProps {
  codeStudioOpen: boolean
}

function MainContent({ codeStudioOpen }: MainContentProps) {
  const { sessionId, currentStep } = useSessionStore()

  return (
    <main className="flex-1 overflow-y-auto px-6 py-6 space-y-8">

      {/* Empty state before upload */}
      {!sessionId && (
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
          <p className="text-sm font-medium text-muted-foreground">No file uploaded yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Upload a CSV or Excel file in the Pilot panel to begin
          </p>
        </div>
      )}

      {/* Step 2+3: Instructions */}
      {sessionId && (
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <StepHeading
            title="Code Genie - Instruction Panel"
            titleClassName="bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500 bg-clip-text text-transparent"
            subtitle="Describe what you want to do with your data, then let AI enhance your prompt"
          />
          <InstructionPanel />
        </section>
      )}

      {/* Step 4: Code Generation */}
      {codeStudioOpen && currentStep >= 3 && (
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <StepHeading
            title="Code Genie - Code Studio"
            titleClassName="bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500 bg-clip-text text-transparent"
            subtitle="AI-powered code generation based on your refined instructions"
          />
          <CodeGenPanel />
        </section>
      )}

      {/* Step 5: Execute */}
      {currentStep >= 4 && (
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <StepHeading
            title="Code Genie - Execution Console"
            titleClassName="bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500 bg-clip-text text-transparent"
            subtitle="Execute the code and view the output"
          />
          <ExecutionPanel />
        </section>
      )}

    </main>
  )
}

function PilotSidebar() {
  const [uploadOpen, setUploadOpen] = useState(true)
  const fileMetadata = useSessionStore((s) => s.fileMetadata)
  const codeGenieGradientText =
    'bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500 bg-clip-text text-transparent'

  return (
    <aside className="flex w-72 flex-shrink-0 flex-col border-r border-border bg-muted/30 overflow-y-auto">

      {/* ── Sidebar header ─────────────────────────────────────────────────── */}
      <div className="border-b border-border px-4 py-3">
        <p className={cn('text-sm font-extrabold tracking-tight leading-none', codeGenieGradientText)}>
          Dataset Details
        </p>
      </div>

      {/* ── Metadata section ───────────────────────────────────────────────── */}
      <div className="px-3 py-4">
        {/* Manual Upload slide toggle row */}
        <div className="flex w-full items-center justify-between rounded-md px-2 py-2">
          <span className={cn('text-sm font-semibold', codeGenieGradientText)}>Manual Upload</span>
          <button
            type="button"
            role="switch"
            aria-checked={uploadOpen}
            aria-label="Toggle Manual Upload"
            onClick={() => setUploadOpen((o) => !o)}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              uploadOpen ? 'bg-primary' : 'bg-input',
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200',
                uploadOpen ? 'translate-x-5' : 'translate-x-0',
              )}
            />
          </button>
        </div>

        {/* Fixed metadata fields panel */}
        <div className="mt-3 rounded-lg border border-border bg-card/80 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Metadata
            </p>
            {fileMetadata && (
              <p className="text-[11px] text-muted-foreground">
                {fileMetadata.columnCount} fields
              </p>
            )}
          </div>

          <div className="h-44 overflow-y-auto rounded-md border border-border/60 bg-background/70 px-2 py-1">
            {!fileMetadata ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">
                Upload a file to view header fields.
              </p>
            ) : (
              <ol className="space-y-1 py-1">
                {fileMetadata.columns.map((field, index) => (
                  <li key={`${field}-${index}`} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-muted-foreground">
                      {index + 1}.
                    </span>
                    <span className="break-all font-mono text-foreground">{field}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* Collapsible: radio buttons + drop zone */}
        {uploadOpen && (
          <div className="mt-3 px-1">
            <FileUploadZone />
          </div>
        )}
      </div>

    </aside>
  )
}

interface CodeSidebarProps {
  showCode: boolean
  setShowCode: (val: boolean) => void
}

function CodeSidebar({ showCode, setShowCode }: CodeSidebarProps) {
  const codeGenieGradientText =
    'bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500 bg-clip-text text-transparent'

  return (
    <aside className="flex w-80 flex-shrink-0 flex-col border-l border-border bg-muted/20 overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <p className={cn('text-sm font-extrabold tracking-tight leading-none', codeGenieGradientText)}>
          Code Genie - Engineering Workspace
        </p>
      </div>

      <div className="px-3 py-4">
        <div className="flex w-full items-center justify-between rounded-md px-2 py-2">
          <span className={cn('text-sm font-semibold', codeGenieGradientText)}>Code Studio</span>
          <button
            type="button"
            role="switch"
            aria-checked={showCode}
            aria-label="Toggle Code Studio"
            onClick={() => setShowCode(!showCode)}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              showCode ? 'bg-primary' : 'bg-input',
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200',
                showCode ? 'translate-x-5' : 'translate-x-0',
              )}
            />
          </button>
        </div>

      </div>
    </aside>
  )
}

export default function App() {
  const [showCode, setShowCode] = useState(false)

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen flex-col overflow-hidden bg-background">

        {/* ── Top bar: header + stepper ──────────────────────────────────────── */}
        <div className="flex-shrink-0 z-20">
          <AppHeader />
          <WorkflowStepper />
        </div>

        {/* ── Body: pilot sidebar + main content ────────────────────────────── */}
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
