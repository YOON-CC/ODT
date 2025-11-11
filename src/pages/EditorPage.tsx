import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [html, setHtml] = useState('')
  const sampleHtmlRef = useRef<string>('')

  useEffect(() => {
    const converted = odtJsonToHtml(SAMPLE_RESPONSE)
    console.log('converted', converted)

    sampleHtmlRef.current = converted
    setHtml(converted)
  }, [])

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

    const json = convertHtmlToOdtDoc(html, { editorRoot, contentWidthPx })
    await makeAndDownloadOdt(json, '알림장.odt')
  }, [html])

  return (
    <div className="app">
      <div className="panel">
        <div style={{ height: '100%', flex: 1 }}>
          <RichTextEditor value={html} onChange={setHtml} onDownload={handleDownload} />
        </div>
      </div>
    </div>
  )
}

