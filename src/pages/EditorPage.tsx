import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import RichTextEditor from '../components/RichTextEditor'
import GlobalToolbar from '../components/GlobalToolbar'
import sampleResponse from '../response.json'
import { odtJsonToHtml } from '../lib/odtJsonToHtml'
import { makeAndDownloadOdt } from '../lib/odt/zipOdt'
import {
  convertHtmlToOdtDoc,
  DEFAULT_CONTENT_WIDTH_PX
} from '../lib/htmlToOdt/convertHtmlToOdtDoc'
import { PAGE_BREAK_HTML } from '../lib/pageBreak'

function splitHtmlIntoPages(html: string): string[] {
  if (!html) return ['']
  const parts = html.split(PAGE_BREAK_HTML)
  if (!parts.length) return ['']
  return parts.map(part => part)
}

const SAMPLE_RESPONSE = sampleResponse as any

export default function EditorPage() {
  const [pages, setPages] = useState<string[]>([''])
  const [visiblePageCount, setVisiblePageCount] = useState<number>(1)
  const sampleHtmlRef = useRef<string>('')
  const editorRefs = useRef<Array<Editor | null>>([])
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null)

  useEffect(() => {
    const converted = odtJsonToHtml(SAMPLE_RESPONSE)
    console.log('converted', converted)

    sampleHtmlRef.current = converted
    const initialPages = splitHtmlIntoPages(converted)
    setPages(initialPages)
    setVisiblePageCount(initialPages.length || 1)
  }, [])

  useEffect(() => {
    editorRefs.current = Array.from({ length: pages.length }, (_, idx) => editorRefs.current[idx] ?? null)
    setVisiblePageCount(prev => {
      const max = pages.length || 1
      if (prev >= max && prev <= max) return prev === 0 ? 1 : prev
      if (prev < 1) return 1
      if (prev < max) return max
      if (prev > max) return max
      return prev
    })
  }, [pages.length])

  const handleDownload = useCallback(async () => {
    const editorRoot = document.querySelector('.gdoc__content .ProseMirror') as HTMLElement | null
    let contentWidthPx = DEFAULT_CONTENT_WIDTH_PX

    if (editorRoot) {
      const styles = window.getComputedStyle(editorRoot)
      const paddingLeft = parseFloat(styles.paddingLeft) || 0
      const paddingRight = parseFloat(styles.paddingRight) || 0
      const measured = editorRoot.clientWidth - paddingLeft - paddingRight
      if (Number.isFinite(measured) && measured > 0) {
        contentWidthPx = measured
      }
    }

    const combinedHtml = pages.join(PAGE_BREAK_HTML)
    const json = convertHtmlToOdtDoc(combinedHtml, { editorRoot, contentWidthPx })
    await makeAndDownloadOdt(json, '알림장.odt')
  }, [pages])

  const handlePageChange = useCallback((index: number, next: string) => {
    setPages(prev => prev.map((value, idx) => (idx === index ? next : value)))
  }, [])

  const handleOverflow = useCallback((index: number) => {
    // alert(`페이지 ${index + 1}의 높이가 제한을 초과했습니다. 페이지 나눔을 추가해 주세요.`)
    setVisiblePageCount(prev => Math.max(prev, index + 2))
  }, [])

  return (
    <div className="app">
      <div
        style={{
          backgroundColor: '#F5F7F9',
          width: '1090px',
          height: '100vh',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center', 
        }}
      >
        <GlobalToolbar editor={activeEditor} onDownload={handleDownload} />
        <div className="panel"   style={{
            paddingTop: '60px',
            paddingBottom: '60px',
            flex: 1,    
            overflowY: 'auto',    
            height: '100vh',
          }}>
          {pages.map((value, index) => (
            <div
              key={index}
              style={{
                height: '100%',
                flex: 1,
                marginBottom: index < pages.length - 1 ? '40px' : 0,
                display: index < visiblePageCount ? 'block' : 'none'
              }}
            >
              <RichTextEditor
                value={value}
                onChange={next => handlePageChange(index, next)}
                maxHeightWarning={1096.06}
                onOverflow={() => handleOverflow(index)}
                onEditorReady={editor => {
                  editorRefs.current[index] = editor
                  setActiveEditor(prev => prev ?? editor)
                }}
                onHoverChange={editor => {
                  if (editor) {
                    setActiveEditor(editor)
                  } else {
                    setActiveEditor(prev => (prev === editorRefs.current[index] ? null : prev))
                  }
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

