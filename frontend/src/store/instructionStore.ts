import { create } from 'zustand'

interface InstructionState {
  rawInstructions: string
  refinedPrompt: string
  isRefining: boolean
  activeSavedLabel: string | null
  isFromCache: boolean
  instructionsOutOfSync: boolean
  setRawInstructions: (text: string) => void
  appendRefinedChunk: (chunk: string) => void
  setRefinedPrompt: (text: string) => void
  setIsRefining: (val: boolean) => void
  resetRefined: () => void
  setActiveSavedLabel: (label: string | null) => void
  setIsFromCache: (val: boolean) => void
  setInstructionsOutOfSync: (val: boolean) => void
  /** Load raw instructions + refined prompt from a cached entry without resetting isFromCache */
  loadCachedState: (rawInstructions: string, refinedPrompt: string, activeLabel: string | null) => void
}

export const useInstructionStore = create<InstructionState>((set) => ({
  rawInstructions: '',
  refinedPrompt: '',
  isRefining: false,
  activeSavedLabel: null,
  isFromCache: false,
  instructionsOutOfSync: false,
  // Any user edit clears the cache + out-of-sync flags so refine+generate run fresh
  setRawInstructions: (text) => set({ rawInstructions: text, isFromCache: false, instructionsOutOfSync: false }),
  appendRefinedChunk: (chunk) =>
    set((state) => ({ refinedPrompt: state.refinedPrompt + chunk })),
  setRefinedPrompt: (text) => set({ refinedPrompt: text }),
  setIsRefining: (val) => set({ isRefining: val }),
  resetRefined: () => set({ refinedPrompt: '' }),
  setActiveSavedLabel: (label) => set({ activeSavedLabel: label }),
  setIsFromCache: (val) => set({ isFromCache: val }),
  setInstructionsOutOfSync: (val) => set({ instructionsOutOfSync: val }),
  loadCachedState: (rawInstructions, refinedPrompt, activeLabel) =>
    set({ rawInstructions, refinedPrompt, isFromCache: true, activeSavedLabel: activeLabel, instructionsOutOfSync: false }),
}))
