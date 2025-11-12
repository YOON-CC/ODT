import { useEffect, useRef } from 'react'
import { Editor, Extension } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Strike from '@tiptap/extension-strike'
import TextAlign from '@tiptap/extension-text-align'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'

import './RichTextEditor.css'

type Props = {
  value: string
  onChange: (html: string) => void
  maxHeightWarning?: number
  onOverflow?: (editor: Editor) => void
  onEditorReady?: (editor: Editor) => void
  onHoverChange?: (editor: Editor | null) => void
}

const TableCellWithBackground = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: el => el.getAttribute('data-background-color') ?? (el as HTMLElement).style.backgroundColor ?? null,
        renderHTML: attrs => {
          const color = (attrs as any).backgroundColor as string | null
          if (!color) return {}
          return { style: `background-color: ${color}`, 'data-background-color': color }
        }
      }
    }
  }
})
const TableHeaderWithBackground = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: el => el.getAttribute('data-background-color') ?? (el as HTMLElement).style.backgroundColor ?? null,
        renderHTML: attrs => {
          const color = (attrs as any).backgroundColor as string | null
          if (!color) return {}
          return { style: `background-color: ${color}`, 'data-background-color': color }
        }
      }
    }
  }
})

/** ===== 폰트 사이즈 확장 (그대로) ===== */
const FontSizeExtension = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: el => (el as HTMLElement).style.fontSize || null,
          renderHTML: attrs => {
            const size = (attrs as any).fontSize as string | null
            if (!size) return {}
            return { style: `font-size: ${size}` }
          }
        }
      }
    }]
  },
  addCommands() {
    return {
      setFontSize: size => ({ chain }) => chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
    }
  }
})
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType
      unsetFontSize: () => ReturnType
    }
  }
}

export default function RichTextEditor({
  value,
  onChange,
  maxHeightWarning,
  onOverflow,
  onEditorReady,
  onHoverChange
}: Props) {
  const contentRef = useRef<HTMLDivElement | null>(null)
  const overflowTriggeredRef = useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Strike,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color.configure({ types: ['textStyle'] }),
      FontFamily,
      FontSizeExtension,
      Table.configure({ resizable: true, HTMLAttributes: { class: 'tiptap-table' } }),
      TableRow,
      TableHeaderWithBackground,
      TableCellWithBackground
    ],
    content: value,
    autofocus: false,
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
    onFocus: ({ editor: instance }) => {
      onHoverChange?.(instance)
    },
    onBlur: ({ event }) => {
      const related = event?.relatedTarget as HTMLElement | null
      if (related?.closest('.global-toolbar')) return
      onHoverChange?.(null)
    }
  })

  useEffect(() => {
    if (!editor) return
    onEditorReady?.(editor)
  }, [editor, onEditorReady])

  useEffect(() => {
    if (!maxHeightWarning || !onOverflow) return
    if (!editor) return
    const editorInstance = editor
    const element = contentRef.current
    if (!element) return

    const checkHeight = () => {
      const height = element.clientHeight
      if (!editorInstance.isFocused) return
      if (height > maxHeightWarning) {
        if (!overflowTriggeredRef.current) {
          overflowTriggeredRef.current = true
          onOverflow(editorInstance)
        }
      } else if (overflowTriggeredRef.current && height <= maxHeightWarning * 0.9) {
        overflowTriggeredRef.current = false
      }
    }

    checkHeight()

    const resizeObserver = new ResizeObserver(checkHeight)
    resizeObserver.observe(element)

    return () => {
      resizeObserver.disconnect()
    }
  }, [editor, maxHeightWarning, onOverflow])

  // 외부 value ↔ editor 동기화
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (current === value) return
    const { from, to } = editor.state.selection
    editor.commands.setContent(value, false)
    editor.commands.setTextSelection({ from, to })
  }, [editor, value])

  if (!editor) return null

  return (
    <div className="gdoc">
      <EditorContent
        editor={editor}
        className="gdoc__content"
        ref={contentRef}
        onFocus={() => editor && onHoverChange?.(editor)}
        onPointerDown={() => editor && onHoverChange?.(editor)}
      />
    </div>
  )
}
