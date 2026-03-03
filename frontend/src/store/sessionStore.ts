import { create } from 'zustand'
import type { FileMetadata } from '@/types/api.types'

interface SessionState {
  sessionId: string | null
  fileMetadata: FileMetadata | null
  currentStep: 1 | 2 | 3 | 4 | 5
  setSession: (id: string, metadata: FileMetadata) => void
  setFileMetadata: (metadata: FileMetadata | null) => void
  advanceStep: () => void
  reset: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  fileMetadata: null,
  currentStep: 1,
  setSession: (id, metadata) =>
    set({ sessionId: id, fileMetadata: metadata, currentStep: 2 }),
  setFileMetadata: (metadata) => set({ fileMetadata: metadata }),
  advanceStep: () =>
    set((state) => ({
      currentStep: Math.min(state.currentStep + 1, 5) as SessionState['currentStep'],
    })),
  reset: () => set({ sessionId: null, fileMetadata: null, currentStep: 1 }),
}))
