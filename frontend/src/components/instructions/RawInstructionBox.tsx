import { useRef } from 'react'
import { SkipForward, Upload } from 'lucide-react'
import { useInstructionStore } from '@/store/instructionStore'
import { toastError, toastInfo, toastSuccess } from '@/utils/toast'

const MAX_LENGTH = 5000
const PLACEHOLDER = `Describe what you want to do with your data, step by step.

Example:
1. Filter rows where Status is "Active"
2. Group by Region
3. Calculate average Revenue per group
4. Sort descending by average Revenue
5. Keep only Region and AverageRevenue columns`
export const SKIP_INSTRUCTION = 'No custom instructions provided. Generate a sensible baseline transformation from dataset structure and metadata.'

export function RawInstructionBox() {
  const { rawInstructions, setRawInstructions } = useInstructionStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const remaining = MAX_LENGTH - rawInstructions.length

  const handleUploadInstructions = async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop()
    if (!ext || !['txt', 'docx'].includes(ext)) {
      toastError('Unsupported file type. Upload a .txt or .docx file.')
      return
    }

    if (ext === 'txt') {
      try {
        const text = await file.text()
        setRawInstructions(text.slice(0, MAX_LENGTH))
        toastSuccess(`Loaded instructions from ${file.name}`)
      } catch {
        toastError('Failed to read instruction file.')
      }
      return
    }

    // .docx is accepted in picker, but extraction is not available in this build.
    toastInfo('DOCX selected. Please export as .txt or paste the instructions manually.')
  }

  return (
    <div className="flex flex-1 flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-foreground">Your Instructions</label>
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.docx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleUploadInstructions(file)
              e.currentTarget.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Upload instructions (.txt or .docx)"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload
          </button>
          <button
            type="button"
            onClick={() => setRawInstructions(SKIP_INSTRUCTION)}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Skip custom instructions"
          >
            <SkipForward className="h-3.5 w-3.5" />
            Skip
          </button>
        </div>
      </div>
      <textarea
        value={rawInstructions}
        onChange={(e) => setRawInstructions(e.target.value.slice(0, MAX_LENGTH))}
        placeholder={PLACEHOLDER}
        className="flex-1 resize-y rounded-lg border bg-background p-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[220px]"
        spellCheck={false}
      />
      <p className={`text-right text-xs ${remaining < 100 ? 'text-destructive' : 'text-muted-foreground'}`}>
        {rawInstructions.length}/{MAX_LENGTH}
      </p>
    </div>
  )
}
