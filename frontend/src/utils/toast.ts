import { toast } from 'sonner'

export const toastSuccess = (message: string): void => {
  toast.success(message, { duration: 3000 })
}

export const toastError = (message: string): void => {
  toast.error(message, { duration: Infinity, closeButton: true })
}

export const toastInfo = (message: string): void => {
  toast.info(message, { duration: 5000 })
}

/** Dismiss all active toasts — call this on successful outcomes to clear lingering errors. */
export const toastDismissAll = (): void => {
  toast.dismiss()
}
