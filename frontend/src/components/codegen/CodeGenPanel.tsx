import { Loader2, Play, RefreshCw, Trash2 } from 'lucide-react'
import { useCodeGeneration } from '@/hooks/useCodeGeneration'
import { useCodeStore } from '@/store/codeStore'
import { useInstructionStore } from '@/store/instructionStore'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { MonacoCodeEditor } from './MonacoCodeEditor'

export function CodeGenPanel() {
  const refinedPrompt = useInstructionStore((s) => s.refinedPrompt)
  const { generatedCode, isGenerating, resetCode } = useCodeStore()
  const { generateCode, isGenerating: hookGenerating } = useCodeGeneration()

  if (!refinedPrompt) return null

  const status = isGenerating ? 'generating' : generatedCode ? 'success' : 'idle'

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Code Genie - Source Console</span>
          <StatusBadge status={status} />
        </div>
        <div className="flex items-center gap-2">
          {!generatedCode && !isGenerating && (
            <button
              onClick={() => void generateCode()}
              disabled={hookGenerating}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {hookGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Generate Code
            </button>
          )}
          {generatedCode && (
            <>
              <button
                onClick={() => void generateCode()}
                disabled={isGenerating}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                Regenerate
              </button>
              <button
                onClick={resetCode}
                disabled={isGenerating}
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
    </div>
  )
}
