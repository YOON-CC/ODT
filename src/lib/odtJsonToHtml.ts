type StyleMap = Record<string, string>

export interface OdtJsonDocument {
  content?: OdtNode | null
  [key: string]: unknown
}

export interface OdtNode {
  nodeType: string
  name: string
  namespaceUri: string | null
  attributes: Record<string, string>
  textContent: string | null
  children?: OdtNode[] | null
  styleApplication?: {
    resolvedProperties?: Record<string, Record<string, string>>
  } | null
  [key: string]: unknown
}

export function odtJsonToHtml(document: OdtJsonDocument | null | undefined): string {
  if (!document?.content) return ''
  const officeText = findNodeByName(document.content, 'office:text')
  if (!officeText) return ''
  const children = officeText.children ?? []
  const html = nodesToHtml(children)
  return html
}

function findNodeByName(node: OdtNode, targetName: string): OdtNode | null {
  if (node.name === targetName) return node
  const children = node.children ?? []
  for (const child of children) {
    const found = findNodeByName(child, targetName)
    if (found) return found
  }
  return null
}

function nodesToHtml(nodes: OdtNode[] | null | undefined): string {
  if (!nodes?.length) return ''
  return nodes
    .map(node => nodeToHtml(node))
    .filter(Boolean)
    .join('')
}

function nodeToHtml(node: OdtNode | null | undefined): string {
  if (!node) return ''
  if (node.nodeType === 'TEXT' || node.name === '#text') {
    return escapeHtml(node.textContent ?? '')
  }

  switch (node.name) {
    case 'text:p':
      return convertParagraph(node)
    case 'text:span':
      return convertSpan(node)
    case 'text:s':
      return convertTextSpace(node)
    case 'table:table':
      return convertTable(node)
    case 'table:table-header-rows':
      return convertTableHeaderRows(node)
    case 'table:table-row':
      return convertTableRow(node, 'td')
    case 'table:table-cell':
      return convertTableCell(node, 'td')
    case 'table:covered-table-cell':
      return ''
    case 'draw:frame':
    case 'draw:text-box':
      return nodesToHtml(node.children)
    case 'draw:image':
      return convertImage(node)
    case 'text:sequence-decls':
    case 'text:sequence-decl':
    case 'text:bookmark':
    case 'text:bookmark-start':
    case 'text:bookmark-end':
      return ''
    default:
      return nodesToHtml(node.children)
  }
}

function convertParagraph(node: OdtNode): string {
  const paragraphStyle = combineStyles(
    mapParagraphProperties(getResolvedProperties(node, 'style:paragraph-properties')),
    mapTextProperties(getResolvedProperties(node, 'style:text-properties'))
  )
  const styleAttr = styleMapToAttr(paragraphStyle)
  const children = node.children ?? []
  if (!children.length) {
    return `<p${styleAttr}><br /></p>`
  }

  const segments: string[] = []
  let inlineBuffer: string[] = []

  const flushInline = () => {
    if (!inlineBuffer.length) return
    const content = inlineBuffer.join('')
    const inner = content === '' ? '<br />' : content
    segments.push(`<p${styleAttr}>${inner}</p>`)
    inlineBuffer = []
  }

  for (const child of children) {
    if (isBlockLevelParagraphChild(child)) {
      flushInline()
      const blockHtml = nodeToHtml(child)
      if (blockHtml) {
        segments.push(blockHtml)
      }
    } else {
      inlineBuffer.push(nodeToHtml(child))
    }
  }
  flushInline()

  if (!segments.length) {
    const fallback = nodesToHtml(children)
    const inner = fallback === '' ? '<br />' : fallback
    return `<p${styleAttr}>${inner}</p>`
  }

  return segments.join('')
}

function isBlockLevelParagraphChild(node: OdtNode): boolean {
  if (node.name === 'table:table') {
    return true
  }
  if (node.name === 'draw:text-box') {
    return true
  }
  if (node.name === 'draw:frame') {
    return (node.children ?? []).some(child => isBlockLevelParagraphChild(child))
  }
  return false
}

function convertSpan(node: OdtNode): string {
  const textStyle = combineStyles(mapTextProperties(getResolvedProperties(node, 'style:text-properties')))
  const styleAttr = styleMapToAttr(textStyle)
  const content = nodesToHtml(node.children)
  if (styleAttr === '' && content !== '') {
    return content
  }
  const inner = content === '' ? '&nbsp;' : content
  return `<span${styleAttr}>${inner}</span>`
}

function convertTextSpace(node: OdtNode): string {
  const countRaw = node.attributes?.['text:c']
  const count = countRaw ? parseInt(countRaw, 10) || 1 : 1
  return '&nbsp;'.repeat(Math.max(count, 1))
}

function convertTable(node: OdtNode): string {
  const style = combineStyles(
    mapTableProperties(getResolvedProperties(node, 'style:table-properties'))
  )
  const styleAttr = styleMapToAttr(style)
  const columns: OdtNode[] = []
  const headerGroups: OdtNode[] = []
  const bodyRows: OdtNode[] = []

  for (const child of node.children ?? []) {
    if (child.name === 'table:table-column') {
      columns.push(child)
    } else if (child.name === 'table:table-header-rows') {
      headerGroups.push(child)
    } else if (child.name === 'table:table-row') {
      bodyRows.push(child)
    }
  }

  const colgroup = convertTableColumns(columns)
  const thead = convertTableColumnsGroup(headerGroups)
  const tbody = bodyRows.length
    ? `<tbody>${bodyRows.map(row => convertTableRow(row, 'td')).join('')}</tbody>`
    : ''

  const inner = [colgroup, thead, tbody].filter(Boolean).join('')
  const classAttr = ' class="tiptap-table"'
  return `<table${classAttr}${styleAttr}>${inner}</table>`
}

function convertTableColumns(columns: OdtNode[]): string {
  if (!columns.length) return ''
  const items = columns
    .map(column => {
      const style = combineStyles(
        mapTableColumnProperties(getResolvedProperties(column, 'style:table-column-properties'))
      )
      const styleAttr = styleMapToAttr(style)
      const repeatRaw = column.attributes?.['table:number-columns-repeated']
      const repeat = repeatRaw ? Math.max(parseInt(repeatRaw, 10) || 1, 1) : 1
      const colHtml = `<col${styleAttr} />`
      return colHtml.repeat(repeat)
    })
    .join('')
  return `<colgroup>${items}</colgroup>`
}

function convertTableColumnsGroup(groups: OdtNode[]): string {
  if (!groups.length) return ''
  const rows: string[] = []
  for (const group of groups) {
    for (const row of group.children ?? []) {
      rows.push(convertTableRow(row, 'th'))
    }
  }
  if (!rows.length) return ''
  return `<thead>${rows.join('')}</thead>`
}

function convertTableHeaderRows(node: OdtNode): string {
  const rows = (node.children ?? []).map(child => convertTableRow(child, 'th')).join('')
  return rows ? `<thead>${rows}</thead>` : ''
}

function convertTableRow(node: OdtNode, cellTag: 'td' | 'th'): string {
  const style = combineStyles(
    mapTableRowProperties(getResolvedProperties(node, 'style:table-row-properties'))
  )
  const styleAttr = styleMapToAttr(style)
  const cells = (node.children ?? [])
    .map(child => {
      if (child.name === 'table:table-cell') {
        return convertTableCell(child, cellTag)
      }
      if (child.name === 'table:covered-table-cell') {
        return ''
      }
      return nodeToHtml(child)
    })
    .filter(Boolean)
    .join('')
  return `<tr${styleAttr}>${cells}</tr>`
}

function convertTableCell(node: OdtNode, tag: 'td' | 'th'): string {
  const style = combineStyles(
    mapTableCellProperties(getResolvedProperties(node, 'style:table-cell-properties')),
    mapTextProperties(getResolvedProperties(node, 'style:text-properties'))
  )
  const styleAttr = styleMapToAttr(style)
  const colspanAttr = getSpanAttr(node.attributes?.['table:number-columns-spanned'], 'colspan')
  const rowspanAttr = getSpanAttr(node.attributes?.['table:number-rows-spanned'], 'rowspan')
  const attrs = [styleAttr, colspanAttr, rowspanAttr].filter(Boolean).join('')
  const content = nodesToHtml(node.children)
  const inner = content === '' ? '<br />' : content
  return `<${tag}${attrs}>${inner}</${tag}>`
}

function convertImage(node: OdtNode): string {
  const href = node.attributes?.['xlink:href'] ?? ''
  const mime = node.attributes?.['draw:mime-type']
  const attrParts = [`data-odt-src="${escapeHtmlAttr(href)}"`]
  if (href) {
    attrParts.push(`src="${escapeHtmlAttr(href)}"`)
  }
  if (mime) {
    attrParts.push(`data-odt-mime="${escapeHtmlAttr(mime)}"`)
  }
  return `<img ${attrParts.join(' ')} />`
}

function getSpanAttr(value: string | undefined, name: 'colspan' | 'rowspan'): string {
  if (!value) return ''
  const parsed = parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed <= 1) return ''
  return ` ${name}="${parsed}"`
}

function getResolvedProperties(node: OdtNode, key: string): Record<string, string> {
  if (!node?.styleApplication?.resolvedProperties) return {}
  const entry = node.styleApplication.resolvedProperties[key]
  if (!entry) return {}
  const result: Record<string, string> = {}
  for (const [propKey, propValue] of Object.entries(entry)) {
    if (typeof propValue === 'string' && propValue !== '') {
      result[propKey] = propValue
    }
  }
  return result
}

function mapParagraphProperties(source: Record<string, string>): StyleMap {
  const mapped: StyleMap = {}
  copyIfPresent(source, mapped, 'fo:text-align', 'text-align')
  copyIfPresent(source, mapped, 'fo:margin-left', 'margin-left')
  copyIfPresent(source, mapped, 'fo:margin-right', 'margin-right')
  copyIfPresent(source, mapped, 'fo:margin-top', 'margin-top')
  copyIfPresent(source, mapped, 'fo:margin-bottom', 'margin-bottom')
  copyIfPresent(source, mapped, 'fo:text-indent', 'text-indent')
  copyIfPresent(source, mapped, 'fo:line-height', 'line-height')
  copyIfPresent(source, mapped, 'fo:padding', 'padding')
  copyIfPresent(source, mapped, 'fo:padding-left', 'padding-left')
  copyIfPresent(source, mapped, 'fo:padding-right', 'padding-right')
  copyIfPresent(source, mapped, 'fo:padding-top', 'padding-top')
  copyIfPresent(source, mapped, 'fo:padding-bottom', 'padding-bottom')
  copyIfPresent(source, mapped, 'fo:border', 'border')
  copyIfPresent(source, mapped, 'fo:border-left', 'border-left')
  copyIfPresent(source, mapped, 'fo:border-right', 'border-right')
  copyIfPresent(source, mapped, 'fo:border-top', 'border-top')
  copyIfPresent(source, mapped, 'fo:border-bottom', 'border-bottom')
  copyIfPresent(source, mapped, 'fo:background-color', 'background-color')
  copyIfPresent(source, mapped, 'style:writing-mode', 'writing-mode')
  copyIfPresent(source, mapped, 'style:vertical-align', 'vertical-align')
  return mapped
}

function mapTextProperties(source: Record<string, string>): StyleMap {
  const mapped: StyleMap = {}
  copyIfPresent(source, mapped, 'fo:font-weight', 'font-weight')
  copyIfPresent(source, mapped, 'fo:font-style', 'font-style')
  copyIfPresent(source, mapped, 'fo:font-size', 'font-size')
  if (!mapped['font-size']) {
    copyIfPresent(source, mapped, 'style:font-size-asian', 'font-size')
  }
  copyIfPresent(source, mapped, 'fo:color', 'color')
  copyIfPresent(source, mapped, 'fo:letter-spacing', 'letter-spacing')
  copyIfPresent(source, mapped, 'fo:text-transform', 'text-transform')
  copyIfPresent(source, mapped, 'fo:background-color', 'background-color')
  copyIfPresent(source, mapped, 'style:text-outline', 'text-outline')

  const opacity = source['loext:opacity']
  if (opacity) {
    const normalized = normalizeOpacity(opacity)
    if (normalized !== undefined) {
      mapped.opacity = normalized
    }
  }

  const families = [
    source['style:font-name'],
    source['style:font-name-asian'],
    source['style:font-name-complex']
  ].filter(Boolean)
  if (families.length) {
    mapped['font-family'] = families[0]!
  }

  const decorations: string[] = []
  const underline = source['style:text-underline-style']
  if (underline && underline.toLowerCase() !== 'none') {
    decorations.push('underline')
  }
  const lineThrough = source['style:text-line-through-style']
  if (lineThrough && lineThrough.toLowerCase() !== 'none') {
    decorations.push('line-through')
  }
  const overline = source['style:text-overline-style']
  if (overline && overline.toLowerCase() !== 'none') {
    decorations.push('overline')
  }
  if (decorations.length) {
    mapped['text-decoration-line'] = decorations.join(' ')
  }

  const underlineColor = source['style:text-underline-color']
  if (underlineColor && underlineColor.toLowerCase() !== 'font-color') {
    mapped['text-decoration-color'] = underlineColor
  }

  const underlineWidth = source['style:text-underline-width']
  if (underlineWidth) {
    mapped['text-decoration-thickness'] = underlineWidth
  }

  const textPosition = source['style:text-position']
  if (textPosition) {
    const lowered = textPosition.toLowerCase()
    if (lowered.includes('super')) {
      mapped['vertical-align'] = 'super'
    } else if (lowered.includes('sub')) {
      mapped['vertical-align'] = 'sub'
    }
  }

  return mapped
}

function mapTableProperties(source: Record<string, string>): StyleMap {
  const mapped: StyleMap = {}
  copyIfPresent(source, mapped, 'style:width', 'width')
  copyIfPresent(source, mapped, 'fo:margin-left', 'margin-left')
  copyIfPresent(source, mapped, 'fo:margin-right', 'margin-right')
  copyIfPresent(source, mapped, 'fo:margin-top', 'margin-top')
  copyIfPresent(source, mapped, 'fo:margin-bottom', 'margin-bottom')
  copyIfPresent(source, mapped, 'fo:border', 'border')
  copyIfPresent(source, mapped, 'fo:border-top', 'border-top')
  copyIfPresent(source, mapped, 'fo:border-right', 'border-right')
  copyIfPresent(source, mapped, 'fo:border-bottom', 'border-bottom')
  copyIfPresent(source, mapped, 'fo:border-left', 'border-left')
  copyIfPresent(source, mapped, 'fo:padding', 'padding')
  const borderModel = source['table:border-model']
  if (borderModel) {
    mapped['border-collapse'] = borderModel === 'collapsing' ? 'collapse' : 'separate'
  }
  const align = source['table:align']
  if (align) {
    if (align === 'center') {
      mapped['margin-left'] = 'auto'
      mapped['margin-right'] = 'auto'
    } else if (align === 'right') {
      mapped['margin-left'] = 'auto'
    }
  }
  return mapped
}

function mapTableColumnProperties(source: Record<string, string>): StyleMap {
  const mapped: StyleMap = {}
  copyIfPresent(source, mapped, 'style:column-width', 'width')
  return mapped
}

function mapTableRowProperties(source: Record<string, string>): StyleMap {
  const mapped: StyleMap = {}
  copyIfPresent(source, mapped, 'style:min-row-height', 'min-height')
  const keepTogether = source['fo:keep-together']
  if (keepTogether && keepTogether.toLowerCase() === 'always') {
    mapped['page-break-inside'] = 'avoid'
  }
  return mapped
}

function mapTableCellProperties(source: Record<string, string>): StyleMap {
  const mapped: StyleMap = {}
  copyIfPresent(source, mapped, 'fo:border', 'border')
  copyIfPresent(source, mapped, 'fo:border-left', 'border-left')
  copyIfPresent(source, mapped, 'fo:border-right', 'border-right')
  copyIfPresent(source, mapped, 'fo:border-top', 'border-top')
  copyIfPresent(source, mapped, 'fo:border-bottom', 'border-bottom')
  copyIfPresent(source, mapped, 'fo:padding', 'padding')
  copyIfPresent(source, mapped, 'fo:padding-left', 'padding-left')
  copyIfPresent(source, mapped, 'fo:padding-right', 'padding-right')
  copyIfPresent(source, mapped, 'fo:padding-top', 'padding-top')
  copyIfPresent(source, mapped, 'fo:padding-bottom', 'padding-bottom')
  copyIfPresent(source, mapped, 'fo:background-color', 'background-color')
  copyIfPresent(source, mapped, 'style:vertical-align', 'vertical-align')
  return mapped
}

function combineStyles(...styles: Array<StyleMap | null | undefined>): StyleMap {
  const result: StyleMap = {}
  for (const style of styles) {
    if (!style) continue
    for (const [key, value] of Object.entries(style)) {
      if (value !== undefined && value !== null && value !== '') {
        result[key] = value
      }
    }
  }
  return result
}

function styleMapToAttr(style: StyleMap): string {
  const entries = Object.entries(style).filter(([, value]) => value !== undefined && value !== '')
  if (!entries.length) return ''
  const value = entries.map(([key, raw]) => `${key}: ${sanitizeCssValue(raw)}`).join('; ')
  return ` style="${value}"`
}

function sanitizeCssValue(value: string): string {
  return value.replace(/"/g, "'")
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeHtmlAttr(text: string): string {
  return escapeHtml(text).replace(/`/g, '&#96;')
}

function copyIfPresent(source: Record<string, string>, target: StyleMap, from: string, to: string) {
  if (source[from]) {
    target[to] = source[from]!
  }
}

function normalizeOpacity(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed.endsWith('%')) {
    const num = parseFloat(trimmed.slice(0, -1))
    if (!Number.isNaN(num)) {
      return (Math.max(Math.min(num, 100), 0) / 100).toString()
    }
    return undefined
  }
  const num = parseFloat(trimmed)
  if (Number.isNaN(num)) {
    return undefined
  }
  if (num >= 0 && num <= 1) {
    return num.toString()
  }
  if (num > 1 && num <= 100) {
    return (num / 100).toString()
  }
  return undefined
}


