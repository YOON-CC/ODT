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

function renderBlock(b: OdtBlock, styles: StyleRegistry): string {
  if (b.type === 'paragraph') return renderParagraph(b.value, styles)
  if (b.type === 'table') return renderTable(b.value, styles)
  return ''
}

function renderParagraph(p: Paragraph, styles: StyleRegistry): string {
  const styleName = styles.getParagraphStyle(p)
  const styleAttr = styleName ? ` text:style-name="${styleName}"` : ''

  if (!p.spans.length) {
    return `<text:p${styleAttr}/>`
  }

  const fragments: string[] = []

  p.spans.forEach(span => {

    // ✅✅ ✅ fontFamily 처리: T_Gungsuh, T_Serif 등 지정 스타일이 있으면 직접 적용
    const familyStyle = span.fontFamily ? FONT_FAMILY_MAP[span.fontFamily] : undefined
    const spanStyleName =
      familyStyle ?? styles.getSpanStyle(span) // <── fontFamily 우선 적용됨

    const spanAttr = spanStyleName ? ` text:style-name="${spanStyleName}"` : ''

    // ✅ 그대로 기존 줄바꿈 처리 유지
    const tokens = span.text.split(/(\n)/)

    tokens.forEach(token => {
      if (token === '\n') {
        fragments.push('<text:line-break/>')
        return
      }

      if (token === '') return

      const escaped = escapeXml(token)
      fragments.push(`<text:span${spanAttr}>${escaped}</text:span>`)
    })
  })

  const spans = fragments.join('')
  return `<text:p${styleAttr}>${spans}</text:p>`
}

function renderTable(t: Table, styles: StyleRegistry): string {
  const colsCount = t.rows.length ? Math.max(...t.rows.map(r => r.cells.length)) : 0
  const tableStyle = styles.getTableStyle(t.widthPct, t.columnWidths, t.widthCm)

  const cols = Array.from({ length: colsCount })
    .map((_, index) => {
      const styleName = styles.getTableColumnStyle(t.columnWidths?.[index])
      const attr = styleName ? ` table:style-name="${styleName}"` : ' table:style-name="TableColumn"'
      return `<table:table-column${attr}/>`
    })
    .join('')

  const rows = t.rows
    .map(r => {
      const cells = r.cells
        .map(c => {
          const ps = c.paragraphs.map(paragraph => renderParagraph(paragraph, styles)).join('')

          const spanAttrs = [
            c.colSpan ? ` table:number-columns-spanned="${c.colSpan}"` : '',
            c.rowSpan ? ` table:number-rows-spanned="${c.rowSpan}"` : ''
          ].join('')

          const cellStyle = styles.getTableCellStyle(c.backgroundColor) ?? 'TableCell'

          return `<table:table-cell table:style-name="${cellStyle}"${spanAttrs}>${ps || '<text:p/>'}</table:table-cell>`
        })
        .join('')

      return `<table:table-row table:style-name="TableRow">${cells}</table:table-row>`
    })
    .join('')

  const tableStyleName = tableStyle ?? 'Table'
  return `<table:table table:style-name="${tableStyleName}">${cols}${rows}</table:table>`
}

class StyleRegistry {
  private spanStyles = new Map<string, { name: string; span: TextSpan }>()
  private tableColumnStyles = new Map<string, string>()
  private tableStyles = new Map<
    string,
    {
      name: string
      widthAttr?: string
      relWidthAttr?: string
    }
  >()
  private paragraphStyles = new Map<string, { name: string; props: ParagraphStyleProps }>()
  private tableCellStyles = new Map<string, { name: string; backgroundColor: string }>()

  getSpanStyle(span: TextSpan): string | undefined {

    // ✅ fontFamily가 있으면 spanStyle 생성 스킵 (T_Gungsuh 직접 사용)
    if (span.fontFamily) return undefined

    const hasFormatting =
      !!span.bold || !!span.italic || !!span.underline || !!span.color || !!span.fontSize

    if (!hasFormatting) return undefined

    const key = this.keyForSpan(span)
    const existing = this.spanStyles.get(key)
    if (existing) return existing.name

    const name = `T${this.spanStyles.size + 1}`
    this.spanStyles.set(key, { name, span: { ...span } })
    return name
  }

  // ✅ 나머지 table/paragraph style 코드 그대로 유지

  getTableColumnStyle(width?: string): string | undefined {
    const normalized = width?.trim()
    if (!normalized) return undefined

    const existing = this.tableColumnStyles.get(normalized)
    if (existing) return existing

    const styleName = `TableColumnCustom${this.tableColumnStyles.size + 1}`
    this.tableColumnStyles.set(normalized, styleName)
    return styleName
  }

  getTableStyle(
    widthPct?: number,
    columnWidths?: Array<string | undefined>,
    explicitWidthCm?: string
  ): string | undefined {
    const absoluteWidthCm = explicitWidthCm ?? this.computeAbsoluteWidth(columnWidths)

    let key: string | undefined
    let widthAttr: string | undefined
    let relWidthAttr: string | undefined

    if (absoluteWidthCm) {
      widthAttr = absoluteWidthCm
      key = `abs:${widthAttr}`
    } else if (widthPct && Number.isFinite(widthPct) && widthPct > 0) {
      const clamped = Math.max(1, Math.min(widthPct, 1000))
      const widthStr = Number(clamped.toFixed(2)).toString()
      relWidthAttr = `${widthStr}%`
      key = `rel:${relWidthAttr}`
    } else {
      return undefined
    }

    const cached = key ? this.tableStyles.get(key) : undefined
    if (cached) return cached.name

    const styleName = `TableCustom${this.tableStyles.size + 1}`
    if (key) {
      this.tableStyles.set(key, { name: styleName, widthAttr, relWidthAttr })
    }
    return styleName
  }

  getTableCellStyle(backgroundColor?: string): string | undefined {
    const normalized = backgroundColor?.trim()
    if (!normalized) return undefined

    const key = normalized.toLowerCase()
    const existing = this.tableCellStyles.get(key)
    if (existing) return existing.name

    const styleName = `TableCellCustom${this.tableCellStyles.size + 1}`
    this.tableCellStyles.set(key, { name: styleName, backgroundColor: normalized })
    return styleName
  }

  getParagraphStyle(paragraph: Paragraph): string | undefined {
    const props: ParagraphStyleProps = {}

    if (paragraph.align && paragraph.align !== 'start') {
      props.align = paragraph.align
    }
    if (paragraph.lineHeight) props.lineHeight = paragraph.lineHeight
    if (paragraph.marginTop) props.marginTop = paragraph.marginTop
    if (paragraph.marginBottom) props.marginBottom = paragraph.marginBottom
    if (paragraph.marginLeft) props.marginLeft = paragraph.marginLeft
    if (paragraph.marginRight) props.marginRight = paragraph.marginRight
    if (paragraph.textIndent) props.textIndent = paragraph.textIndent

    const hasProps = Object.values(props).some(value => value !== undefined && value !== '')
    if (!hasProps) return undefined

    const key = JSON.stringify(props)
    const existing = this.paragraphStyles.get(key)
    if (existing) return existing.name

    const styleName = `PStyle${this.paragraphStyles.size + 1}`
    this.paragraphStyles.set(key, { name: styleName, props })
    return styleName
  }

  renderAutomaticStyles(): string {

    const baseStyles = `
    <style:style style:name="P" style:family="paragraph">
      <style:paragraph-properties fo:margin-top="0.2cm" fo:margin-bottom="0.2cm" fo:line-height="140%"/>
      <style:text-properties style:font-name="BodyFont" fo:font-size="12pt"/>
    </style:style>

    <style:style style:name="T" style:family="text">
      <style:text-properties style:font-name="BodyFont" fo:font-size="12pt"/>
    </style:style>

    <style:style style:name="Table" style:family="table">
      <style:table-properties table:align="left" table:border-model="collapsing" style:may-break-between-rows="false" fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm"/>
    </style:style>

    <style:style style:name="TableColumn" style:family="table-column">
      <style:table-column-properties/>
    </style:style>

    <style:style style:name="TableRow" style:family="table-row">
      <style:table-row-properties/>
    </style:style>

    <style:style style:name="TableCell" style:family="table-cell">
      <style:table-cell-properties fo:border="0.5pt solid #444444" fo:padding="0.05cm"/>
    </style:style>`
    
    const tableStyles = Array.from(this.tableStyles.values())
      .map(({ name, widthAttr, relWidthAttr }) => {
        const attrs = [
          'fo:margin-top="0cm"',
          'fo:margin-bottom="0cm"',
          'fo:margin-left="0cm"',
          'fo:margin-right="0cm"',
          'style:may-break-between-rows="false"',
          'table:align="left"',
          'table:border-model="collapsing"'
        ]
        if (widthAttr) attrs.push(`style:width="${widthAttr}"`)
        if (relWidthAttr) attrs.push(`style:rel-width="${relWidthAttr}"`)
        const attrText = attrs.join(' ')
        return `
    <style:style style:name="${name}" style:family="table">
      <style:table-properties ${attrText}/>
    </style:style>`
      })
      .join('')

    const paragraphStyles = Array.from(this.paragraphStyles.values())
      .map(({ name, props }) => {
        const attrs: string[] = []
        if (props.align) {
          const alignValue = props.align === 'end' ? 'end' : props.align
          attrs.push(`fo:text-align="${alignValue}"`)
        }
        if (props.lineHeight) attrs.push(`fo:line-height="${props.lineHeight}"`)
        if (props.marginTop) attrs.push(`fo:margin-top="${props.marginTop}"`)
        if (props.marginBottom) attrs.push(`fo:margin-bottom="${props.marginBottom}"`)
        if (props.marginLeft) attrs.push(`fo:margin-left="${props.marginLeft}"`)
        if (props.marginRight) attrs.push(`fo:margin-right="${props.marginRight}"`)
        if (props.textIndent) attrs.push(`fo:text-indent="${props.textIndent}"`)
        const attrText = attrs.length ? ` ${attrs.join(' ')}` : ''
        return `
    <style:style style:name="${name}" style:family="paragraph">
      <style:paragraph-properties${attrText}/>
    </style:style>`
      })
      .join('')

    const columnStyles = Array.from(this.tableColumnStyles.entries())
      .map(([width, name]) => {
        return `
    <style:style style:name="${name}" style:family="table-column">
      <style:table-column-properties style:column-width="${width}"/>
    </style:style>`
      })
      .join('')

    const cellStyles = Array.from(this.tableCellStyles.values())
      .map(({ name, backgroundColor }) => {
        return `
    <style:style style:name="${name}" style:family="table-cell">
      <style:table-cell-properties fo:border="0.5pt solid #444444" fo:padding="0.05cm" fo:background-color="${backgroundColor}"/>
    </style:style>`
      })
      .join('')

    const spanStyles = Array.from(this.spanStyles.values())
      .map(({ name, span }) => {
        const props: string[] = ['style:font-name="BodyFont"']
        if (span.bold) props.push('fo:font-weight="bold"')
        if (span.italic) props.push('fo:font-style="italic"')
        if (span.underline) {
          props.push('style:text-underline-style="solid"')
          props.push('style:text-underline-type="single"')
        }
        if (span.color) props.push(`fo:color="${span.color}"`)
        if (span.fontSize) props.push(`fo:font-size="${span.fontSize}"`)

        const attr = props.join(' ')
        return `
    <style:style style:name="${name}" style:family="text">
      <style:text-properties${attr ? ` ${attr}` : ''}/>
    </style:style>`
      })
      .join('')

    return `${baseStyles}${tableStyles}${columnStyles}${paragraphStyles}${cellStyles}${spanStyles}`
  }

  private keyForSpan(span: TextSpan): string {

    // ✅ fontFamily가 다르면 다른 스타일로 취급해야 하므로 key에 포함
    return [
      span.fontFamily ? `ff:${span.fontFamily}` : 'ff:',
      span.bold ? 'b1' : 'b0',
      span.italic ? 'i1' : 'i0',
      span.underline ? 'u1' : 'u0',
      span.color ? `c:${span.color}` : 'c:',
      span.fontSize ? `f:${span.fontSize}` : 'f:'
    ].join('|')
  }

  private computeAbsoluteWidth(columnWidths?: Array<string | undefined>): string | undefined {
    if (!columnWidths || columnWidths.length === 0) return undefined
    const numeric = columnWidths.map(width => this.lengthStringToCm(width))
    const filtered = numeric.filter((value): value is number => value !== undefined)
    if (!filtered.length) return undefined
    const total = filtered.reduce((acc, value) => acc + value, 0)
    return total > 0 ? `${total.toFixed(4)}cm` : undefined
  }

  private lengthStringToCm(length?: string): number | undefined {
    if (!length) return undefined
    const match = length.trim().match(/^([\d.]+)\s*cm$/i)
    if (!match) return undefined
    const numeric = parseFloat(match[1])
    return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined
  }
}
