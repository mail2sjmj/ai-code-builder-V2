import { useState } from 'react'
import appConfig from '@/config/app.config'
import { useCodeStore } from '@/store/codeStore'
import { useInstructionStore } from '@/store/instructionStore'
import { useSessionStore } from '@/store/sessionStore'
import { parseSSEStream } from '@/utils/streamParser'
import { toastError, toastInfo } from '@/utils/toast'

export function useCodeGeneration() {
  const [isGenerating, setIsGenerating] = useState(false)
  const { advanceStep } = useSessionStore()
  const { appendCodeChunk, resetCode, setIsGenerating: storeSetGenerating } = useCodeStore()

  const generateCode = async () => {
    const sessionId = useSessionStore.getState().sessionId
    const refinedPrompt = useInstructionStore.getState().refinedPrompt
    if (!sessionId || !refinedPrompt.trim()) return
    setIsGenerating(true)
    storeSetGenerating(true)
    resetCode()
    toastInfo('Generating Python code…')

    try {
      const response = await fetch(
        `${appConfig.api.baseUrl}${appConfig.api.prefix}/codegen/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            refined_prompt: refinedPrompt,
          }),
        },
      )

      if (!response.ok) {
        const err = (await response.json()) as { message?: string }
        throw new Error(err.message ?? `HTTP ${response.status}`)
      }

      await parseSSEStream(
        response,
        appendCodeChunk,
        () => {
          advanceStep()
          setIsGenerating(false)
          storeSetGenerating(false)
        },
        (error) => {
          toastError(error)
          setIsGenerating(false)
          storeSetGenerating(false)
        },
      )
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to generate code.')
      setIsGenerating(false)
      storeSetGenerating(false)
    }
  }

  return { generateCode, isGenerating }
}
