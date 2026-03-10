import { useState } from 'react'
import appConfig from '@/config/app.config'
import { apiGet, apiPost } from '@/services/apiClient'
import { useCodeStore } from '@/store/codeStore'
import { useExecutionStore } from '@/store/executionStore'
import { useSessionStore } from '@/store/sessionStore'
import { useInstructionStore } from '@/store/instructionStore'
import { toastDismissAll, toastError, toastSuccess } from '@/utils/toast'
import type { ExecutionJobResponse, ExecutionResult } from '@/types/api.types'

export function useCodeExecution() {
  const [isExecuting, setIsExecuting] = useState(false)
  const { sessionId, setCurrentStep } = useSessionStore()
  const { setJobId, setStatus, setResults, setError, setSessionId } = useExecutionStore()

  const executeCode = async () => {
    // Read fresh from store — not from closure, since code may have just been generated
    const editedCode = useCodeStore.getState().editedCode
    if (!sessionId || !editedCode.trim()) return
    setIsExecuting(true)
    setCurrentStep(4)
    setStatus('queued')
    setSessionId(sessionId)

    try {
      const jobResponse = await apiPost<ExecutionJobResponse>('/execute', {
        session_id: sessionId,
        code: editedCode,
      })
      setJobId(jobResponse.job_id)
      setStatus('running')

      // Poll for result
      const { pollIntervalMs, maxPollAttempts } = appConfig.execution
      let attempts = 0

      const poll = async (): Promise<void> => {
        attempts++
        if (attempts > maxPollAttempts) {
          setError('Execution timed out waiting for result.')
          setIsExecuting(false)
          return
        }

        const result = await apiGet<ExecutionResult>(
          `/execute/${sessionId}/${jobResponse.job_id}`,
        )

        if (result.status === 'success') {
          toastDismissAll()
          setResults(result.preview_rows, result.preview_columns, result.execution_time_ms)
          toastSuccess('Code executed successfully.')
          setIsExecuting(false)
          // Auto-save code cache only when the code is in sync with instructions.
          // If the user manually edited the code in the editor (editedCode !== generatedCode),
          // skip auto-save — mismatched code+instructions would corrupt the cache entry.
          // The user can explicitly save from the ExecutionPanel to persist a manual edit.
          const label = useInstructionStore.getState().activeSavedLabel
          const { editedCode: finalCode, generatedCode } = useCodeStore.getState()
          const codeIsUnmodified = finalCode.trim() === generatedCode.trim()
          if (label && codeIsUnmodified) {
            void apiPost('/code-cache/save', {
              label,
              code: finalCode,
              raw_instructions: useInstructionStore.getState().rawInstructions,
              refined_prompt: useInstructionStore.getState().refinedPrompt,
            })
          }
        } else if (result.status === 'error') {
          toastDismissAll()
          setError(result.error_message ?? 'Execution failed.')
          toastError(result.error_message ?? 'Execution failed.')
          setIsExecuting(false)
        } else {
          // Still running or queued — keep polling
          setTimeout(() => void poll(), pollIntervalMs)
        }
      }

      setTimeout(() => void poll(), pollIntervalMs)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to execute code.'
      setError(message)
      toastError(message)
      setIsExecuting(false)
    }
  }

  return { executeCode, isExecuting }
}
