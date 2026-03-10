import { create } from 'zustand'
import type { FileMetadata } from '@/types/api.types'

interface SessionState {
  sessionId: string | null
  fileMetadata: FileMetadata | null
  currentStep: 0 | 1 | 2 | 3 | 4
  setSession: (id: string, metadata: FileMetadata) => void
  setFileMetadata: (metadata: FileMetadata | null) => void
  advanceStep: () => void
  setCurrentStep: (step: 0 | 1 | 2 | 3 | 4) => void
  reset: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  fileMetadata: null,
  currentStep: 0,
  setSession: (id, metadata) =>
    set({ sessionId: id, fileMetadata: metadata, currentStep: 1 }),
  setFileMetadata: (metadata) => set({ fileMetadata: metadata }),
  advanceStep: () =>
    set((state) => ({
      currentStep: Math.min(state.currentStep + 1, 4) as SessionState['currentStep'],
    })),
  setCurrentStep: (step) => set({ currentStep: step }),
  reset: () => set({ sessionId: null, fileMetadata: null, currentStep: 0 }),
}))
