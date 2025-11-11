import { useCallback, useEffect, useRef, useState } from 'react'
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
  onDownload?: () => void
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
const TABLE_PICKER_MAX_ROWS = 8
const TABLE_PICKER_MAX_COLS = 8
const TABLE_PICKER_DEFAULT_SIZE = { rows: 2, cols: 2 } as const

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

export default function RichTextEditor({ value, onChange, onDownload }: Props) {
  const [fontKey, setFontKey] = useState<FontKey>('system')
  const [fontColor, setFontColor] = useState<string>(DEFAULT_COLOR)
  const [fontSize, setFontSize] = useState<FontSizeValue>(FONT_SIZE_DEFAULT)
  const [cellBackground, setCellBackground] = useState<string>('')
  const [isTableSelection, setIsTableSelection] = useState<boolean>(false)
  const [isTablePickerOpen, setIsTablePickerOpen] = useState<boolean>(false)
  const [tablePickerHover, setTablePickerHover] = useState<{ rows: number; cols: number }>(
    TABLE_PICKER_DEFAULT_SIZE
  )
  const tablePickerAnchorRef = useRef<HTMLDivElement | null>(null)
  const tablePickerPopoverRef = useRef<HTMLDivElement | null>(null)

  const defaultEditorWidthRef = useRef<number | null>(null)

  const applyResponsiveWidth = useCallback((proseMirrorRoot: HTMLElement | null) => {
    if (!proseMirrorRoot) return

    if (defaultEditorWidthRef.current === null) {
      const measured = proseMirrorRoot.getBoundingClientRect().width
      if (Number.isFinite(measured) && measured > 0) {
        defaultEditorWidthRef.current = measured
      }
    }

    const baseWidth = defaultEditorWidthRef.current ?? proseMirrorRoot.getBoundingClientRect().width
    if (!baseWidth || !Number.isFinite(baseWidth)) {
      return
    }

    const tables = Array.from(proseMirrorRoot.querySelectorAll<HTMLTableElement>('table'))
    const maxTableWidth = tables.reduce((acc, table) => {
      const rectWidth = table.getBoundingClientRect().width
      const scrollWidth = table.scrollWidth
      return Math.max(acc, rectWidth, scrollWidth)
    }, 0)

    const targetWidth = maxTableWidth > baseWidth ? maxTableWidth : baseWidth
    const shouldExpand = targetWidth > baseWidth + 1

    if (shouldExpand) {
      const widthPx = `${targetWidth}px`
      proseMirrorRoot.style.width = widthPx
      proseMirrorRoot.style.minWidth = widthPx
      proseMirrorRoot.style.maxWidth = widthPx
    } else {
      proseMirrorRoot.style.width = ''
      proseMirrorRoot.style.minWidth = ''
      proseMirrorRoot.style.maxWidth = ''
    }
  }, [])

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
    onCreate: ({ editor: instance }) => {
      applyResponsiveWidth(instance.view.dom as HTMLElement)
    },
    onUpdate: ({ editor: instance }) => {
      const html = instance.getHTML()
      onChange(html)
      applyResponsiveWidth(instance.view.dom as HTMLElement)
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

  useEffect(() => {
    if (!editor) return
    const root = editor.view.dom as HTMLElement

    const handleResize = () => {
      applyResponsiveWidth(root)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [editor, applyResponsiveWidth])

  useEffect(() => {
    if (!isTablePickerOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (
        !target ||
        tablePickerAnchorRef.current?.contains(target) ||
        tablePickerPopoverRef.current?.contains(target)
      ) {
        return
      }
      setIsTablePickerOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTablePickerOpen(false)
      }
    }

    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isTablePickerOpen])

  if (!editor) return null

  const exec = (action: (instance: Editor) => void) => () => {
    if (!editor) return
    action(editor)
  }

  const isActive = (name: string, attrs?: Record<string, unknown>) => editor?.isActive(name, attrs) ?? false

  const getButtonClass = (active: boolean) => (active ? 'rte__icon-button active' : 'rte__icon-button')

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
        <div className="rte__toolbar-group rte__toolbar-group--primary">
          <label htmlFor="rte-font-family" className="rte__group-label">
            텍스트 스타일
          </label>
          <select
            id="rte-font-family"
            className="rte__select rte__select--wide"
            value={fontKey}
            onChange={handleFontChange}
          >
            {FONT_OPTIONS.map(option => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rte__toolbar-group">
          <label htmlFor="rte-font-color" className="rte__group-label">
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
          <button type="button" className="rte__chip-button" onClick={handleColorReset}>
            기본
          </button>
        </div>

        <div className="rte__toolbar-group">
          <label htmlFor="rte-font-size" className="rte__group-label">
            글자 크기
          </label>
          <select
            id="rte-font-size"
            className="rte__select"
            value={fontSize}
            onChange={handleFontSizeChange}
          >
            {FONT_SIZE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="button" className="rte__chip-button" onClick={handleFontSizeReset}>
            기본
          </button>
        </div>

        <div className="rte__toolbar-group">
          <label htmlFor="rte-cell-background" className="rte__group-label">
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
            className="rte__chip-button"
            disabled={!isTableSelection}
            onClick={handleCellBackgroundReset}
          >
            없음
          </button>
        </div>

        <div className="rte__toolbar-separator" />

        <div className="rte__toolbar-group rte__toolbar-group--compact">
          <button
            type="button"
            className={getButtonClass(isActive('heading', { level: 1 }))}
            onClick={exec(instance => {
              instance.chain().focus().toggleHeading({ level: 1 }).run()
            })}
          >
            H1
          </button>
          <button
            type="button"
            className={getButtonClass(isActive('heading', { level: 2 }))}
            onClick={exec(instance => {
              instance.chain().focus().toggleHeading({ level: 2 }).run()
            })}
          >
            H2
          </button>
          <button
            type="button"
            className={getButtonClass(isActive('heading', { level: 3 }))}
            onClick={exec(instance => {
              instance.chain().focus().toggleHeading({ level: 3 }).run()
            })}
          >
            H3
          </button>
        </div>

        <div className="rte__toolbar-group rte__toolbar-group--compact">
          <button
            type="button"
            className={getButtonClass(isActive('bold'))}
            onClick={exec(instance => {
              instance.chain().focus().toggleBold().run()
            })}
          >
            B
          </button>
          <button
            type="button"
            className={getButtonClass(isActive('italic'))}
            onClick={exec(instance => {
              instance.chain().focus().toggleItalic().run()
            })}
          >
            I
          </button>
          <button
            type="button"
            className={getButtonClass(isActive('underline'))}
            onClick={exec(instance => {
              instance.chain().focus().toggleUnderline().run()
            })}
          >
            U
          </button>
        </div>

        <div className="rte__toolbar-group rte__toolbar-group--compact">
          <button
            type="button"
            className={getButtonClass(isActive('bulletList'))}
            onClick={exec(instance => {
              instance.chain().focus().toggleBulletList().run()
            })}
          >
            •
          </button>
          <button
            type="button"
            className={getButtonClass(isActive('orderedList'))}
            onClick={exec(instance => {
              instance.chain().focus().toggleOrderedList().run()
            })}
          >
            1.
          </button>
        </div>

        <div className="rte__toolbar-group rte__toolbar-group--compact">
          <button
            type="button"
            className={getButtonClass(isActive('textAlign', { textAlign: 'left' }))}
            onClick={exec(instance => {
              instance.chain().focus().setTextAlign('left').run()
            })}
          >
            좌
          </button>
          <button
            type="button"
            className={getButtonClass(isActive('textAlign', { textAlign: 'center' }))}
            onClick={exec(instance => {
              instance.chain().focus().setTextAlign('center').run()
            })}
          >
            중
          </button>
          <button
            type="button"
            className={getButtonClass(isActive('textAlign', { textAlign: 'right' }))}
            onClick={exec(instance => {
              instance.chain().focus().setTextAlign('right').run()
            })}
          >
            우
          </button>
          <button
            type="button"
            className={getButtonClass(isActive('textAlign', { textAlign: 'justify' }))}
            onClick={exec(instance => {
              instance.chain().focus().setTextAlign('justify').run()
            })}
          >
            양
          </button>
        </div>

        <div className="rte__table-picker" ref={tablePickerAnchorRef}>
          <button
            type="button"
            className={getButtonClass(isTablePickerOpen)}
            onMouseDown={event => {
              event.preventDefault()
            }}
            onClick={() => {
              setIsTablePickerOpen(prev => {
                const next = !prev
                if (!prev && editor) {
                  editor.chain().focus().run()
                }
                if (!prev) {
                  setTablePickerHover(TABLE_PICKER_DEFAULT_SIZE)
                }
                return next
              })
            }}
          >
            표 추가
          </button>

          {isTablePickerOpen ? (
            <div className="rte__table-picker-popover" ref={tablePickerPopoverRef}>
              <div className="rte__table-picker-preview">
                {Math.max(tablePickerHover.rows, 1)} × {Math.max(tablePickerHover.cols, 1)} 표
              </div>
              <div className="rte__table-picker-grid">
                {Array.from({ length: TABLE_PICKER_MAX_ROWS }).map((_, rowIndex) => (
                  <div key={`row-${rowIndex}`} className="rte__table-picker-row">
                    {Array.from({ length: TABLE_PICKER_MAX_COLS }).map((__, colIndex) => {
                      const rows = rowIndex + 1
                      const cols = colIndex + 1
                      const isActiveCell =
                        rows <= Math.max(tablePickerHover.rows, 0) &&
                        cols <= Math.max(tablePickerHover.cols, 0)
                      return (
                        <button
                          type="button"
                          key={`cell-${rowIndex}-${colIndex}`}
                          className={`rte__table-picker-cell${isActiveCell ? ' selected' : ''}`}
                          onMouseEnter={() => {
                            setTablePickerHover({ rows, cols })
                          }}
                          onFocus={() => {
                            setTablePickerHover({ rows, cols })
                          }}
                          onMouseDown={event => {
                            event.preventDefault()
                          }}
                          onClick={() => {
                            const insertRows = Math.max(rows, 1)
                            const insertCols = Math.max(cols, 1)
                            editor
                              ?.chain()
                              .focus()
                              .insertTable({
                                rows: insertRows,
                                cols: insertCols,
                                withHeaderRow: false
                              })
                              .run()
                            setIsTablePickerOpen(false)
                          }}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rte__toolbar-group rte__toolbar-group--table">
          {onDownload ? (
            <button type="button" className="rte__download-button" onClick={onDownload}>
              .odt 다운로드
            </button>
          ) : null}
          <button
            type="button"
            className="rte__chip-button"
            disabled={!isActive('table')}
            onClick={exec(instance => {
              instance.chain().focus().deleteTable().run()
            })}
          >
            표 삭제
          </button>
          <button
            type="button"
            className="rte__chip-button"
            disabled={!isActive('table')}
            onClick={exec(instance => {
              instance.chain().focus().addColumnBefore().run()
            })}
          >
            열 + 좌
          </button>
          <button
            type="button"
            className="rte__chip-button"
            disabled={!isActive('table')}
            onClick={exec(instance => {
              instance.chain().focus().addColumnAfter().run()
            })}
          >
            열 + 우
          </button>
          <button
            type="button"
            className="rte__chip-button"
            disabled={!isActive('table')}
            onClick={exec(instance => {
              instance.chain().focus().addRowBefore().run()
            })}
          >
            행 + 상
          </button>
          <button
            type="button"
            className="rte__chip-button"
            disabled={!isActive('table')}
            onClick={exec(instance => {
              instance.chain().focus().addRowAfter().run()
            })}
          >
            행 + 하
          </button>
          <button
            type="button"
            className="rte__chip-button"
            disabled={!isActive('table')}
            onClick={exec(instance => {
              instance.chain().focus().deleteColumn().run()
            })}
          >
            열 삭제
          </button>
          <button
            type="button"
            className="rte__chip-button"
            disabled={!isActive('table')}
            onClick={exec(instance => {
              instance.chain().focus().deleteRow().run()
            })}
          >
            행 삭제
          </button>
        </div>
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
