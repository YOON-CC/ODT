import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Editor, Extension } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
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
}

const FONT_FAMILIES = {
  notoSans: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Segoe UI', 'Helvetica Neue', sans-serif",
  nanumGothic: "'Nanum Gothic', 'Apple SD Gothic Neo', 'Segoe UI', sans-serif",
  nanumMyeongjo: "'Nanum Myeongjo', 'Iropke Batang', serif",
  gowunDodum: "'Gowun Dodum', 'Apple SD Gothic Neo', sans-serif",
  gungsuh: "'Gungsuh', '궁서', 'GungSeo', 'GungsuhChe', serif"
} as const

type FontFamilyKey = keyof typeof FONT_FAMILIES
type FontKey = FontFamilyKey | 'system'

const FONT_OPTIONS: Array<{ key: FontKey; label: string }> = [
  { key: 'notoSans', label: '노토 산스 (Noto Sans KR)' },
  { key: 'nanumGothic', label: '나눔고딕 (Nanum Gothic)' },
  { key: 'nanumMyeongjo', label: '나눔명조 (Nanum Myeongjo)' },
  { key: 'gowunDodum', label: '고운돋움 (Gowun Dodum)' },
  { key: 'gungsuh', label: '궁서체 (Gungsuh)' },
  { key: 'system', label: '시스템 기본' }
] as const

const DEFAULT_COLOR = '#1f2328' as const
const DEFAULT_CELL_BACKGROUND = '#ffffff' as const
const FONT_SIZE_DEFAULT = 'default' as const
const DEFAULT_FONT_SIZE_LABEL = '기본 (14px)' as const

const FONT_SIZE_OPTIONS = [
  { value: FONT_SIZE_DEFAULT, label: DEFAULT_FONT_SIZE_LABEL },
  { value: '10px', label: '10px' },
  { value: '12px', label: '12px' },
  { value: '14px', label: '14px' },
  { value: '16px', label: '16px' },
  { value: '18px', label: '18px' },
  { value: '20px', label: '20px' },
  { value: '24px', label: '24px' },
  { value: '28px', label: '28px' },
  { value: '32px', label: '32px' },
  { value: '36px', label: '36px' },
  { value: '48px', label: '48px' }
] as const

type FontSizeValue = (typeof FONT_SIZE_OPTIONS)[number]['value']
type FontSizePreset = Exclude<FontSizeValue, typeof FONT_SIZE_DEFAULT>

const FONT_SIZE_PRESET_SET = new Set<FontSizePreset>(
  FONT_SIZE_OPTIONS.filter(option => option.value !== FONT_SIZE_DEFAULT).map(option => option.value as FontSizePreset)
)

const TableCellWithBackground = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: element => element.getAttribute('data-background-color') ?? element.style.backgroundColor ?? null,
        renderHTML: attributes => {
          const color = attributes.backgroundColor as string | null
          if (!color) {
            return {}
          }
          return {
            style: `background-color: ${color}`,
            'data-background-color': color
          }
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
        parseHTML: element => element.getAttribute('data-background-color') ?? element.style.backgroundColor ?? null,
        renderHTML: attributes => {
          const color = attributes.backgroundColor as string | null
          if (!color) {
            return {}
          }
          return {
            style: `background-color: ${color}`,
            'data-background-color': color
          }
        }
      }
    }
  }
})

const FontSizeExtension = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize || null,
            renderHTML: attributes => {
              const size = attributes.fontSize as string | null
              if (!size) {
                return {}
              }
              return { style: `font-size: ${size}` }
            }
          }
        }
      }
    ]
  },
  addCommands() {
    return {
      setFontSize:
        size =>
        ({ chain }) => {
          return chain().setMark('textStyle', { fontSize: size }).run()
        },
      unsetFontSize:
        () =>
        ({ chain }) => {
          return chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
        }
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

export default function RichTextEditor({ value, onChange }: Props) {
  const [fontKey, setFontKey] = useState<FontKey>('system')
  const [fontColor, setFontColor] = useState<string>(DEFAULT_COLOR)
  const [fontSize, setFontSize] = useState<FontSizeValue>(FONT_SIZE_DEFAULT)
  const [cellBackground, setCellBackground] = useState<string>('')
  const [isTableSelection, setIsTableSelection] = useState<boolean>(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4]
        }
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph']
      }),
      Color.configure({
        types: ['textStyle']
      }),
      TextStyle,
      FontFamily,
      FontSizeExtension,
      Table.configure({
        resizable: true,
        // columnResizing: {
        //   handleWidth: 6,
        //   cellMinWidth: 40,
        //   useTableWidth: true
        // },
        HTMLAttributes: {
          class: 'tiptap-table'
        }
      }),
      TableRow,
      TableHeaderWithBackground,
      TableCellWithBackground
    ],
    content: value,
    autofocus: false,
    onUpdate: ({ editor: instance }) => {
      const html = instance.getHTML()
      onChange(html)
    },
    onSelectionUpdate: ({ editor: instance }) => {
      const currentFamily = String(instance.getAttributes('textStyle').fontFamily ?? '').trim()
      const nextKey = resolveFontKey(currentFamily)
      setFontKey(prev => (prev === nextKey ? prev : nextKey))

      const currentColor = String(instance.getAttributes('textStyle').color ?? '')
      const nextColor = normalizeColorValue(currentColor)
      setFontColor(prev => (prev === nextColor ? prev : nextColor))

      const currentSize = String(instance.getAttributes('textStyle').fontSize ?? '')
      const nextSize = normalizeFontSizeValue(currentSize)
      setFontSize(prev => (prev === nextSize ? prev : nextSize))

      const activeInTable = instance.isActive('tableCell') || instance.isActive('tableHeader')
      setIsTableSelection(activeInTable)

      if (activeInTable) {
        const cellAttrs = instance.getAttributes('tableCell')
        const headerAttrs = instance.getAttributes('tableHeader')
        const backgroundRaw = String(
          cellAttrs.backgroundColor ?? headerAttrs.backgroundColor ?? ''
        )
        const nextBackground = normalizeOptionalColorValue(backgroundRaw)
        setCellBackground(prev => (prev === nextBackground ? prev : nextBackground))
      } else {
        setCellBackground(prev => (prev === '' ? prev : ''))
      }
    }
  })

  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (current === value) return

    const { from, to } = editor.state.selection
    editor.commands.setContent(value, false)
    editor.commands.setTextSelection({ from, to })
  }, [editor, value])

  useEffect(() => {
    if (!editor) return
    const initialColor = normalizeColorValue(String(editor.getAttributes('textStyle').color ?? ''))
    setFontColor(initialColor)

    const initialSize = normalizeFontSizeValue(String(editor.getAttributes('textStyle').fontSize ?? ''))
    setFontSize(initialSize)
  }, [editor])

  if (!editor) return null

  const exec = (action: (instance: Editor) => void) => () => {
    if (!editor) return
    action(editor)
  }

  const isActive = (name: string, attrs?: Record<string, unknown>) => editor?.isActive(name, attrs) ?? false

  const handleFontChange = (event: ChangeEvent<HTMLSelectElement>) => {
    if (!editor) return
    const nextFontKey = event.target.value as FontKey
    setFontKey(nextFontKey)
    if (nextFontKey === 'system') {
      editor.chain().focus().unsetFontFamily().run()
      return
    }
    const fontFamily = FONT_FAMILIES[nextFontKey as FontFamilyKey]
    editor.chain().focus().setFontFamily(fontFamily).run()
  }

  const handleColorChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!editor) return
    const nextColor = event.target.value
    setFontColor(nextColor)
    editor.chain().focus().setColor(nextColor).run()
  }

  const handleColorReset = () => {
    if (!editor) return
    editor.chain().focus().unsetColor().run()
    setFontColor(DEFAULT_COLOR)
  }

  const handleCellBackgroundChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!editor) return
    const nextColor = event.target.value
    setCellBackground(nextColor)
    editor.chain().focus().setCellAttribute('backgroundColor', nextColor).run()
  }

  const handleCellBackgroundReset = () => {
    if (!editor) return
    editor.chain().focus().setCellAttribute('backgroundColor', '').run()
    setCellBackground('')
  }

  const handleFontSizeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    if (!editor) return
    const nextSize = event.target.value as FontSizeValue
    setFontSize(nextSize)

    if (nextSize === FONT_SIZE_DEFAULT) {
      editor.chain().focus().unsetFontSize().run()
      return
    }

    editor.chain().focus().setFontSize(nextSize).run()
  }

  const handleFontSizeReset = () => {
    if (!editor) return
    editor.chain().focus().unsetFontSize().run()
    setFontSize(FONT_SIZE_DEFAULT)
  }

  if (!editor) {
    return <div className="rte rte--loading" />
  }

  return (
    <div className="rte">
      <div className="rte__toolbar">
        <label htmlFor="rte-font-family" className="rte__font-label">
          폰트
        </label>
        <select
          id="rte-font-family"
          className="rte__font-select"
          value={fontKey}
          onChange={handleFontChange}
        >
          {FONT_OPTIONS.map(option => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="rte__control-group">
          <label htmlFor="rte-font-color" className="rte__font-label">
            글자색
          </label>
          <input
            id="rte-font-color"
            type="color"
            className="rte__color-input"
            value={fontColor}
            onChange={handleColorChange}
            title="글자색 선택"
          />
          <button type="button" className="rte__color-reset" onClick={handleColorReset}>
            초기화
          </button>
        </div>

        <div className="rte__control-group">
          <label htmlFor="rte-font-size" className="rte__font-label">
            글자 크기
          </label>
          <select
            id="rte-font-size"
            className="rte__size-select"
            value={fontSize}
            onChange={handleFontSizeChange}
          >
            {FONT_SIZE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="button" className="rte__size-reset" onClick={handleFontSizeReset}>
            초기화
          </button>
        </div>

        <div className="rte__control-group">
          <label htmlFor="rte-cell-background" className="rte__font-label">
            셀 배경
          </label>
          <input
            id="rte-cell-background"
            type="color"
            className="rte__color-input"
            value={cellBackground || DEFAULT_CELL_BACKGROUND}
            onChange={handleCellBackgroundChange}
            disabled={!isTableSelection}
            title="표 셀 배경색 선택"
          />
          <button
            type="button"
            className="rte__color-reset"
            disabled={!isTableSelection}
            onClick={handleCellBackgroundReset}
          >
            없음
          </button>
        </div>

        <span className="sep" />

        <button
          type="button"
          className={isActive('heading', { level: 1 }) ? 'active' : ''}
          onClick={exec(instance => {
            instance.chain().focus().toggleHeading({ level: 1 }).run()
          })}>
          H1
        </button>
        <button
          type="button"
          className={isActive('heading', { level: 2 }) ? 'active' : ''}
          onClick={exec(instance => {
            instance.chain().focus().toggleHeading({ level: 2 }).run()
          })}>
          H2
        </button>
        <button
          type="button"
          className={isActive('heading', { level: 3 }) ? 'active' : ''}
          onClick={exec(instance => {
            instance.chain().focus().toggleHeading({ level: 3 }).run()
          })}>
          H3
        </button>

        <span className="sep" />

        <button
          type="button"
          className={isActive('bold') ? 'active' : ''}
          onClick={exec(instance => {
            instance.chain().focus().toggleBold().run()
          })}>
          B
        </button>
        <button
          type="button"
          className={isActive('italic') ? 'active' : ''}
          onClick={exec(instance => {
            instance.chain().focus().toggleItalic().run()
          })}>
          I
        </button>
        <button
          type="button"
          className={isActive('underline') ? 'active' : ''}
          onClick={exec(instance => {
            instance.chain().focus().toggleUnderline().run()
          })}>
          U
        </button>

        <span className="sep" />

        <button
          type="button"
          className={isActive('bulletList') ? 'active' : ''}
          onClick={exec(instance => {
            instance.chain().focus().toggleBulletList().run()
          })}>
          • List
        </button>
        <button
          type="button"
          className={isActive('orderedList') ? 'active' : ''}
          onClick={exec(instance => {
            instance.chain().focus().toggleOrderedList().run()
          })}>
          1. List
        </button>

        <span className="sep" />

        <button
          type="button"
          className={isActive('textAlign', { textAlign: 'left' }) ? 'active' : ''}
          onClick={exec(instance => {
            instance.chain().focus().setTextAlign('left').run()
          })}>
          L
        </button>
        <button
          type="button"
          className={isActive('textAlign', { textAlign: 'center' }) ? 'active' : ''}
          onClick={exec(instance => {
            instance.chain().focus().setTextAlign('center').run()
          })}>
          C
        </button>
        <button
          type="button"
          className={isActive('textAlign', { textAlign: 'right' }) ? 'active' : ''}
          onClick={exec(instance => {
            instance.chain().focus().setTextAlign('right').run()
          })}>
          R
        </button>
        <button
          type="button"
          className={isActive('textAlign', { textAlign: 'justify' }) ? 'active' : ''}
          onClick={exec(instance => {
            instance.chain().focus().setTextAlign('justify').run()
          })}>
          J
        </button>

        <span className="sep" />

        <button
          type="button"
          onClick={exec(instance => {
            instance.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          })}>
          표 추가
        </button>
        <button
          type="button"
          disabled={!isActive('table')}
          onClick={exec(instance => {
            instance.chain().focus().deleteTable().run()
          })}>
          표 삭제
        </button>
        <button
          type="button"
          disabled={!isActive('table')}
          onClick={exec(instance => {
            instance.chain().focus().addColumnBefore().run()
          })}>
          열 추가(좌)
        </button>
        <button
          type="button"
          disabled={!isActive('table')}
          onClick={exec(instance => {
            instance.chain().focus().addColumnAfter().run()
          })}>
          열 추가(우)
        </button>
        <button
          type="button"
          disabled={!isActive('table')}
          onClick={exec(instance => {
            instance.chain().focus().addRowBefore().run()
          })}>
          행 추가(위)
        </button>
        <button
          type="button"
          disabled={!isActive('table')}
          onClick={exec(instance => {
            instance.chain().focus().addRowAfter().run()
          })}>
          행 추가(아래)
        </button>
        <button
          type="button"
          disabled={!isActive('table')}
          onClick={exec(instance => {
            instance.chain().focus().deleteColumn().run()
          })}>
          열 삭제
        </button>
        <button
          type="button"
          disabled={!isActive('table')}
          onClick={exec(instance => {
            instance.chain().focus().deleteRow().run()
          })}>
          행 삭제
        </button>
      </div>

      <EditorContent editor={editor} className="rte__content" />
    </div>
  )
}

function resolveFontKey(fontFamily: string): FontKey {
  if (!fontFamily) {
    return 'system'
  }

  const normalized = normalizeFontValue(fontFamily)
  const matched = (Object.entries(FONT_FAMILIES) as Array<[FontFamilyKey, string]>).find(
    ([, value]) => normalizeFontValue(value) === normalized
  )

  if (matched) {
    return matched[0]
  }

  return 'system'
}

function normalizeFontValue(value: string): string {
  return value
    .replace(/['"]/g, '')
    .split(',')
    .map(part => part.trim().toLowerCase())
    .filter(Boolean)
    .join(',')
}

function normalizeFontSizeValue(value: string): FontSizeValue {
  const trimmed = value.trim().toLowerCase()

  if (!trimmed) {
    return FONT_SIZE_DEFAULT
  }

  if (FONT_SIZE_PRESET_SET.has(trimmed as FontSizePreset)) {
    return trimmed as FontSizeValue
  }

  const compact = trimmed.replace(/\s+/g, '')
  if (FONT_SIZE_PRESET_SET.has(compact as FontSizePreset)) {
    return compact as FontSizeValue
  }

  return FONT_SIZE_DEFAULT
}

function normalizeOptionalColorValue(value: string): string {
  const trimmed = value.trim().toLowerCase()

  if (!trimmed || trimmed === 'transparent') {
    return ''
  }

  if (/^#[0-9a-f]{3,8}$/.test(trimmed)) {
    if (trimmed.length === 4) {
      const [r, g, b] = trimmed.slice(1)
      return `#${r}${r}${g}${g}${b}${b}`
    }
    if (trimmed.length === 7) {
      return trimmed
    }
    if (trimmed.length === 9) {
      return trimmed.slice(0, 7)
    }
    return trimmed
  }

  const rgbMatch = trimmed.match(/^rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})/)
  if (rgbMatch) {
    const [r, g, b] = rgbMatch.slice(1, 4).map(channel => clampColorChannel(Number.parseInt(channel, 10)))
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }

  return ''
}

function normalizeColorValue(value: string): string {
  const trimmed = value.trim().toLowerCase()

  if (!trimmed) {
    return DEFAULT_COLOR
  }

  if (trimmed.startsWith('#')) {
    if (trimmed.length === 4) {
      const [r, g, b] = trimmed.slice(1).split('')
      return `#${r}${r}${g}${g}${b}${b}`
    }

    if (trimmed.length === 7) {
      return trimmed
    }

    return DEFAULT_COLOR
  }

  const match = trimmed.match(/^rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})/)
  if (match) {
    const [r, g, b] = match.slice(1, 4).map(channel => clampColorChannel(Number.parseInt(channel, 10)))
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }

  return DEFAULT_COLOR
}

function clampColorChannel(value: number): number {
  if (Number.isNaN(value)) {
    return 0
  }

  return Math.min(255, Math.max(0, value))
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0')
}
