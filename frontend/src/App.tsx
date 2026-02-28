import { Toaster } from 'sonner'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppHeader } from '@/components/layout/AppHeader'
import { WorkflowStepper } from '@/components/layout/WorkflowStepper'
import { FileUploadZone } from '@/components/upload/FileUploadZone'
import { InstructionPanel } from '@/components/instructions/InstructionPanel'
import { CodeGenPanel } from '@/components/codegen/CodeGenPanel'
import { ExecutionPanel } from '@/components/execution/ExecutionPanel'
import { useSessionStore } from '@/store/sessionStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
})

interface StepHeadingProps {
  title: string
  subtitle: string
}

function StepHeading({ title, subtitle }: StepHeadingProps) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-bold text-foreground leading-tight">{title}</h2>
      <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  )
}

function MainContent() {
  const { sessionId, currentStep } = useSessionStore()

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 space-y-8">
      {/* Step 1: Upload */}
      <section>
        <StepHeading
          title="Upload Data"
          subtitle="Import a CSV or Excel file to get started"
        />
        <FileUploadZone />
      </section>

      {/* Step 2+3: Instructions */}
      {sessionId && (
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <StepHeading
            title="Write & Refine Instructions"
            subtitle="Describe what you want to do with your data, then let AI enhance your prompt"
          />
          <InstructionPanel />
        </section>
      )}

      {/* Step 4: Code Generation */}
      {currentStep >= 3 && (
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <StepHeading
            title="Generate Python Code"
            subtitle="AI-powered code generation based on your refined instructions"
          />
          <CodeGenPanel />
        </section>
      )}

      {/* Step 5: Execute */}
      {currentStep >= 4 && (
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <StepHeading
            title="Execute & Download"
            subtitle="Run the generated code and download the output as CSV"
          />
          <ExecutionPanel />
        </section>
      )}
    </main>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background">
        <AppHeader />
        <WorkflowStepper />
        <MainContent />
      </div>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  )
}
