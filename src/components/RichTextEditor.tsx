// RichTextEditor.tsx
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
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

// Google Docs 스타일: React Icons (Material Design)
import {
  MdFormatBold, MdFormatItalic, MdFormatUnderlined, MdStrikethroughS,
  MdFormatListBulleted, MdFormatListNumbered, MdFormatQuote,
  MdUndo, MdRedo, MdGridOn, MdDownload
} from 'react-icons/md'

import './RichTextEditor.css'

type Props = {
  value: string
  onChange: (html: string) => void
  onDownload?: () => void
}

/** ===== 기존 폰트 선택용 옵션 (그대로 유지) ===== */
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
  FONT_SIZE_OPTIONS.filter(o => o.value !== FONT_SIZE_DEFAULT).map(o => o.value as FontSizePreset)
)

/** ===== 셀 배경색 유지 확장 (그대로) ===== */
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

export default function RichTextEditor({ value, onChange, onDownload }: Props) {
  // ===== 기존 UI 상태들 유지 =====
  const [fontKey, setFontKey] = useState<FontKey>('system')
  const [fontColor, setFontColor] = useState<string>(DEFAULT_COLOR)
  const [fontSize, setFontSize] = useState<FontSizeValue>(FONT_SIZE_DEFAULT)
  const [cellBackground, setCellBackground] = useState<string>('')
  const [isTableSelection, setIsTableSelection] = useState<boolean>(false)
  const [isTablePickerOpen, setIsTablePickerOpen] = useState<boolean>(false)
  const [tablePickerHover, setTablePickerHover] = useState<{ rows: number; cols: number }>(TABLE_PICKER_DEFAULT_SIZE)
  const tablePickerAnchorRef = useRef<HTMLDivElement | null>(null)
  const tablePickerPopoverRef = useRef<HTMLDivElement | null>(null)

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
    onSelectionUpdate: ({ editor: instance }) => {
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
  })

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

  // ===== helpers =====
  const exec = (action: (instance: Editor) => void) => () => editor && action(editor)
  const isActive = (name: string, attrs?: Record<string, unknown>) => editor?.isActive(name, attrs) ?? false
  const btn = (active: boolean) => (active ? 'gdoc__btn is-active' : 'gdoc__btn')

  // heading dropdown (구글툴바 왼쪽)
  const currentHeadingLevel =
    (editor.isActive('heading', { level: 1 }) && 'h1') ||
    (editor.isActive('heading', { level: 2 }) && 'h2') ||
    (editor.isActive('heading', { level: 3 }) && 'h3') ||
    'p'
  const onHeadingChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value
    if (v === 'p') editor.chain().focus().setParagraph().run()
    if (v === 'h1') editor.chain().focus().toggleHeading({ level: 1 }).run()
    if (v === 'h2') editor.chain().focus().toggleHeading({ level: 2 }).run()
    if (v === 'h3') editor.chain().focus().toggleHeading({ level: 3 }).run()
  }

  // ===== 기존 핸들러들 (오른쪽 raw append) =====
  const handleFontChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const nextKey = e.target.value as FontKey
    setFontKey(nextKey)
    if (nextKey === 'system') editor?.chain().focus().unsetFontFamily().run()
    else editor?.chain().focus().setFontFamily(FONT_FAMILIES[nextKey as FontFamilyKey]).run()
  }
  const handleColorChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value
    setFontColor(next)
    editor?.chain().focus().setColor(next).run()
  }
  const handleColorReset = () => {
    editor?.chain().focus().unsetColor().run()
    setFontColor(DEFAULT_COLOR)
  }
  const handleCellBackgroundChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value
    setCellBackground(next)
    editor?.chain().focus().setCellAttribute('backgroundColor', next).run()
  }
  const handleCellBackgroundReset = () => {
    editor?.chain().focus().setCellAttribute('backgroundColor', '').run()
    setCellBackground('')
  }
  const handleFontSizeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as FontSizeValue
    setFontSize(next)
    if (next === FONT_SIZE_DEFAULT) editor?.chain().focus().unsetFontSize().run()
    else editor?.chain().focus().setFontSize(next).run()
  }
  const handleFontSizeReset = () => {
    editor?.chain().focus().unsetFontSize().run()
    setFontSize(FONT_SIZE_DEFAULT)
  }

  // 테이블 픽커 닫힘 처리
  useEffect(() => {
    if (!isTablePickerOpen) return
    const onDown = (ev: MouseEvent) => {
      const t = ev.target as Node
      if (tablePickerAnchorRef.current?.contains(t)) return
      if (tablePickerPopoverRef.current?.contains(t)) return
      setIsTablePickerOpen(false)
    }
    const onEsc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setIsTablePickerOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onEsc)
    }
  }, [isTablePickerOpen])

  return (
    <div className="gdoc">
      {/* ===== 왼쪽: 구글 Docs 스타일 새 툴바 ===== */}
      <div className="gdoc__toolbar">
        {/* 텍스트 스타일 */}
        <div className="gdoc__group">
          <select className="gdoc__select" value={currentHeadingLevel} onChange={onHeadingChange} title="텍스트 스타일">
            <option value="p">본문</option>
            <option value="h1">제목 1</option>
            <option value="h2">제목 2</option>
            <option value="h3">제목 3</option>
          </select>
        </div>

        {/* 굵게 / 기울기 / 밑줄 / 취소선 */}
        <div className="gdoc__group">
          <button type="button" className={btn(isActive('bold'))} onClick={exec(i => i.chain().focus().toggleBold().run())} title="굵게"><MdFormatBold size={20} /></button>
          <button type="button" className={btn(isActive('italic'))} onClick={exec(i => i.chain().focus().toggleItalic().run())} title="기울임"><MdFormatItalic size={20} /></button>
          <button type="button" className={btn(isActive('underline'))} onClick={exec(i => i.chain().focus().toggleUnderline().run())} title="밑줄"><MdFormatUnderlined size={20} /></button>
          <button type="button" className={btn(isActive('strike'))} onClick={exec(i => i.chain().focus().toggleStrike().run())} title="취소선"><MdStrikethroughS size={20} /></button>
        </div>

        {/* 리스트 */}
        <div className="gdoc__group">
          <button type="button" className={btn(isActive('bulletList'))} onClick={exec(i => i.chain().focus().toggleBulletList().run())} title="글머리 기호"><MdFormatListBulleted size={20} /></button>
          <button type="button" className={btn(isActive('orderedList'))} onClick={exec(i => i.chain().focus().toggleOrderedList().run())} title="번호 매기기"><MdFormatListNumbered size={20} /></button>
        </div>

        {/* 인용구 */}
        <div className="gdoc__group">
          <button type="button" className={btn(isActive('blockquote'))} onClick={exec(i => i.chain().focus().toggleBlockquote().run())} title="인용구"><MdFormatQuote size={20} /></button>
        </div>

        {/* Undo / Redo */}
        <div className="gdoc__group">
          <button type="button" className="gdoc__btn" onClick={exec(i => i.chain().focus().undo().run())} title="실행 취소"><MdUndo size={20} /></button>
          <button type="button" className="gdoc__btn" onClick={exec(i => i.chain().focus().redo().run())} title="다시 실행"><MdRedo size={20} /></button>
        </div>

        {/* 표 삽입 */}
        <div className="gdoc__group">
          <button type="button" className="rte__chip-button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => setIsTablePickerOpen(p => {
                const next = !p
                if (!p) setTablePickerHover(TABLE_PICKER_DEFAULT_SIZE)
                if (!p) editor?.chain().focus().run()
                return next
              })}
            >
              <MdGridOn size={20} />
            </button>
            {isTablePickerOpen && (
              <div className="rte__table-picker-popover" ref={tablePickerPopoverRef}>
                <div className="rte__table-picker-preview">
                  {Math.max(tablePickerHover.rows, 1)} × {Math.max(tablePickerHover.cols, 1)} 표
                </div>
                <div className="rte__table-picker-grid">
                  {Array.from({ length: TABLE_PICKER_MAX_ROWS }).map((_, r) => (
                    <div key={`row-${r}`} className="rte__table-picker-row">
                      {Array.from({ length: TABLE_PICKER_MAX_COLS }).map((__, c) => {
                        const rows = r + 1, cols = c + 1
                        const active = rows <= Math.max(tablePickerHover.rows, 0) && cols <= Math.max(tablePickerHover.cols, 0)
                        return (
                          <button key={`cell-${r}-${c}`} type="button"
                                  className={`rte__table-picker-cell${active ? ' selected' : ''}`}
                                  onMouseEnter={() => setTablePickerHover({ rows, cols })}
                                  onFocus={() => setTablePickerHover({ rows, cols })}
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => {
                                    editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: false }).run()
                                    setIsTablePickerOpen(false)
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
          <button type="button" className="gdoc__download" onClick={() => onDownload?.()} title=".odt 다운로드">
            <MdDownload size={18} /><span>.odt 다운로드</span>
          </button>
        </div>

        {/* ===== 오른쪽 끝: 기존 기능들 Raw Append (UI 깨져도 OK) ===== */}
        {/* <div className="legacy-inline">
          <label className="rte__group-label">텍스트 스타일</label>
          <select className="rte__select rte__select--wide" value={fontKey} onChange={handleFontChange}>
            {FONT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>

          <label className="rte__group-label">글자 크기</label>
          <select className="rte__select" value={fontSize} onChange={handleFontSizeChange}>
            {FONT_SIZE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button type="button" className="rte__chip-button" onClick={handleFontSizeReset}>기본</button>

          <label className="rte__group-label">글자색</label>
          <input type="color" className="rte__color-input" value={fontColor} onChange={handleColorChange} title="글자색 선택" />
          <button type="button" className="rte__chip-button" onClick={handleColorReset}>기본</button>

          <label className="rte__group-label">셀 배경</label>
          <input type="color" className="rte__color-input" value={cellBackground || DEFAULT_CELL_BACKGROUND}
                 onChange={handleCellBackgroundChange} disabled={!isTableSelection} title="표 셀 배경색 선택"/>
          <button type="button" className="rte__chip-button" disabled={!isTableSelection} onClick={handleCellBackgroundReset}>없음</button>

          <div className="rte__table-picker" ref={tablePickerAnchorRef}>
            <button type="button" className="rte__chip-button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => setIsTablePickerOpen(p => {
                const next = !p
                if (!p) setTablePickerHover(TABLE_PICKER_DEFAULT_SIZE)
                if (!p) editor?.chain().focus().run()
                return next
              })}
            >
              표 추가(픽커)
            </button>

          </div>

          <button type="button" className="rte__chip-button" disabled={!isActive('table')} onClick={exec(i => i.chain().focus().deleteTable().run())}>표 삭제</button>
          <button type="button" className="rte__chip-button" disabled={!isActive('table')} onClick={exec(i => i.chain().focus().addColumnBefore().run())}>열 + 좌</button>
          <button type="button" className="rte__chip-button" disabled={!isActive('table')} onClick={exec(i => i.chain().focus().addColumnAfter().run())}>열 + 우</button>
          <button type="button" className="rte__chip-button" disabled={!isActive('table')} onClick={exec(i => i.chain().focus().addRowBefore().run())}>행 + 상</button>
          <button type="button" className="rte__chip-button" disabled={!isActive('table')} onClick={exec(i => i.chain().focus().addRowAfter().run())}>행 + 하</button>
          <button type="button" className="rte__chip-button" disabled={!isActive('table')} onClick={exec(i => i.chain().focus().deleteColumn().run())}>열 삭제</button>
          <button type="button" className="rte__chip-button" disabled={!isActive('table')} onClick={exec(i => i.chain().focus().deleteRow().run())}>행 삭제</button>
        </div> */}
      </div>

      {/* 본문 */}
      <EditorContent editor={editor} className="gdoc__content" />
    </div>
  )
}

/* ===== 기존 유틸 함수들 ===== */
function resolveFontKey(fontFamily: string): FontKey {
  if (!fontFamily) return 'system'
  const normalized = normalizeFontValue(fontFamily)
  const matched = (Object.entries(FONT_FAMILIES) as Array<[FontFamilyKey, string]>)
    .find(([, v]) => normalizeFontValue(v) === normalized)
  return matched ? matched[0] : 'system'
}
function normalizeFontValue(value: string): string {
  return value.replace(/['"]/g, '')
    .split(',').map(p => p.trim().toLowerCase()).filter(Boolean).join(',')
}
function normalizeFontSizeValue(value: string): FontSizeValue {
  const t = value.trim().toLowerCase()
  if (!t) return FONT_SIZE_DEFAULT
  if (FONT_SIZE_PRESET_SET.has(t as FontSizePreset)) return t as FontSizeValue
  const compact = t.replace(/\s+/g, '')
  if (FONT_SIZE_PRESET_SET.has(compact as FontSizePreset)) return compact as FontSizeValue
  return FONT_SIZE_DEFAULT
}
function normalizeOptionalColorValue(value: string): string {
  const t = value.trim().toLowerCase()
  if (!t || t === 'transparent') return ''
  if (/^#[0-9a-f]{3,8}$/.test(t)) {
    if (t.length === 4) { const [r,g,b] = t.slice(1); return `#${r}${r}${g}${g}${b}${b}` }
    if (t.length === 9) return t.slice(0,7)
    return t
  }
  const m = t.match(/^rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})/)
  if (m) {
    const [r,g,b] = m.slice(1,4).map(n => clampColorChannel(Number.parseInt(n,10)))
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }
  return ''
}
function normalizeColorValue(value: string): string {
  const t = value.trim().toLowerCase()
  if (!t) return DEFAULT_COLOR
  if (t.startsWith('#')) {
    if (t.length === 4) { const [r,g,b] = t.slice(1).split(''); return `#${r}${r}${g}${g}${b}${b}` }
    if (t.length === 7) return t
    return DEFAULT_COLOR
  }
  const m = t.match(/^rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})/)
  if (m) {
    const [r,g,b] = m.slice(1,4).map(n => clampColorChannel(Number.parseInt(n,10)))
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }
  return DEFAULT_COLOR
}
function clampColorChannel(value: number) { return Math.min(255, Math.max(0, Number.isNaN(value) ? 0 : value)) }
function toHex(value: number) { return value.toString(16).padStart(2,'0') }
