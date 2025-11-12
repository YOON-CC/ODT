import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import RichTextEditor from '../components/RichTextEditor'
import sampleResponse from '../response.json'
import { odtJsonToHtml } from '../lib/odtJsonToHtml'
import { makeAndDownloadOdt } from '../lib/odt/zipOdt'
import {
  convertHtmlToOdtDoc,
  DEFAULT_CONTENT_WIDTH_PX
} from '../lib/htmlToOdt/convertHtmlToOdtDoc'

const SAMPLE_RESPONSE = sampleResponse as any

export default function EditorPage() {
  const [pages, setPages] = useState<string[]>(['', ''])
  const [visiblePageCount, setVisiblePageCount] = useState<number>(1)
  const sampleHtmlRef = useRef<string>('')
  const editorRefs = useRef<Array<Editor | null>>([])

  useEffect(() => {
    const converted = odtJsonToHtml(SAMPLE_RESPONSE)
    console.log('converted', converted)

    sampleHtmlRef.current = converted
    setPages([converted, ''])
    setVisiblePageCount(1)
  }, [])

  useEffect(() => {
    editorRefs.current.length = pages.length
  }, [pages.length])

  const handleDownload = useCallback(async () => {
    const editorRoot = document.querySelector('.rte__content .ProseMirror') as HTMLElement | null
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

    const combinedHtml = pages.join('<div data-page-break="true"></div>')
    const json = convertHtmlToOdtDoc(combinedHtml, { editorRoot, contentWidthPx })
    await makeAndDownloadOdt(json, '알림장.odt')
  }, [pages])

  const handlePageChange = useCallback((index: number, next: string) => {
    setPages(prev => prev.map((value, idx) => (idx === index ? next : value)))
  }, [])

  const handleOverflow = useCallback(
    (index: number) => {
      const nextIndex = index + 1

      const ensureNextPage = () => {
        setPages(prevPages => {
          if (nextIndex < prevPages.length) {
            return prevPages
          }
          return [...prevPages, '']
        })
      }

      ensureNextPage()

      setVisiblePageCount(prev => Math.max(prev, nextIndex + 1))
      alert(`페이지 ${index + 1}의 높이가 제한을 초과했습니다. 다음 페이지로 이동합니다.`)

      setTimeout(() => {
        if (nextIndex >= editorRefs.current.length) return
        const nextEditor = editorRefs.current[nextIndex]
        if (nextEditor) {
          nextEditor.chain().focus().run()
        }
      }, 0)
    },
    []
  )

  return (
    <div className="app">
      <div className="panel">
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
            <div style={{ marginBottom: '12px', fontWeight: 600 }}>페이지 {index + 1}</div>
            <RichTextEditor
              value={value}
              onChange={next => handlePageChange(index, next)}
              onDownload={handleDownload}
              showToolbar
              maxHeightWarning={1096.06}
              onOverflow={() => handleOverflow(index)}
              onEditorReady={editor => {
                editorRefs.current[index] = editor
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

