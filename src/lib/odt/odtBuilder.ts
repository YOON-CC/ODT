//------------------------------------------------------
// odtBuilder.ts (FULL VERSION)
//------------------------------------------------------

import { OdtDoc, OdtBlock, Paragraph, Table, TextSpan } from './types'
import { escapeXml, odfDocumentContent } from './odtTemplates'
import { FONT_FAMILY_MAP } from '../styleMap'

type ParagraphStyleProps = {
  align?: Paragraph['align']
  lineHeight?: string
  marginTop?: string
  marginBottom?: string
  marginLeft?: string
  marginRight?: string
  textIndent?: string
}

export function buildContentXml(doc: OdtDoc): string {
  const styles = new StyleRegistry()
  const inner = doc.body.map(block => renderBlock(block, styles)).join('\n')
  return odfDocumentContent(inner, styles.renderAutomaticStyles())
}

/* -------------------------------------------------------
 ✅ Block Renderer
--------------------------------------------------------*/
function renderBlock(b: OdtBlock, styles: StyleRegistry): string {
  if (b.type === 'paragraph') return renderParagraph(b.value, styles)
  if (b.type === 'table') return renderTable(b.value, styles)
  return ''
}

/* -------------------------------------------------------
 ✅ mergeSpanProps: attributes 기반 자동 머지
--------------------------------------------------------*/
function mergeSpanProps(span: TextSpan): TextSpan {
  const a = (span as any).attributes || {};

  return {
    ...span,
    bold: span.bold ?? (a["fo:font-weight"] === "bold"),
    italic: span.italic ?? (a["fo:font-style"] === "italic"),
    underline:
      span.underline ??
      (a["style:text-underline-style"] &&
        a["style:text-underline-style"] !== "none"),

    fontSize: span.fontSize ?? a["fo:font-size"],
    color: span.color ?? a["fo:color"],
    fontFamily: span.fontFamily ?? a["style:font-name"],
  };
}

/* -------------------------------------------------------
 ✅ Paragraph Renderer
--------------------------------------------------------*/
function renderParagraph(p: Paragraph, styles: StyleRegistry): string {
  const styleName = styles.getParagraphStyle(p)
  const styleAttr = styleName ? ` text:style-name="${styleName}"` : ''

  if (!p.spans.length) {
    return `<text:p${styleAttr}/>`
  }

  const fragments: string[] = []

  p.spans.forEach(span => {
    // ⭐ attributes + props 통합
    const merged = mergeSpanProps(span)

    let familyStyle = undefined
    if (merged.fontFamily) {
      familyStyle = FONT_FAMILY_MAP[merged.fontFamily]
    }

    const styleName =
      familyStyle ?? styles.getSpanStyle(merged)

    const spanAttr = styleName ? ` text:style-name="${styleName}"` : ''

    const tokens = merged.text.split(/(\n)/)
    tokens.forEach(token => {
      if (token === '\n') {
        fragments.push('<text:line-break/>')
        return
      }
      if (!token) return
      fragments.push(`<text:span${spanAttr}>${escapeXml(token)}</text:span>`)
    })
  })

  return `<text:p${styleAttr}>${fragments.join('')}</text:p>`
}

/* -------------------------------------------------------
 ✅ Table Renderer
--------------------------------------------------------*/
function renderTable(t: Table, styles: StyleRegistry): string {
  const colsCount = t.rows.length ? Math.max(...t.rows.map(r => r.cells.length)) : 0

  const tableStyle = styles.getTableStyle(
    t.widthPct,
    t.columnWidths,
    t.widthCm
  )

  const cols = Array.from({ length: colsCount })
    .map((_, index) => {
      const styleName = styles.getTableColumnStyle(t.columnWidths?.[index])
      const attr =
        styleName
          ? ` table:style-name="${styleName}"`
          : ` table:style-name="TableColumn"`
      return `<table:table-column${attr}/>`
    })
    .join('')

  const rows = t.rows
    .map(r => {
      const cells = r.cells
        .map(c => {
          const ps = c.paragraphs
            .map(p => renderParagraph(p, styles))
            .join('')

          const spanAttr = [
            c.colSpan ? ` table:number-columns-spanned="${c.colSpan}"` : '',
            c.rowSpan ? ` table:number-rows-spanned="${c.rowSpan}"` : ''
          ].join('')

          const cellStyle = styles.getTableCellStyle(c.backgroundColor) ?? 'TableCell'

          return `<table:table-cell table:style-name="${cellStyle}"${spanAttr}>${ps || '<text:p/>'}</table:table-cell>`
        })
        .join('')

      return `<table:table-row table:style-name="TableRow">${cells}</table:table-row>`
    })
    .join('')

  const tableStyleName = tableStyle ?? 'Table'

  return `<table:table table:style-name="${tableStyleName}">${cols}${rows}</table:table>`
}

/* -------------------------------------------------------
 ✅ StyleRegistry (FULL)
--------------------------------------------------------*/
class StyleRegistry {
  private spanStyles = new Map<string, { name: string; span: TextSpan }>()
  private tableColumnStyles = new Map<string, string>()
  private tableStyles = new Map<
    string,
    { name: string; widthAttr?: string; relWidthAttr?: string }
  >()
  private paragraphStyles = new Map<
    string,
    { name: string; props: ParagraphStyleProps }
  >()
  private tableCellStyles = new Map<
    string,
    { name: string; backgroundColor: string }
  >()

  /* ✅ span 스타일 생성 */
  getSpanStyle(span: TextSpan): string | undefined {
    if (span.fontFamily) return undefined

    const hasFormatting =
      span.bold ||
      span.italic ||
      span.underline ||
      span.color ||
      span.fontSize

    if (!hasFormatting) return undefined

    const key = this.keyForSpan(span)
    const exist = this.spanStyles.get(key)
    if (exist) return exist.name

    const name = `T${this.spanStyles.size + 1}`
    this.spanStyles.set(key, { name, span: { ...span } })
    return name
  }

  private keyForSpan(span: TextSpan): string {
    return [
      span.fontFamily ? `ff:${span.fontFamily}` : 'ff:',
      span.bold ? 'b1' : 'b0',
      span.italic ? 'i1' : 'i0',
      span.underline ? 'u1' : 'u0',
      span.color ? `c:${span.color}` : 'c:',
      span.fontSize ? `f:${span.fontSize}` : 'f:'
    ].join('|')
  }

  /* ✅ Paragraph Style */
  getParagraphStyle(p: Paragraph): string | undefined {
    const props: ParagraphStyleProps = {}

    if (p.align && p.align !== 'start') props.align = p.align
    if (p.lineHeight) props.lineHeight = p.lineHeight
    if (p.marginTop) props.marginTop = p.marginTop
    if (p.marginBottom) props.marginBottom = p.marginBottom
    if (p.marginLeft) props.marginLeft = p.marginLeft
    if (p.marginRight) props.marginRight = p.marginRight
    if (p.textIndent) props.textIndent = p.textIndent

    const hasProps = Object.values(props).some(v => v)
    if (!hasProps) return undefined

    const key = JSON.stringify(props)
    const exist = this.paragraphStyles.get(key)
    if (exist) return exist.name

    const name = `PStyle${this.paragraphStyles.size + 1}`
    this.paragraphStyles.set(key, { name, props })
    return name
  }

  /* ✅ Table Column Style */
  getTableColumnStyle(width?: string) {
    const w = width?.trim()
    if (!w) return undefined

    const exist = this.tableColumnStyles.get(w)
    if (exist) return exist

    const styleName = `TableColumnCustom${this.tableColumnStyles.size + 1}`
    this.tableColumnStyles.set(w, styleName)
    return styleName
  }

  /* ✅ Table Style */
  getTableStyle(widthPct?: number, widths?: (string | undefined)[], explicitWidthCm?: string) {
    const absolute = explicitWidthCm ?? this.computeAbsoluteWidth(widths)

    let key: string | undefined
    let widthAttr: string | undefined
    let rel: string | undefined

    if (absolute) {
      widthAttr = absolute
      key = `abs:${absolute}`
    } else if (widthPct) {
      const clamped = Math.max(1, Math.min(widthPct, 1000))
      rel = `${clamped.toFixed(2)}%`
      key = `rel:${rel}`
    } else {
      widthAttr = '17cm'
      key = 'abs:17cm'
    }

    const exist = key ? this.tableStyles.get(key) : undefined
    if (exist) return exist.name

    const name = `TableCustom${this.tableStyles.size + 1}`
    this.tableStyles.set(key!, { name, widthAttr, relWidthAttr: rel })
    return name
  }

  /* ✅ TableCell Style */
  getTableCellStyle(bg?: string): string | undefined {
    const b = bg?.trim()
    if (!b) return undefined

    const exist = this.tableCellStyles.get(b)
    if (exist) return exist.name

    const name = `TableCellCustom${this.tableCellStyles.size + 1}`
    this.tableCellStyles.set(b, { name, backgroundColor: b })
    return name
  }

  /* -------------------------------------------------------
   ✅ Automatic Styles Renderer (FULL)
  --------------------------------------------------------*/
  renderAutomaticStyles(): string {
    const base = `
    <style:style style:name="P" style:family="paragraph">
      <style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.42cm" fo:line-height="160%"/>
      <style:text-properties style:font-name="BodyFont" fo:font-size="12pt"/>
    </style:style>

    <style:style style:name="T" style:family="text">
      <style:text-properties style:font-name="BodyFont" fo:font-size="12pt"/>
    </style:style>

    <style:style style:name="Table" style:family="table">
      <style:table-properties table:align="left" table:border-model="collapsing"/>
    </style:style>

    <style:style style:name="TableColumn" style:family="table-column">
      <style:table-column-properties/>
    </style:style>

    <style:style style:name="TableRow" style:family="table-row">
      <style:table-row-properties/>
    </style:style>

    <style:style style:name="TableCell" style:family="table-cell">
      <style:table-cell-properties fo:border="0.75pt solid #c5ccd6" fo:padding="0.20cm"/>
    </style:style>`

    const table = Array.from(this.tableStyles.values())
      .map(s => {
        const props: string[] = [
          'table:align="left"',
          'table:border-model="collapsing"',
        ]
        if (s.widthAttr) props.push(`style:width="${s.widthAttr}"`)
        if (s.relWidthAttr) props.push(`style:rel-width="${s.relWidthAttr}"`)

        return `
      <style:style style:name="${s.name}" style:family="table">
        <style:table-properties ${props.join(' ')}/>
      </style:style>`
      })
      .join('')

    const col = Array.from(this.tableColumnStyles.entries())
      .map(([w, name]) => `
      <style:style style:name="${name}" style:family="table-column">
        <style:table-column-properties style:column-width="${w}"/>
      </style:style>`)
      .join('')

    const cell = Array.from(this.tableCellStyles.values())
      .map(c => `
      <style:style style:name="${c.name}" style:family="table-cell">
        <style:table-cell-properties fo:border="0.75pt solid #c5ccd6" fo:padding="0.20cm" fo:background-color="${c.backgroundColor}"/>
      </style:style>`)
      .join('')

    const span = Array.from(this.spanStyles.values())
      .map(s => {
        const p: string[] = ['style:font-name="BodyFont"']
        if (s.span.bold) p.push(`fo:font-weight="bold"`)
        if (s.span.italic) p.push(`fo:font-style="italic"`)
        if (s.span.underline) {
          p.push(`style:text-underline-style="solid"`)
          p.push(`style:text-underline-type="single"`)
        }
        if (s.span.color) p.push(`fo:color="${s.span.color}"`)
        if (s.span.fontSize) p.push(`fo:font-size="${s.span.fontSize}"`)

        return `
      <style:style style:name="${s.name}" style:family="text">
        <style:text-properties ${p.join(' ')} />
      </style:style>`
      })
      .join('')

    const para = Array.from(this.paragraphStyles.values())
      .map(s => {
        const p: string[] = []
        const props = s.props
        if (props.align) p.push(`fo:text-align="${props.align}"`)
        if (props.lineHeight) p.push(`fo:line-height="${props.lineHeight}"`)
        if (props.marginTop) p.push(`fo:margin-top="${props.marginTop}"`)
        if (props.marginBottom) p.push(`fo:margin-bottom="${props.marginBottom}"`)
        if (props.marginLeft) p.push(`fo:margin-left="${props.marginLeft}"`)
        if (props.marginRight) p.push(`fo:margin-right="${props.marginRight}"`)
        if (props.textIndent) p.push(`fo:text-indent="${props.textIndent}"`)
        return `
      <style:style style:name="${s.name}" style:family="paragraph">
        <style:paragraph-properties ${p.join(' ')}/>
      </style:style>`
      })
      .join('')

    return `${base}${table}${col}${cell}${para}${span}`
  }

  /* -------------------------------------------------------
   ✅ Utility
  --------------------------------------------------------*/
  private computeAbsoluteWidth(widths?: (string | undefined)[]): string | undefined {
    if (!widths?.length) return undefined
    const nums = widths.map(w => this.lengthStringToCm(w)).filter((n): n is number => n !== undefined)
    if (!nums.length) return undefined
    const total = nums.reduce((a, b) => a + b, 0)
    return `${total.toFixed(4)}cm`
  }

  private lengthStringToCm(v?: string): number | undefined {
    if (!v) return undefined
    const m = v.match(/^([\d.]+)\s*cm$/i)
    if (!m) return undefined
    const n = parseFloat(m[1])
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
}

