import { useState } from 'react'
import appConfig from '@/config/app.config'
import { useCodeStore } from '@/store/codeStore'
import { useExecutionStore } from '@/store/executionStore'
import { parseSSEStream } from '@/utils/streamParser'
import { toastDismissAll, toastError, toastSuccess } from '@/utils/toast'

export function useAutoFix() {
  const [isFixing, setIsFixing] = useState(false)
  const { setEditedCode } = useCodeStore()
  const { clearError } = useExecutionStore()

  const autoFix = async (
    sessionId: string,
    brokenCode: string,
    errorMessage: string,
  ): Promise<void> => {
    if (!sessionId || !brokenCode.trim() || !errorMessage.trim()) return
    setIsFixing(true)

    // Truncate to stay within backend schema limits
    const truncatedError = errorMessage.slice(0, 4800)

    let accumulated = ''

    try {
      const response = await fetch(
        `${appConfig.api.baseUrl}${appConfig.api.prefix}/codegen/fix`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            broken_code: brokenCode,
            error_message: truncatedError,
          }),
        },
      )

      if (!response.ok) {
        const body = await response.text()
        let message = `HTTP ${response.status}`
        try { message = (JSON.parse(body) as { message?: string }).message ?? message } catch { /* ignore */ }
        throw new Error(message)
      }

      await parseSSEStream(
        response,
        (chunk) => {
          accumulated += chunk
          setEditedCode(accumulated)
        },
        () => {
          toastDismissAll()
          clearError()
          toastSuccess('Code fixed — review the changes and run again.')
          setIsFixing(false)
        },
        (error) => {
          toastError(error)
          setIsFixing(false)
        },
      )
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Auto-fix failed.')
      setIsFixing(false)
    }
  }

  return { autoFix, isFixing }
}
