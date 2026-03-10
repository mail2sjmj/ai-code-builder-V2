import { useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as MonacoType from 'monaco-editor'
import { useCodeStore } from '@/store/codeStore'
import { LoadingOverlay } from '@/components/shared/LoadingOverlay'
import appConfig from '@/config/app.config'

export function MonacoCodeEditor() {
  const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null)
  const { editedCode, isGenerating, loadKey, setEditedCode } = useCodeStore()

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
  }

  return (
    <div className="relative" style={{ height: '400px' }}>
      <Editor
        key={loadKey}
        value={editedCode}
        language={appConfig.editor.language}
        theme={appConfig.editor.theme}
        options={{
          fontSize: appConfig.editor.fontSize,
          minimap: appConfig.editor.minimap,
          readOnly: isGenerating,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
        }}
        onChange={(value) => setEditedCode(value ?? '')}
        onMount={handleMount}
        loading={<LoadingOverlay message="Loading editor…" />}
      />
      {isGenerating && (
        <div className="absolute bottom-3 right-3 rounded bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow">
          Generating…
        </div>
      )}
    </div>
  )
}
