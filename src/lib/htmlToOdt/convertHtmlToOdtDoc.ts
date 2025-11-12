import type {
  OdtBlock,
  OdtDoc,
  Paragraph,
  Table,
  TextSpan
} from '../odt/types'
import { STYLE_MAP } from '../styleMap'
import { PAGE_BREAK_SELECTOR } from '../pageBreak'

type SpanStyle = Partial<Omit<TextSpan, 'text'>>
type ParagraphAlign = Paragraph['align']
type ParagraphStyleProps = Pick<
  Paragraph,
  'lineHeight' | 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight' | 'textIndent'
>

type ConversionContext = {
  contentWidthPx: number
  pageWidthCm: number
  tableRatios: Array<number | undefined>
  tableColumnRatios: Array<Array<number | undefined>>
  tableCursor: number
}

const PARAGRAPH_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'])

const BLOCK_TAG_SPAN_STYLES: Record<string, SpanStyle> = {
  H1: { bold: true, fontSize: '24pt' },
  H2: { bold: true, fontSize: '20pt' },
  H3: { bold: true, fontSize: '18pt' },
  H4: { bold: true, fontSize: '16pt' }
}

const INLINE_TAG_STYLES: Record<string, SpanStyle> = {
  STRONG: { bold: true },
  B: { bold: true },
  EM: { italic: true },
  I: { italic: true },
  U: { underline: true }
}

export const PAGE_CONTENT_WIDTH_CM = 17
export const DEFAULT_CONTENT_WIDTH_PX = (PAGE_CONTENT_WIDTH_CM / 2.54) * 96

type TableMeasurement = {
  tableRatio?: number
  columnRatios: Array<number | undefined>
}

export function convertHtmlToOdtDoc(
  htmlString: string,
  options: { editorRoot?: HTMLElement | null; contentWidthPx?: number } = {}
): OdtDoc {
  const editorRoot = options.editorRoot ?? null
  const contentWidthPx = options.contentWidthPx ?? DEFAULT_CONTENT_WIDTH_PX
  const pageWidthCm = PAGE_CONTENT_WIDTH_CM

  const tableMeasurements =
    editorRoot && contentWidthPx > 0
      ? Array.from(editorRoot.querySelectorAll('table')).map(table =>
          measureTableLayout(table, contentWidthPx)
        )
      : []

  const tableRatios = tableMeasurements.map(measure => measure?.tableRatio)
  const tableColumnRatios = tableMeasurements.map(measure => measure?.columnRatios ?? [])

  const doc = new DOMParser().parseFromString(htmlString, 'text/html')
  const body = doc.body

  const context: ConversionContext = {
    contentWidthPx,
    pageWidthCm,
    tableRatios,
    tableColumnRatios,
    tableCursor: 0
  }

  const blocks = collectBlocks(body, context)

  return {
    meta: { title: '알림장', creator: 'ODT Demo' },
    styles: { bodyFont: 'Malgun Gothic' },
    body: blocks
  }
}

function measureTableLayout(table: HTMLTableElement, contentWidthPx: number): TableMeasurement {
  const rect = table.getBoundingClientRect()
  const tableRatio =
    rect.width && Number.isFinite(rect.width) && rect.width > 0 ? rect.width / contentWidthPx : undefined

  const rows = Array.from(table.rows)
  let maxColumns = 0
  rows.forEach(row => {
    let count = 0
    Array.from(row.cells).forEach(cell => {
      const span = Math.max(cell.colSpan || 1, 1)
      count += span
    })
    if (count > maxColumns) {
      maxColumns = count
    }
  })

  const columnWidths: Array<number | undefined> = new Array(maxColumns).fill(undefined)

  rows.forEach(row => {
    let columnIndex = 0
    Array.from(row.cells).forEach(cell => {
      const span = Math.max(cell.colSpan || 1, 1)
      const cellRect = cell.getBoundingClientRect()
      const baseWidth =
        cellRect.width && Number.isFinite(cellRect.width) && cellRect.width > 0
          ? cellRect.width / span
          : undefined
      for (let offset = 0; offset < span && columnIndex + offset < maxColumns; offset += 1) {
        if (baseWidth !== undefined) {
          const current = columnWidths[columnIndex + offset]
          if (current === undefined || baseWidth > current) {
            columnWidths[columnIndex + offset] = baseWidth
          }
        }
      }
      columnIndex += span
    })
  })

  const columnRatios = columnWidths.map(width =>
    width && Number.isFinite(width) && width > 0 ? width / contentWidthPx : undefined
  )

  return { tableRatio, columnRatios }
}

function collectBlocks(root: HTMLElement, context: ConversionContext): OdtBlock[] {
  const blocks: OdtBlock[] = []

  Array.from(root.children).forEach(el => {
    if (!(el instanceof HTMLElement)) return
    const tag = el.tagName

    if (el.matches(PAGE_BREAK_SELECTOR)) {
      blocks.push({ type: 'pageBreak' })
      return
    }

    if (tag === 'TABLE') {
      blocks.push({ type: 'table', value: tableElementToTable(el as HTMLTableElement, context) })
      return
    }

    if (tag === 'UL' || tag === 'OL') {
      const ordered = tag === 'OL'
      Array.from(el.children).forEach((child, idx) => {
        if (!(child instanceof HTMLElement) || child.tagName !== 'LI') return
        const paragraph = elementToParagraph(child)
        if (!paragraph) return
        const mark = ordered ? `${idx + 1}. ` : '• '
        if (paragraph.spans[0]) paragraph.spans[0].text = mark + paragraph.spans[0].text
        blocks.push({ type: 'paragraph', value: paragraph })
      })
      return
    }

    if (PARAGRAPH_TAGS.has(tag)) {
      const paragraph = elementToParagraph(el)
      if (paragraph) blocks.push({ type: 'paragraph', value: paragraph })
      return
    }

    blocks.push(...collectBlocks(el, context))
  })

  return blocks
}

function tableElementToTable(tableEl: HTMLTableElement, context: ConversionContext): Table {
  const widthPctAttr = extractTableWidthPercent(tableEl)
  const widthCmAttr = extractTableWidthCm(tableEl)
  const layoutWidth = computeTableWidthFromLayout(tableEl, context)
  const widthPct = widthPctAttr ?? layoutWidth?.widthPct
  const widthCm = widthCmAttr ?? layoutWidth?.widthCm
  const columnWidthsAttr = extractTableColumnWidths(tableEl)
  const layoutColumnWidths = computeColumnWidthsFromLayout(context)
  const columnWidths = mergeColumnWidths(columnWidthsAttr, layoutColumnWidths)

  const rows = Array.from(tableEl.rows).map(row => ({
    cells: Array.from(row.cells).map(cell => {
      const css = collectCssStyles(cell)
      const backgroundCss = css['background-color']
      const backgroundColor = backgroundCss ? normalizeColor(backgroundCss) : undefined

      return {
        paragraphs: elementToParagraphs(cell),
        colSpan: cell.colSpan > 1 ? cell.colSpan : undefined,
        rowSpan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
        backgroundColor
      }
    })
  }))

  return {
    rows,
    widthPct,
    widthCm,
    columnWidths
  }
}

function extractTableWidthPercent(tableEl: HTMLTableElement): number | undefined {
  const widthAttr = tableEl.getAttribute('width')
  const inlineWidth = tableEl.style.width
  const source = inlineWidth || widthAttr
  if (!source) return undefined
  const match = source.match(/([\d.]+)\s*%/)
  if (!match) return undefined
  const value = parseFloat(match[1])
  return Number.isNaN(value) ? undefined : value
}

function extractTableWidthCm(tableEl: HTMLTableElement): string | undefined {
  const inlineWidth = tableEl.style.width
  if (inlineWidth) {
    const normalized = cssLengthToCm(inlineWidth)
    if (normalized) return normalized
  }

  const attrWidth = tableEl.getAttribute('width')
  if (attrWidth) {
    const normalized = cssLengthToCm(attrWidth)
    if (normalized) return normalized
  }

  const cssWidth = collectCssStyles(tableEl)['width']
  if (cssWidth) {
    const normalized = cssLengthToCm(cssWidth)
    if (normalized) return normalized
  }

  return undefined
}

function computeTableWidthFromLayout(
  tableEl: HTMLTableElement,
  context: ConversionContext
): { widthPct: number; widthCm: string } | undefined {
  const ratio = getNextTableRatio(context)
  if (ratio === undefined) return undefined
  const clamped = Math.min(Math.max(ratio, 0.01), 1)
  const widthCmValue = context.pageWidthCm * clamped
  return {
    widthPct: Number((clamped * 100).toFixed(2)),
    widthCm: `${widthCmValue.toFixed(4)}cm`
  }
}

function getNextTableRatio(context: ConversionContext): number | undefined {
  const index = context.tableCursor
  context.tableCursor += 1
  const ratio = context.tableRatios[index]
  if (ratio === undefined) return undefined
  if (!Number.isFinite(ratio) || ratio <= 0) return undefined
  return ratio
}

function computeColumnWidthsFromLayout(context: ConversionContext): Array<string | undefined> {
  const index = context.tableCursor - 1
  if (index < 0) return []
  const columnRatios = context.tableColumnRatios[index] ?? []
  if (!columnRatios.length) return []
  return columnRatios.map(ratio => {
    if (ratio === undefined || !Number.isFinite(ratio) || ratio <= 0) return undefined
    const widthCmValue = context.pageWidthCm * Math.min(Math.max(ratio, 0.001), 1)
    return `${widthCmValue.toFixed(4)}cm`
  })
}

function mergeColumnWidths(
  original: Array<string | undefined> | undefined,
  fallback: Array<string | undefined>
): Array<string | undefined> | undefined {
  const maxLength = Math.max(original?.length ?? 0, fallback.length)
  if (!maxLength) return original ?? fallback ?? undefined
  const merged: Array<string | undefined> = []
  for (let i = 0; i < maxLength; i += 1) {
    merged[i] = original?.[i] ?? fallback[i]
  }
  return merged
}

function extractTableColumnWidths(tableEl: HTMLTableElement): Array<string | undefined> | undefined {
  const widths: Array<string | undefined> = []

  const colgroup = tableEl.querySelector('colgroup')
  if (colgroup) {
    let colIndex = 0
    Array.from(colgroup.children).forEach(node => {
      if (!(node instanceof HTMLTableColElement)) return
      const spanAttr = node.getAttribute('span')
      const span = spanAttr ? parseInt(spanAttr, 10) || 1 : 1
      const styleWidth = node.style.width || ''
      const attrWidth = node.getAttribute('width') || ''
      const normalized = cssLengthToCm(styleWidth || attrWidth)
      for (let i = 0; i < Math.max(span, 1); i += 1) {
        if (normalized) widths[colIndex] = normalized
        colIndex += 1
      }
    })
  }

  Array.from(tableEl.rows).forEach(row => {
    let columnIndex = 0
    Array.from(row.cells).forEach(cell => {
      const colSpan = cell.colSpan > 1 ? cell.colSpan : 1
      const dataColWidth = cell.getAttribute('data-colwidth')
      const candidates = dataColWidth
        ? dataColWidth
            .split(',')
            .map(part => parseFloat(part.trim()))
            .filter(value => Number.isFinite(value) && value > 0)
        : []

      for (let i = 0; i < colSpan; i += 1) {
        const widthPx = candidates[i] ?? candidates[0]
        if (widthPx && !widths[columnIndex]) {
          const widthCm = pxToCm(widthPx)
          if (widthCm) widths[columnIndex] = widthCm
        }

        if (!widths[columnIndex]) {
          const inlineWidth = cell.style.width
          const normalized = inlineWidth ? cssLengthToCm(inlineWidth) : undefined
          if (normalized) {
            widths[columnIndex] = normalized
          }
        }
        if (!widths[columnIndex]) {
          const attrWidth = cell.getAttribute('width')
          const normalizedAttr = attrWidth ? cssLengthToCm(attrWidth) : undefined
          if (normalizedAttr) widths[columnIndex] = normalizedAttr
        }

        columnIndex += 1
      }
    })
  })

  return widths.some(Boolean) ? widths : undefined
}

function elementToParagraphs(el: HTMLElement): Paragraph[] {
  const blockChildren = Array.from(el.children).filter(
    child => child instanceof HTMLElement && PARAGRAPH_TAGS.has(child.tagName)
  ) as HTMLElement[]

  if (blockChildren.length > 0) {
    return blockChildren
      .map(child => elementToParagraph(child))
      .filter((paragraph): paragraph is Paragraph => paragraph !== null)
  }

  const paragraph = elementToParagraph(el)
  return paragraph ? [paragraph] : []
}

function elementToParagraph(el: HTMLElement): Paragraph | null {
  const { span: elementSpanStyle, align, paragraph: paragraphStyles } = getElementStyles(el)
  const baseStyle = mergeSpanStyles({}, elementSpanStyle)
  const spans = mergeAdjacentSpans(flattenChildNodes(Array.from(el.childNodes) as ChildNode[], baseStyle))

  if (!spans.length) {
    if (el.tagName === 'P') {
      const paragraph: Paragraph = { spans: [], align }
      applyParagraphLayout(paragraph, paragraphStyles)
      return paragraph
    }
    return null
  }
  const paragraph: Paragraph = { spans, align }
  applyParagraphLayout(paragraph, paragraphStyles)
  return paragraph
}

function flattenChildNodes(nodes: ChildNode[], inheritedStyle: SpanStyle): TextSpan[] {
  const spans: TextSpan[] = []
  nodes.forEach(node => {
    spans.push(...nodeToSpans(node, inheritedStyle))
  })
  return spans
}

function nodeToSpans(node: ChildNode, inheritedStyle: SpanStyle): TextSpan[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    if (!text) return []
    return [{ ...inheritedStyle, text }]
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement
    if (el.tagName === 'BR') {
      return [{ ...inheritedStyle, text: '\n' }]
    }

    const { span: elementStyle } = getElementStyles(el)
    const combinedStyle = mergeSpanStyles(inheritedStyle, elementStyle)
    const childNodes = Array.from(el.childNodes) as ChildNode[]
    if (!childNodes.length) return []
    return flattenChildNodes(childNodes, combinedStyle)
  }

  return []
}

function getElementStyles(
  el: HTMLElement
): { span: SpanStyle; align?: ParagraphAlign; paragraph: ParagraphStyleProps } {
  const blockStyle = BLOCK_TAG_SPAN_STYLES[el.tagName] ?? {}
  const tagStyle = INLINE_TAG_STYLES[el.tagName] ?? {}
  const cssStyles = collectCssStyles(el)
  const { span: cssSpan, align, paragraph } = cssToStyles(cssStyles)
  const span = mergeSpanStyles({}, blockStyle, tagStyle, cssSpan)
  return { span, align, paragraph }
}

function collectCssStyles(el: HTMLElement): Record<string, string> {
  const styles: Record<string, string> = {}

  el.classList.forEach(cls => {
    const entry = (STYLE_MAP as Record<string, Record<string, string>>)[cls]
    if (!entry) return
    Object.entries(entry).forEach(([key, value]) => {
      styles[toCssPropName(key)] = String(value)
    })
  })

  const inlineStyle = el.getAttribute('style')
  if (inlineStyle) {
    inlineStyle
      .split(';')
      .map(rule => rule.trim())
      .filter(Boolean)
      .forEach(rule => {
        const colonIndex = rule.indexOf(':')
        if (colonIndex === -1) return
        const property = rule.slice(0, colonIndex).trim().toLowerCase()
        const value = rule.slice(colonIndex + 1).trim()
        if (!property || !value) return
        styles[property] = value
      })
  }

  return styles
}

function cssToStyles(
  css: Record<string, string>
): { span: SpanStyle; align?: ParagraphAlign; paragraph: ParagraphStyleProps } {
  const span: SpanStyle = {}
  let align: ParagraphAlign | undefined
  const paragraph: ParagraphStyleProps = {}

  const fontWeight = css['font-weight']
  if (fontWeight) {
    const weight = fontWeight.toLowerCase()
    if (weight.includes('bold')) span.bold = true
    const numericWeight = parseInt(weight, 10)
    if (!Number.isNaN(numericWeight) && numericWeight >= 600) span.bold = true
  }

  const fontStyle = css['font-style']
  if (fontStyle && fontStyle.toLowerCase().includes('italic')) {
    span.italic = true
  }

  const textDecoration = css['text-decoration']
  if (textDecoration && textDecoration.toLowerCase().includes('underline')) {
    span.underline = true
  }

  const color = css['color']
  if (color) span.color = normalizeColor(color)

  const fontSize = css['font-size']
  if (fontSize) {
    const pt = cssFontSizeToPt(fontSize)
    if (pt) span.fontSize = pt
  }

  const textAlign = css['text-align']
  if (textAlign) {
    const normalized = textAlign.toLowerCase()
    if (normalized === 'center') align = 'center'
    else if (normalized === 'right' || normalized === 'end') align = 'end'
    else if (normalized === 'justify') align = 'justify'
    else if (normalized === 'left' || normalized === 'start') align = 'start'
  }

  const lineHeightRaw = css['line-height']
  const lineHeight = lineHeightRaw ? normalizeLineHeight(lineHeightRaw) : undefined
  if (lineHeight) paragraph.lineHeight = lineHeight

  const marginTop = css['margin-top']
  if (marginTop) {
    const normalized = cssLengthToCm(marginTop)
    if (normalized) paragraph.marginTop = normalized
  }

  const marginBottom = css['margin-bottom']
  if (marginBottom) {
    const normalized = cssLengthToCm(marginBottom)
    if (normalized) paragraph.marginBottom = normalized
  }

  const marginLeft = css['margin-left']
  if (marginLeft) {
    const normalized = cssLengthToCm(marginLeft)
    if (normalized) paragraph.marginLeft = normalized
  }

  const marginRight = css['margin-right']
  if (marginRight) {
    const normalized = cssLengthToCm(marginRight)
    if (normalized) paragraph.marginRight = normalized
  }

  const textIndent = css['text-indent']
  if (textIndent) {
    const normalized = cssLengthToCm(textIndent)
    if (normalized) paragraph.textIndent = normalized
  }

  return { span, align, paragraph }
}

function mergeSpanStyles(base: SpanStyle = {}, ...others: SpanStyle[]): SpanStyle {
  return others.reduce<SpanStyle>((acc, style) => {
    if (style.bold !== undefined) acc.bold = style.bold
    if (style.italic !== undefined) acc.italic = style.italic
    if (style.underline !== undefined) acc.underline = style.underline
    if (style.color !== undefined) acc.color = style.color
    if (style.fontSize !== undefined) acc.fontSize = style.fontSize
    return acc
  }, { ...base })
}

function applyParagraphLayout(target: Paragraph, styles: ParagraphStyleProps) {
  if (styles.lineHeight) target.lineHeight = styles.lineHeight
  if (styles.marginTop) target.marginTop = styles.marginTop
  if (styles.marginBottom) target.marginBottom = styles.marginBottom
  if (styles.marginLeft) target.marginLeft = styles.marginLeft
  if (styles.marginRight) target.marginRight = styles.marginRight
  if (styles.textIndent) target.textIndent = styles.textIndent
}

function mergeAdjacentSpans(spans: TextSpan[]): TextSpan[] {
  const merged: TextSpan[] = []

  spans.forEach(span => {
    if (!span.text) return
    const last = merged[merged.length - 1]
    if (last && sameSpanStyle(last, span)) {
      last.text += span.text
    } else {
      merged.push({ ...span })
    }
  })

  return merged
}

function sameSpanStyle(a: TextSpan, b: TextSpan): boolean {
  return (
    (a.bold ?? false) === (b.bold ?? false) &&
    (a.italic ?? false) === (b.italic ?? false) &&
    (a.underline ?? false) === (b.underline ?? false) &&
    (a.color ?? '') === (b.color ?? '') &&
    (a.fontSize ?? '') === (b.fontSize ?? '')
  )
}

function toCssPropName(key: string): string {
  return key.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`).toLowerCase()
}

function cssFontSizeToPt(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase()

  if (!trimmed) return undefined

  if (trimmed.endsWith('px')) {
    const px = parseFloat(trimmed.slice(0, -2))
    if (!Number.isNaN(px)) return formatPt(px * 0.75)
  } else if (trimmed.endsWith('pt')) {
    const pt = parseFloat(trimmed.slice(0, -2))
    if (!Number.isNaN(pt)) return formatPt(pt)
  } else {
    const numeric = parseFloat(trimmed)
    if (!Number.isNaN(numeric)) return formatPt(numeric * 0.75)
  }

  return undefined
}

function formatPt(value: number): string {
  const normalized = Number(value.toFixed(2))
  const text = Number.isInteger(normalized) ? normalized.toFixed(0) : normalized.toString()
  return `${text}pt`
}

function formatPercent(value: number): string {
  const clamped = Math.max(0, Math.min(value, 1000))
  const normalized = Number(clamped.toFixed(2))
  const text = Number.isInteger(normalized) ? normalized.toFixed(0) : normalized.toString()
  return `${text}%`
}

function normalizeLineHeight(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const lowered = trimmed.toLowerCase()
  if (lowered === 'normal' || lowered === 'inherit' || lowered === 'initial') {
    return undefined
  }

  if (lowered.endsWith('%')) {
    const numeric = parseFloat(lowered.slice(0, -1))
    if (!Number.isNaN(numeric) && numeric > 0) {
      return formatPercent(numeric)
    }
    return undefined
  }

  if (lowered.endsWith('px')) {
    const numeric = parseFloat(lowered.slice(0, -2))
    if (!Number.isNaN(numeric) && numeric > 0) {
      return formatPt(numeric * 0.75)
    }
    return undefined
  }

  if (lowered.endsWith('pt')) {
    const numeric = parseFloat(lowered.slice(0, -2))
    if (!Number.isNaN(numeric) && numeric > 0) {
      return formatPt(numeric)
    }
    return undefined
  }

  if (lowered.endsWith('em') || lowered.endsWith('rem')) {
    const numeric = parseFloat(lowered.slice(0, -2))
    if (!Number.isNaN(numeric) && numeric > 0) {
      return formatPercent(numeric * 100)
    }
    return undefined
  }

  const absolute = cssLengthToCm(trimmed)
  if (absolute) {
    return absolute
  }

  if (/^[\d.]+$/.test(lowered)) {
    const numeric = parseFloat(lowered)
    if (!Number.isNaN(numeric) && numeric > 0) {
      return formatPercent(numeric * 100)
    }
  }

  return undefined
}

function normalizeColor(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) {
    if (trimmed.length === 4) {
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`
    }
    if (trimmed.length === 7) return trimmed
    if (trimmed.length === 9) return trimmed.slice(0, 7)
    return trimmed
  }

  const rgbMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i)
  if (rgbMatch) {
    const parts = rgbMatch[1]
      .split(',')
      .map(part => part.trim())
      .map((part, index) => {
        if (index === 3) return part
        if (part.endsWith('%')) {
          const percent = parseFloat(part)
          if (Number.isNaN(percent)) return 0
          return Math.round((percent / 100) * 255)
        }
        const num = parseFloat(part)
        if (Number.isNaN(num)) return 0
        return Math.round(num)
      })

    const [r, g, b] = parts
    const toHex = (component: number) => {
      const clamped = Math.max(0, Math.min(255, component))
      return clamped.toString(16).padStart(2, '0')
    }
    if (typeof r === 'number' && typeof g === 'number' && typeof b === 'number') {
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`
    }
  }

  return trimmed
}

function pxToCm(value: number): string | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined
  const cm = (value / 96) * 2.54
  if (!Number.isFinite(cm) || cm <= 0) return undefined
  return `${cm.toFixed(4)}cm`
}

function cssLengthToCm(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return undefined

  if (trimmed.endsWith('cm')) {
    const numeric = parseFloat(trimmed.slice(0, -2))
    if (!Number.isFinite(numeric) || numeric <= 0) return undefined
    return `${numeric.toFixed(4)}cm`
  }

  if (trimmed.endsWith('mm')) {
    const numeric = parseFloat(trimmed.slice(0, -2))
    if (!Number.isFinite(numeric) || numeric <= 0) return undefined
    const cmValue = numeric / 10
    return `${cmValue.toFixed(4)}cm`
  }

  if (trimmed.endsWith('in')) {
    const numeric = parseFloat(trimmed.slice(0, -2))
    if (!Number.isFinite(numeric) || numeric <= 0) return undefined
    const cmValue = numeric * 2.54
    return `${cmValue.toFixed(4)}cm`
  }

  if (trimmed.endsWith('pt')) {
    const numeric = parseFloat(trimmed.slice(0, -2))
    if (!Number.isFinite(numeric) || numeric <= 0) return undefined
    const inches = numeric / 72
    const cmValue = inches * 2.54
    return `${cmValue.toFixed(4)}cm`
  }

  if (trimmed.endsWith('px')) {
    const numeric = parseFloat(trimmed.slice(0, -2))
    if (!Number.isFinite(numeric) || numeric <= 0) return undefined
    return pxToCm(numeric)
  }

  const numeric = parseFloat(trimmed)
  if (!Number.isNaN(numeric) && numeric > 0) {
    return pxToCm(numeric)
  }

  return undefined
}

