//----------------------------------------------------
// odtJsonToHtml.ts (FULL VERSION)
//----------------------------------------------------
import { PAGE_BREAK_HTML } from './pageBreak'

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

/* -------------------------------------------------------
 ✅ attributes → span 스타일 자동 추출
--------------------------------------------------------*/
function extractSpanPropsFromAttributes(node: OdtNode): Record<string, string> {
  const attrs = node.attributes || {};
  const style: Record<string, string> = {};

  if (attrs["fo:font-weight"] === "bold") style["font-weight"] = "bold"
  if (attrs["fo:font-style"] === "italic") style["font-style"] = "italic"

  if (attrs["style:text-underline-style"] && attrs["style:text-underline-style"] !== "none") {
    style["text-decoration-line"] = "underline"
  }

  if (attrs["fo:font-size"]) style["font-size"] = attrs["fo:font-size"]
  if (attrs["fo:color"]) style["color"] = attrs["fo:color"]

  if (attrs["style:font-name"]) style["font-family"] = attrs["style:font-name"]

  return style
}

/* -------------------------------------------------------
 ✅ Entry
--------------------------------------------------------*/
export function odtJsonToHtml(doc: OdtJsonDocument | null | undefined): string {
  if (!doc?.content) return ''
  const officeText = findNodeByName(doc.content, 'office:text')
  if (!officeText) return ''
  return nodesToHtml(officeText.children)
}

function findNodeByName(node: OdtNode, name: string): OdtNode | null {
  if (node.name === name) return node
  const children = node.children ?? []
  for (const child of children) {
    const res = findNodeByName(child, name)
    if (res) return res
  }
  return null
}

function nodesToHtml(nodes?: OdtNode[] | null): string {
  if (!nodes?.length) return ''
  return nodes.map(n => nodeToHtml(n)).join('')
}

/* -------------------------------------------------------
 ✅ nodeToHtml
--------------------------------------------------------*/
function nodeToHtml(node: OdtNode): string {
  if (!node) return ''

  if (node.nodeType === 'TEXT' || node.name === '#text') {
    return escapeHtml(node.textContent || '')
  }

  switch (node.name) {
    case 'text:soft-page-break':
      return PAGE_BREAK_HTML
    case 'text:p':
      return convertParagraph(node)
    case 'text:span':
      return convertSpan(node)
    case 'table:table':
      return convertTable(node)
    case 'table:table-row':
      return convertTableRow(node, 'td')
    case 'table:table-cell':
      return convertTableCell(node, 'td')
    default:
      return nodesToHtml(node.children)
  }
}

/* -------------------------------------------------------
 ✅ convertParagraph
--------------------------------------------------------*/
function convertParagraph(node: OdtNode): string {
  const style = combineStyles(
    mapParagraphProperties(getResolvedProperties(node, 'style:paragraph-properties')),
    mapTextProperties(getResolvedProperties(node, 'style:text-properties'))
  )

  const styleAttr = styleMapToAttr(style)
  const children = node.children ?? []
  const softBreakCount = children.filter(child => child?.name === 'text:soft-page-break').length
  const otherChildren = children.filter(child => child?.name !== 'text:soft-page-break')
  const inner = nodesToHtml(otherChildren)

  const parts: string[] = []
  const hasContent =
    otherChildren.length > 0 ||
    (inner && inner.replace(/<br\s*\/?>/gi, '').trim().length > 0)

  if (hasContent) {
    parts.push(`<p${styleAttr}>${inner || '<br />'}</p>`)
  } else if (softBreakCount === 0) {
    parts.push(`<p${styleAttr}>${inner || '<br />'}</p>`)
  }

  if (softBreakCount > 0) {
    for (let i = 0; i < softBreakCount; i += 1) {
      parts.push(PAGE_BREAK_HTML)
    }
  }

  return parts.join('')
}

/* -------------------------------------------------------
 ✅ convertSpan (핵심 수정완료)
--------------------------------------------------------*/
function convertSpan(node: OdtNode): string {
  const styleResolved = mapTextProperties(
    getResolvedProperties(node, 'style:text-properties')
  )
  const styleAttrs = extractSpanPropsFromAttributes(node)

  const merged = combineStyles(styleResolved, styleAttrs)
  const styleAttr = styleMapToAttr(merged)

  const content = nodesToHtml(node.children)
  return `<span${styleAttr}>${content || '&nbsp;'}</span>`
}

/* -------------------------------------------------------
 ✅ Table 전체 (기존 구조 유지)
--------------------------------------------------------*/

function convertTable(node: OdtNode): string {
  const style = combineStyles(
    mapTableProperties(getResolvedProperties(node, 'style:table-properties'))
  )
  const styleAttr = styleMapToAttr(style)

  const rows = (node.children ?? [])
    .map(n => nodeToHtml(n))
    .join('')

  return `<table class="odt-table"${styleAttr}>${rows}</table>`
}

function convertTableRow(node: OdtNode, tag: 'td' | 'th'): string {
  const style = mapTableRowProperties(getResolvedProperties(node, 'style:table-row-properties'))
  const styleAttr = styleMapToAttr(style)

  const cells = (node.children ?? [])
    .map(c => nodeToHtml(c))
    .join('')

  return `<tr${styleAttr}>${cells}</tr>`
}

function convertTableCell(node: OdtNode, tag: 'td' | 'th'): string {
  const style = combineStyles(
    mapTableCellProperties(getResolvedProperties(node, 'style:table-cell-properties')),
    mapTextProperties(getResolvedProperties(node, 'style:text-properties'))
  )
  const styleAttr = styleMapToAttr(style)

  const col = getSpanAttr(node.attributes?.['table:number-columns-spanned'], 'colspan')
  const row = getSpanAttr(node.attributes?.['table:number-rows-spanned'], 'rowspan')

  const content = nodesToHtml(node.children)
  return `<${tag}${styleAttr}${col}${row}>${content || '<br />'}</${tag}>`
}

/* -------------------------------------------------------
 ✅ Helpers (그대로)
--------------------------------------------------------*/

function getSpanAttr(v?: string, key?: string): string {
  if (!v) return ''
  const n = parseInt(v, 10)
  if (Number.isNaN(n) || n <= 1) return ''
  return ` ${key}="${n}"`
}

function getResolvedProperties(node: OdtNode, key: string): Record<string, string> {
  const map = node.styleApplication?.resolvedProperties || {}
  return map[key] || {}
}

function mapParagraphProperties(src: Record<string, string>): StyleMap {
  const out: StyleMap = {}
  copyIfPresent(src, out, 'fo:text-align', 'text-align')
  copyIfPresent(src, out, 'fo:line-height', 'line-height')
  copyIfPresent(src, out, 'fo:margin-top', 'margin-top')
  copyIfPresent(src, out, 'fo:margin-bottom', 'margin-bottom')
  return out
}

function mapTextProperties(src: Record<string, string>): StyleMap {
  const out: StyleMap = {}
  copyIfPresent(src, out, 'fo:font-weight', 'font-weight')
  copyIfPresent(src, out, 'fo:font-style', 'font-style')
  copyIfPresent(src, out, 'fo:font-size', 'font-size')
  copyIfPresent(src, out, 'fo:color', 'color')
  copyIfPresent(src, out, 'style:text-underline-style', 'text-decoration-line')
  if (out['text-decoration-line'] === 'solid') out['text-decoration-line'] = 'underline'
  return out
}

function mapTableProperties(src: Record<string, string>): StyleMap {
  const out: StyleMap = {}
  copyIfPresent(src, out, 'style:width', 'width')
  return out
}

function mapTableRowProperties(src: Record<string, string>): StyleMap {
  const out: StyleMap = {}
  copyIfPresent(src, out, 'style:min-row-height', 'min-height')
  return out
}

function mapTableCellProperties(src: Record<string, string>): StyleMap {
  const out: StyleMap = {}
  copyIfPresent(src, out, 'fo:background-color', 'background-color')
  copyIfPresent(src, out, 'fo:border', 'border')
  copyIfPresent(src, out, 'fo:padding', 'padding')
  return out
}

function combineStyles(...styles: Array<StyleMap | undefined>): StyleMap {
  const out: StyleMap = {}
  for (const s of styles) {
    if (!s) continue
    for (const [k, v] of Object.entries(s)) {
      if (v !== '' && v !== undefined) out[k] = v
    }
  }
  return out
}

function styleMapToAttr(style: StyleMap): string {
  const entries = Object.entries(style)
  if (!entries.length) return ''
  return ` style="${entries.map(([k, v]) => `${k}: ${v}`).join('; ')}"`
}

function copyIfPresent(src: Record<string, string>, tar: StyleMap, from: string, to: string) {
  if (src[from]) tar[to] = src[from]
}

function escapeHtml(t: string): string {
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
