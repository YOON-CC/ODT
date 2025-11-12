import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Editor } from '@tiptap/core'
import {
  MdDownload,
  MdFormatBold,
  MdFormatItalic,
  MdFormatListBulleted,
  MdFormatListNumbered,
  MdFormatQuote,
  MdFormatUnderlined,
  MdGridOn,
  MdRedo,
  MdStrikethroughS,
  MdUndo
} from 'react-icons/md'
import {
  DEFAULT_CELL_BACKGROUND,
  DEFAULT_COLOR,
  FONT_FAMILIES,
  FONT_OPTIONS,
  FONT_SIZE_DEFAULT,
  FONT_SIZE_OPTIONS,
  FontFamilyKey,
  FontKey,
  FontSizeValue,
  TABLE_PICKER_DEFAULT_SIZE,
  TABLE_PICKER_MAX_COLS,
  TABLE_PICKER_MAX_ROWS,
  normalizeColorValue,
  normalizeFontSizeValue,
  normalizeOptionalColorValue,
  resolveFontKey
} from '../lib/editorToolbarConfig'

type Props = {
  editor: Editor | null
  onDownload?: () => void
}

type TableSize = { rows: number; cols: number }

export default function GlobalToolbar({ editor, onDownload }: Props) {
  const [fontKey, setFontKey] = useState<FontKey>('system')
  const [fontColor, setFontColor] = useState<string>(DEFAULT_COLOR)
  const [fontSize, setFontSize] = useState<FontSizeValue>(FONT_SIZE_DEFAULT)
  const [cellBackground, setCellBackground] = useState<string>('')
  const [isTableSelection, setIsTableSelection] = useState<boolean>(false)
  const [isTablePickerOpen, setIsTablePickerOpen] = useState<boolean>(false)
  const [tablePickerHover, setTablePickerHover] = useState<TableSize>(TABLE_PICKER_DEFAULT_SIZE)
  const [tablePickerSelection, setTablePickerSelection] = useState<TableSize | null>(null)
  const tablePickerAnchorRef = useRef<HTMLDivElement | null>(null)
  const tablePickerPopoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!editor) {
      setFontKey('system')
      setFontColor(DEFAULT_COLOR)
      setFontSize(FONT_SIZE_DEFAULT)
      setCellBackground('')
      setIsTableSelection(false)
      setIsTablePickerOpen(false)
      return
    }

    const updateState = () => {
      const instance = editor
      const currentFamily = String(instance.getAttributes('textStyle').fontFamily ?? '').trim()
      setFontKey(resolveFontKey(currentFamily))

      const currentColor = String(instance.getAttributes('textStyle').color ?? '')
      setFontColor(normalizeColorValue(currentColor))

      const currentSize = String(instance.getAttributes('textStyle').fontSize ?? '')
      setFontSize(normalizeFontSizeValue(currentSize))

      const activeInTable = instance.isActive('tableCell') || instance.isActive('tableHeader')
      setIsTableSelection(activeInTable)

      if (activeInTable) {
        const cellAttrs = instance.getAttributes('tableCell')
        const headerAttrs = instance.getAttributes('tableHeader')
        const backgroundRaw = String(cellAttrs.backgroundColor ?? headerAttrs.backgroundColor ?? '')
        setCellBackground(normalizeOptionalColorValue(backgroundRaw))
      } else {
        setCellBackground('')
      }
    }

    editor.on('selectionUpdate', updateState)
    editor.on('update', updateState)
    updateState()

    return () => {
      editor.off('selectionUpdate', updateState)
      editor.off('update', updateState)
    }
  }, [editor])

  useEffect(() => {
    if (!isTablePickerOpen) return
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (tablePickerAnchorRef.current?.contains(target)) return
      if (tablePickerPopoverRef.current?.contains(target)) return
      setIsTablePickerOpen(false)
      setTablePickerSelection(null)
      setTablePickerHover(TABLE_PICKER_DEFAULT_SIZE)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTablePickerOpen(false)
        setTablePickerSelection(null)
        setTablePickerHover(TABLE_PICKER_DEFAULT_SIZE)
      }
    }
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isTablePickerOpen])

  const exec = (command: (instance: Editor) => void) => () => {
    if (!editor) return
    command(editor)
  }

  const isActive = (name: string, attrs?: Record<string, unknown>) => editor?.isActive(name, attrs) ?? false
  const btn = (active: boolean) => (active ? 'gdoc__btn is-active' : 'gdoc__btn')

  const currentHeadingLevel =
    (editor?.isActive('heading', { level: 1 }) && 'h1') ||
    (editor?.isActive('heading', { level: 2 }) && 'h2') ||
    (editor?.isActive('heading', { level: 3 }) && 'h3') ||
    'p'

  const onHeadingChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value
    if (!editor) return
    if (value === 'p') editor.chain().focus().setParagraph().run()
    if (value === 'h1') editor.chain().focus().toggleHeading({ level: 1 }).run()
    if (value === 'h2') editor.chain().focus().toggleHeading({ level: 2 }).run()
    if (value === 'h3') editor.chain().focus().toggleHeading({ level: 3 }).run()
  }

  const handleFontChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextKey = event.target.value as FontKey
    setFontKey(nextKey)
    if (!editor) return
    if (nextKey === 'system') editor.chain().focus().unsetFontFamily().run()
    else editor.chain().focus().setFontFamily(FONT_FAMILIES[nextKey as FontFamilyKey]).run()
  }

  const handleColorChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value
    setFontColor(next)
    editor?.chain().focus().setColor(next).run()
  }

  const handleColorReset = () => {
    editor?.chain().focus().unsetColor().run()
    setFontColor(DEFAULT_COLOR)
  }

  const handleCellBackgroundChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value
    setCellBackground(next)
    editor?.chain().focus().setCellAttribute('backgroundColor', next).run()
  }

  const handleCellBackgroundReset = () => {
    editor?.chain().focus().setCellAttribute('backgroundColor', '').run()
    setCellBackground('')
  }

  const handleFontSizeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as FontSizeValue
    setFontSize(next)
    if (!editor) return
    if (next === FONT_SIZE_DEFAULT) editor.chain().focus().unsetFontSize().run()
    else editor.chain().focus().setFontSize(next).run()
  }

  const handleFontSizeReset = () => {
    editor?.chain().focus().unsetFontSize().run()
    setFontSize(FONT_SIZE_DEFAULT)
  }

  const handleInsertTable = (rows: number, cols: number) => {
    if (!editor) return
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: false }).run()
    setIsTablePickerOpen(false)
    setTablePickerSelection(null)
    setTablePickerHover(TABLE_PICKER_DEFAULT_SIZE)
  }

  return (
    <div className="gdoc__toolbar global-toolbar">
      {/* 텍스트 스타일 */}
      <div className="gdoc__group">
        <select
          className="gdoc__select"
          value={currentHeadingLevel}
          onChange={onHeadingChange}
          title="텍스트 스타일"
          disabled={!editor}
        >
          <option value="p">본문</option>
          <option value="h1">제목 1</option>
          <option value="h2">제목 2</option>
          <option value="h3">제목 3</option>
        </select>
      </div>

      {/* 굵게 / 기울기 / 밑줄 / 취소선 */}
      <div className="gdoc__group">
        <button
          type="button"
          className={btn(isActive('bold'))}
          onClick={exec(instance => instance.chain().focus().toggleBold().run())}
          title="굵게"
          disabled={!editor}
        >
          <MdFormatBold size={20} />
        </button>
        <button
          type="button"
          className={btn(isActive('italic'))}
          onClick={exec(instance => instance.chain().focus().toggleItalic().run())}
          title="기울임"
          disabled={!editor}
        >
          <MdFormatItalic size={20} />
        </button>
        <button
          type="button"
          className={btn(isActive('underline'))}
          onClick={exec(instance => instance.chain().focus().toggleUnderline().run())}
          title="밑줄"
          disabled={!editor}
        >
          <MdFormatUnderlined size={20} />
        </button>
        <button
          type="button"
          className={btn(isActive('strike'))}
          onClick={exec(instance => instance.chain().focus().toggleStrike().run())}
          title="취소선"
          disabled={!editor}
        >
          <MdStrikethroughS size={20} />
        </button>
      </div>

      {/* 리스트 */}
      <div className="gdoc__group">
        <button
          type="button"
          className={btn(isActive('bulletList'))}
          onClick={exec(instance => instance.chain().focus().toggleBulletList().run())}
          title="글머리 기호"
          disabled={!editor}
        >
          <MdFormatListBulleted size={20} />
        </button>
        <button
          type="button"
          className={btn(isActive('orderedList'))}
          onClick={exec(instance => instance.chain().focus().toggleOrderedList().run())}
          title="번호 매기기"
          disabled={!editor}
        >
          <MdFormatListNumbered size={20} />
        </button>
      </div>

      {/* 인용구 */}
      <div className="gdoc__group">
        <button
          type="button"
          className={btn(isActive('blockquote'))}
          onClick={exec(instance => instance.chain().focus().toggleBlockquote().run())}
          title="인용구"
          disabled={!editor}
        >
          <MdFormatQuote size={20} />
        </button>
      </div>

      {/* Undo / Redo */}
      <div className="gdoc__group">
        <button
          type="button"
          className="gdoc__btn"
          onClick={exec(instance => instance.chain().focus().undo().run())}
          title="실행 취소"
          disabled={!editor}
        >
          <MdUndo size={20} />
        </button>
        <button
          type="button"
          className="gdoc__btn"
          onClick={exec(instance => instance.chain().focus().redo().run())}
          title="다시 실행"
          disabled={!editor}
        >
          <MdRedo size={20} />
        </button>
      </div>

      {/* 표 삽입 */}
      <div className="gdoc__group" ref={tablePickerAnchorRef}>
        <button
          type="button"
          className="rte__chip-button"
          onMouseDown={event => event.preventDefault()}
          onClick={() => {
            if (!editor) return
            setIsTablePickerOpen(previous => {
              if (previous) {
                setTablePickerSelection(null)
                setTablePickerHover(TABLE_PICKER_DEFAULT_SIZE)
                return false
              }
              const initial = tablePickerSelection ?? TABLE_PICKER_DEFAULT_SIZE
              setTablePickerHover(initial)
              setTablePickerSelection(initial)
              editor.chain().focus().run()
              return true
            })
          }}
          disabled={!editor}
        >
          <MdGridOn size={20} />
        </button>
        {isTablePickerOpen && (
          <div className="rte__table-picker-popover" ref={tablePickerPopoverRef}>
            <div className="rte__table-picker-header">
              <span>
                {Math.max((tablePickerHover ?? tablePickerSelection ?? TABLE_PICKER_DEFAULT_SIZE).rows, 1)} ×{' '}
                {Math.max((tablePickerHover ?? tablePickerSelection ?? TABLE_PICKER_DEFAULT_SIZE).cols, 1)} 표
              </span>
              <button
                type="button"
                className="rte__table-picker-apply"
                onClick={() => {
                  const target = tablePickerSelection ?? tablePickerHover ?? TABLE_PICKER_DEFAULT_SIZE
                  handleInsertTable(target.rows, target.cols)
                }}
              >
                적용
              </button>
            </div>
            <div className="rte__table-picker-grid">
              {Array.from({ length: TABLE_PICKER_MAX_ROWS }).map((_, rowIndex) => (
                <div key={`row-${rowIndex}`} className="rte__table-picker-row">
                  {Array.from({ length: TABLE_PICKER_MAX_COLS }).map((__, colIndex) => {
                    const rows = rowIndex + 1
                    const cols = colIndex + 1
                    const highlightRows =
                      tablePickerHover?.rows ?? tablePickerSelection?.rows ?? TABLE_PICKER_DEFAULT_SIZE.rows
                    const highlightCols =
                      tablePickerHover?.cols ?? tablePickerSelection?.cols ?? TABLE_PICKER_DEFAULT_SIZE.cols
                    const isHighlighted = rows <= highlightRows && cols <= highlightCols
                    return (
                      <button
                        key={`cell-${rowIndex}-${colIndex}`}
                        type="button"
                        className={`rte__table-picker-cell${isHighlighted ? ' selected' : ''}`}
                        onMouseEnter={() => setTablePickerHover({ rows, cols })}
                        onFocus={() => setTablePickerHover({ rows, cols })}
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => {
                          setTablePickerSelection({ rows, cols })
                          setTablePickerHover({ rows, cols })
                        }}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 다운로드 */}
      <div className="gdoc__group gdoc__group--right">
        <button
          type="button"
          className="gdoc__download"
          onClick={() => onDownload?.()}
          title=".odt 다운로드"
          disabled={!editor}
        >
          <MdDownload size={18} />
          <span>.odt 다운로드</span>
        </button>
      </div>

      {/* 기존 확장 옵션 */}
      <div className="legacy-inline">
        <label className="rte__group-label">텍스트 스타일</label>
        <select
          className="rte__select rte__select--wide"
          value={fontKey}
          onChange={handleFontChange}
          disabled={!editor}
        >
          {FONT_OPTIONS.map(option => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>

        <label className="rte__group-label">글자 크기</label>
        <select className="rte__select" value={fontSize} onChange={handleFontSizeChange} disabled={!editor}>
          {FONT_SIZE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="button" className="rte__chip-button" onClick={handleFontSizeReset} disabled={!editor}>
          기본
        </button>

        <label className="rte__group-label">글자색</label>
        <input
          type="color"
          className="rte__color-input"
          value={fontColor}
          onChange={handleColorChange}
          title="글자색 선택"
          disabled={!editor}
        />
        <button type="button" className="rte__chip-button" onClick={handleColorReset} disabled={!editor}>
          기본
        </button>

        <label className="rte__group-label">셀 배경</label>
        <input
          type="color"
          className="rte__color-input"
          value={cellBackground || DEFAULT_CELL_BACKGROUND}
          onChange={handleCellBackgroundChange}
          disabled={!isTableSelection || !editor}
          title="표 셀 배경색 선택"
        />
        <button
          type="button"
          className="rte__chip-button"
          disabled={!isTableSelection || !editor}
          onClick={handleCellBackgroundReset}
        >
          없음
        </button>
      </div>
    </div>
  )
}
  