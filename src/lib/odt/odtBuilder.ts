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

/** ✅ Bold 전파 차단: Bold/Italic/Underline 은 attributes에서 끌어오지 않음 */
function mergeSpanProps(span: TextSpan): TextSpan {
  const a = (span as any).attributes || {}
  return {
    ...span,
    bold: span.bold,
    italic: span.italic,
    underline: span.underline,
    color: span.color ?? a['fo:color'],
    fontSize: span.fontSize ?? a['fo:font-size'],
    fontFamily: span.fontFamily ?? a['style:font-name'],
  }
}

function renderParagraph(p: Paragraph, styles: StyleRegistry): string {
  const styleName = styles.getParagraphStyle(p)
  const styleAttr = styleName ? ` text:style-name="${styleName}"` : ''

  if (!p.spans.length) return `<text:p${styleAttr}/>` 

  const fragments: string[] = []
  // ✅ 해당 문단에 굵은 span이 하나라도 있는지 확인 (리셋 스타일 적용 트리거)
  const hasAnyBold = p.spans.some(s => !!mergeSpanProps(s).bold)

  p.spans.forEach(span => {
    const merged = mergeSpanProps(span)

    // fontFamily 매핑 우선
    const familyStyle = merged.fontFamily ? FONT_FAMILY_MAP[merged.fontFamily] : undefined
    let spanStyleName = familyStyle ?? styles.getSpanStyle(merged)

    // ✅ Bold 전파 차단 핵심:
    //  - 문단 내에 굵은 텍스트가 존재하고
    //  - 현재 span이 별도 스타일이 없고(=기본 텍스트)
    //  - 현재 span이 bold/italic/underline/color/size도 없음(진짜 기본)
    //  → 기본 텍스트에도 TNormal(리셋 스타일) 부여해서 이전 bold 영향 차단
    const isPurePlain =
      !merged.bold && !merged.italic && !merged.underline &&
      !merged.color && !merged.fontSize && !familyStyle

    if (hasAnyBold && !spanStyleName && isPurePlain) {
      spanStyleName = styles.getNormalTextStyleName() // "TNormal"
    }

    const spanAttr = spanStyleName ? ` text:style-name="${spanStyleName}"` : ''

    const tokens = merged.text.split(/(\n)/)
    tokens.forEach(token => {
      if (token === '\n') {
        fragments.push('<text:line-break/>')
        return
      }
      if (token === '') return
      fragments.push(`<text:span${spanAttr}>${escapeXml(token)}</text:span>`)
    })
  })

  return `<text:p${styleAttr}>${fragments.join('')}</text:p>`
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

  const rows = t.rows.map(r => {
    const cells = r.cells.map(c => {
      const ps = c.paragraphs.map(paragraph => renderParagraph(paragraph, styles)).join('')
      const spanAttrs = [
        c.colSpan ? ` table:number-columns-spanned="${c.colSpan}"` : '',
        c.rowSpan ? ` table:number-rows-spanned="${c.rowSpan}"` : ''
      ].join('')
      const cellStyle = styles.getTableCellStyle(c.backgroundColor) ?? 'TableCell'
      return `<table:table-cell table:style-name="${cellStyle}"${spanAttrs}>${ps || '<text:p/>'}</table:table-cell>`
    }).join('')
    return `<table:table-row table:style-name="TableRow">${cells}</table:table-row>`
  }).join('')

  const tableStyleName = tableStyle ?? 'Table'
  return `<table:table table:style-name="${tableStyleName}">${cols}${rows}</table:table>`
}

class StyleRegistry {
  private spanStyles = new Map<string, { name: string; span: TextSpan }>()
  private tableColumnStyles = new Map<string, string>()
  private tableStyles = new Map<string, { name: string; widthAttr?: string; relWidthAttr?: string }>()
  private paragraphStyles = new Map<string, { name: string; props: ParagraphStyleProps }>()
  private tableCellStyles = new Map<string, { name: string; backgroundColor: string }>()
  private normalTextStyleName = 'TNormal' // ✅ 리셋 텍스트 스타일 고정명

  // ✅ 외부에서 리셋 스타일 이름 가져갈 수 있도록
  getNormalTextStyleName() {
    return this.normalTextStyleName
  }

  getSpanStyle(span: TextSpan): string | undefined {
    // fontFamily 매핑 스타일은 외부(FONT_FAMILY_MAP)에서 제공하므로 여기선 만들지 않음
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

  getTableColumnStyle(width?: string): string | undefined {
    const normalized = width?.trim()
    if (!normalized) return undefined
    const existing = this.tableColumnStyles.get(normalized)
    if (existing) return existing
    const styleName = `TableColumnCustom${this.tableColumnStyles.size + 1}`
    this.tableColumnStyles.set(normalized, styleName)
    return styleName
  }

  getTableStyle(widthPct?: number, columnWidths?: Array<string | undefined>, explicitWidthCm?: string): string | undefined {
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
      widthAttr = '17cm'
      key = 'abs:17cm'
    }

    const cached = key ? this.tableStyles.get(key) : undefined
    if (cached) return cached.name

    const styleName = `TableCustom${this.tableStyles.size + 1}`
    if (key) this.tableStyles.set(key, { name: styleName, widthAttr, relWidthAttr })
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
    if (paragraph.align && paragraph.align !== 'start') props.align = paragraph.align
    if (paragraph.lineHeight) props.lineHeight = paragraph.lineHeight
    if (paragraph.marginTop) props.marginTop = paragraph.marginTop
    if (paragraph.marginBottom) props.marginBottom = paragraph.marginBottom
    if (paragraph.marginLeft) props.marginLeft = paragraph.marginLeft
    if (paragraph.marginRight) props.marginRight = paragraph.marginRight
    if (paragraph.textIndent) props.textIndent = paragraph.textIndent

    const hasProps = Object.values(props).some(v => v !== undefined && v !== '')
    if (!hasProps) return undefined

    const key = JSON.stringify(props)
    const existing = this.paragraphStyles.get(key)
    if (existing) return existing.name

    const styleName = `PStyle${this.paragraphStyles.size + 1}`
    this.paragraphStyles.set(key, { name: styleName, props })
    return styleName
  }

  renderAutomaticStyles(): string {
    // ✅ 기본 스타일 + 리셋 텍스트 스타일(TNormal) 명시
    const baseStyles = `
    <style:style style:name="P" style:family="paragraph">
      <style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.42cm" fo:line-height="160%"/>
      <style:text-properties style:font-name="BodyFont" fo:font-size="12pt"/>
    </style:style>

    <style:style style:name="T" style:family="text">
      <style:text-properties style:font-name="BodyFont" fo:font-size="12pt"/>
    </style:style>

    <!-- ✅ 굵기/기울임/밑줄 모두 Normal로 강제 리셋하는 텍스트 스타일 -->
    <style:style style:name="${this.normalTextStyleName}" style:family="text">
      <style:text-properties
        style:font-name="BodyFont"
        fo:font-weight="normal"
        fo:font-style="normal"
        style:text-underline-style="none"
        fo:font-size="12pt"/>
    </style:style>

    <style:style style:name="Table" style:family="table">
      <style:table-properties table:align="left" table:border-model="collapsing"
        style:may-break-between-rows="false"
        fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm"/>
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
        return `
    <style:style style:name="${name}" style:family="table">
      <style:table-properties ${attrs.join(' ')}/>
    </style:style>`
      }).join('')

    const paragraphStyles = Array.from(this.paragraphStyles.values())
      .map(({ name, props }) => {
        const attrs: string[] = []
        if (props.align) attrs.push(`fo:text-align="${props.align}"`)
        if (props.lineHeight) attrs.push(`fo:line-height="${props.lineHeight}"`)
        if (props.marginTop) attrs.push(`fo:margin-top="${props.marginTop}"`)
        if (props.marginBottom) attrs.push(`fo:margin-bottom="${props.marginBottom}"`)
        if (props.marginLeft) attrs.push(`fo:margin-left="${props.marginLeft}"`)
        if (props.marginRight) attrs.push(`fo:margin-right="${props.marginRight}"`)
        if (props.textIndent) attrs.push(`fo:text-indent="${props.textIndent}"`)
        return `
    <style:style style:name="${name}" style:family="paragraph">
      <style:paragraph-properties ${attrs.join(' ')}/>
    </style:style>`
      }).join('')

    const columnStyles = Array.from(this.tableColumnStyles.entries())
      .map(([width, name]) => `
    <style:style style:name="${name}" style:family="table-column">
      <style:table-column-properties style:column-width="${width}"/>
    </style:style>`).join('')

    const cellStyles = Array.from(this.tableCellStyles.values())
      .map(({ name, backgroundColor }) => `
    <style:style style:name="${name}" style:family="table-cell">
      <style:table-cell-properties fo:border="0.75pt solid #c5ccd6" fo:padding="0.20cm" fo:background-color="${backgroundColor}"/>
    </style:style>`).join('')

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
        return `
    <style:style style:name="${name}" style:family="text">
      <style:text-properties ${props.join(' ')}/>
    </style:style>`
      }).join('')

    return `${baseStyles}${tableStyles}${columnStyles}${paragraphStyles}${cellStyles}${spanStyles}`
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

  private computeAbsoluteWidth(columnWidths?: Array<string | undefined>): string | undefined {
    if (!columnWidths?.length) return undefined
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
