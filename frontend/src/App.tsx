import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Toaster } from 'sonner'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppHeader } from '@/components/layout/AppHeader'
import { CodeLibraryPanel } from '@/components/layout/CodeLibraryPanel'
import { InstructionsLibraryPanel } from '@/components/layout/InstructionsLibraryPanel'
import { FileSummaryModal } from '@/components/layout/FileSummaryModal'
import { WorkflowStepper } from '@/components/layout/WorkflowStepper'
import { FileUploadZone } from '@/components/upload/FileUploadZone'
import { InstructionPanel } from '@/components/instructions/InstructionPanel'
import { CodeGenPanel } from '@/components/codegen/CodeGenPanel'
import { ExecutionPanel } from '@/components/execution/ExecutionPanel'
import { useCodeStore } from '@/store/codeStore'
import { useExecutionStore } from '@/store/executionStore'
import { useInstructionStore } from '@/store/instructionStore'
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
  const sepIdx = title.indexOf(' - ')
  const prefix = sepIdx >= 0 ? title.slice(0, sepIdx) : null
  const rest = sepIdx >= 0 ? title.slice(sepIdx) : title

  return (
    <div className="mb-4 border-b border-border pb-3">
      <h2 className={cn('text-sm font-semibold leading-tight text-foreground', titleClassName)}>
        {prefix ? (
          <>
            <span className="text-[#C4922A]">{prefix}</span>
            {rest}
          </>
        ) : title}
      </h2>
      <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  )
}

interface MainContentProps {
  codeStudioOpen: boolean
}

function MainContent({ codeStudioOpen }: MainContentProps) {
  const { sessionId, currentStep } = useSessionStore()
  const executionStatus = useExecutionStore((s) => s.status)

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
            subtitle="Describe what you want to do with your data, then let AI enhance your prompt"
          />
          <InstructionPanel />
        </section>
      )}

      {/* Step 4: Code Generation */}
      {codeStudioOpen && currentStep >= 2 && (
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <StepHeading
            title="Code Genie - Source Console"
            subtitle="AI-powered code generation based on your refined instructions"
          />
          <CodeGenPanel />
        </section>
      )}

      {/* Step 5: Execute — only shown after execution completes */}
      {(executionStatus === 'success' || executionStatus === 'error') && (
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <StepHeading
            title="Code Genie - Output Console"
            subtitle="Execute the code and view the output"
          />
          <ExecutionPanel />
        </section>
      )}

    </main>
  )
}

function PilotSidebar() {
  const [uploadOpen, setUploadOpen] = useState(false)
  const [datasetDetailsOpen, setDatasetDetailsOpen] = useState(true)
  const [uploadZoneVersion, setUploadZoneVersion] = useState(0)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const sessionId = useSessionStore((s) => s.sessionId)
  const fileMetadata = useSessionStore((s) => s.fileMetadata)
  const rawInstructions = useInstructionStore((s) => s.rawInstructions)
  const resetSession = useSessionStore((s) => s.reset)
  const setRawInstructions = useInstructionStore((s) => s.setRawInstructions)
  const resetRefined = useInstructionStore((s) => s.resetRefined)
  const setIsRefining = useInstructionStore((s) => s.setIsRefining)
  const resetCode = useCodeStore((s) => s.resetCode)
  const setIsGenerating = useCodeStore((s) => s.setIsGenerating)
  const resetExecution = useExecutionStore((s) => s.reset)

  useEffect(() => {
    if (sessionId) setUploadOpen(false)
  }, [sessionId])

  const handleReUpload = () => {
    resetSession()
    setRawInstructions('')
    resetRefined()
    setIsRefining(false)
    resetCode()
    setIsGenerating(false)
    resetExecution()
    setUploadOpen(true)
    setUploadZoneVersion((v) => v + 1)
  }

  return (
    <>
    <aside className="flex w-72 flex-shrink-0 flex-col border-r border-border bg-slate-50 overflow-y-auto">

      {/* ── Sidebar header ─────────────────────────────────────────────────── */}
      <div className="border-b border-[#1e3a5f] bg-[#1e3a5f] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-200">
          Data Workspace
        </p>
      </div>

      <div className="px-3 py-4 space-y-3">

        {/* ── Dataset Details collapsible ─────────────────────────────────── */}
        <button
          type="button"
          onClick={() => setDatasetDetailsOpen((o) => !o)}
          className="flex w-full items-center justify-between border-l-2 border-l-primary rounded-r border border-l-0 border-border bg-slate-100 px-3 py-2 text-left text-slate-700 transition-colors hover:bg-slate-200"
          aria-expanded={datasetDetailsOpen}
          aria-label="Toggle Dataset Details"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Dataset Details</span>
          {datasetDetailsOpen ? (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-500" />
          )}
        </button>

        {datasetDetailsOpen && (
          <div className="space-y-3 px-1">

            {/* Dataset Name */}
            <div>
              <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Dataset Name
              </p>
              <div className="rounded border border-border bg-white px-3 py-2">
                {fileMetadata ? (
                  <p className="truncate text-sm font-medium text-foreground" title={fileMetadata.filename}>
                    {fileMetadata.filename}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">No file uploaded yet</p>
                )}
              </div>
            </div>

            {/* Metadata */}
            <div>
              <div className="mb-1 px-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Metadata {fileMetadata && <span className="font-normal normal-case">({fileMetadata.columnCount} fields)</span>}
                </p>
                {fileMetadata && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSummaryOpen(true)}
                      className="flex-1 rounded border border-border bg-background py-1 text-[11px] font-medium text-foreground hover:bg-muted text-center"
                    >
                      File Summary
                    </button>
                    <button
                      type="button"
                      onClick={handleReUpload}
                      className="flex-1 rounded border border-border bg-background py-1 text-[11px] font-medium text-foreground hover:bg-muted text-center"
                    >
                      Re-upload
                    </button>
                  </div>
                )}
              </div>
              <div className="h-48 overflow-y-auto rounded border border-border bg-white">
                {!fileMetadata ? (
                  <p className="py-2 px-3 text-xs text-muted-foreground">
                    Upload a file to view header fields.
                  </p>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-100">
                      <tr>
                        <th className="w-7 px-2 py-1.5 text-right font-semibold text-muted-foreground">#</th>
                        <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">Field</th>
                        <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fileMetadata.columns.map((field, index) => (
                        <tr key={`${field}-${index}`} className="border-t border-border/50 hover:bg-slate-50">
                          <td className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">{index + 1}</td>
                          <td className="px-2 py-1.5 font-medium text-foreground break-all leading-snug">{field}</td>
                          <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{fileMetadata.dtypes[field] ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ── Data Ingestion (Manual) collapsible ─────────────────────────── */}
        <button
          type="button"
          onClick={() => setUploadOpen((o) => !o)}
          className="flex w-full items-center justify-between border-l-2 border-l-primary rounded-r border border-l-0 border-border bg-slate-100 px-3 py-2 text-left text-slate-700 transition-colors hover:bg-slate-200"
          aria-expanded={uploadOpen}
          aria-label="Toggle Data Ingestion (Manual)"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Data Ingestion (Manual)</span>
          {uploadOpen ? (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-500" />
          )}
        </button>

        {/* Collapsible: radio buttons + drop zone */}
        {uploadOpen && (!sessionId || !rawInstructions.trim()) && (
          <div className="px-1">
            <p className="mb-2 px-1 text-[11px] text-muted-foreground">
              Choose upload mode, then provide files to start ingestion.
            </p>
            <FileUploadZone key={uploadZoneVersion} />
          </div>
        )}

      </div>

    </aside>

    {summaryOpen && sessionId != null && fileMetadata != null && (
      <FileSummaryModal
        sessionId={sessionId}
        filename={fileMetadata.filename}
        onClose={() => setSummaryOpen(false)}
      />
    )}
  </>
  )
}

interface CodeSidebarProps {
  showCode: boolean
  setShowCode: (val: boolean) => void
}

function CodeSidebar({ showCode, setShowCode }: CodeSidebarProps) {
  return (
    <aside className="flex w-80 flex-shrink-0 flex-col border-l border-border bg-slate-50 overflow-y-auto">
      <div className="border-b border-[#1e3a5f] bg-[#1e3a5f] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-200">
          Engineering Workspace
        </p>
      </div>

      <div className="px-3 py-4">
        <div className="flex w-full items-center justify-between border-l-2 border-l-primary rounded-r border border-l-0 border-border bg-slate-100 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Source Console</span>
          <button
            type="button"
            role="switch"
            aria-checked={showCode}
            aria-label="Toggle Source Console"
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

        <InstructionsLibraryPanel />
        <CodeLibraryPanel />
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
