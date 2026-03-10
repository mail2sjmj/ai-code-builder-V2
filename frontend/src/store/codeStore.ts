import { create } from 'zustand'

interface CodeState {
  generatedCode: string
  editedCode: string
  isGenerating: boolean
  /** Incremented on every setGeneratedCode call — used as Monaco editor key to force remount. */
  loadKey: number
  appendCodeChunk: (chunk: string) => void
  setGeneratedCode: (code: string) => void
  setEditedCode: (code: string) => void
  setIsGenerating: (val: boolean) => void
  resetCode: () => void
}

export const useCodeStore = create<CodeState>((set) => ({
  generatedCode: '',
  editedCode: '',
  isGenerating: false,
  loadKey: 0,
  appendCodeChunk: (chunk) =>
    set((state) => ({
      generatedCode: state.generatedCode + chunk,
      editedCode: state.editedCode + chunk,
    })),
  setGeneratedCode: (code) => set((state) => ({ generatedCode: code, editedCode: code, loadKey: state.loadKey + 1 })),
  setEditedCode: (code) => set({ editedCode: code }),
  setIsGenerating: (val) => set({ isGenerating: val }),
  resetCode: () => set({ generatedCode: '', editedCode: '' }),
}))
