import { marked } from 'marked'

const BLANK_PLACEHOLDER = '@@RTE_BLANK_PARAGRAPH@@'

marked.setOptions({ gfm: true, breaks: true })

export async function markdownToHtml(md: string): Promise<string> {
  const preprocessed = injectBlankLinePlaceholders(md)
  // Basic: You can extend with custom renderer to map headings, tables, etc.
  const html = await marked.parse(preprocessed)
  const withBlankLines = restoreBlankLinePlaceholders(html)
  return preserveConsecutiveSpaces(withBlankLines)
}

function injectBlankLinePlaceholders(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/\n{2}(\n+)/g, (match, extra: string) => {
      const placeholders = Array.from({ length: extra.length }, () => `${BLANK_PLACEHOLDER}\n\n`).join('')
      return `\n\n${placeholders}`
    })
}

function restoreBlankLinePlaceholders(html: string): string {
  return html.replace(
    new RegExp(`<p>\\s*${BLANK_PLACEHOLDER}\\s*</p>`, 'g'),
    '<p><br /></p>'
  )
}

function preserveConsecutiveSpaces(html: string): string {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html.replace(/ {2,}/g, match => ` ${'&nbsp;'.repeat(match.length - 1)}`)
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const container = doc.body.firstElementChild

  if (!container) {
    return html
  }

  const skippedTags = new Set(['PRE', 'CODE', 'SCRIPT', 'STYLE'])

  const walker = doc.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement
        if (!parent) {
          return NodeFilter.FILTER_REJECT
        }
        if (skippedTags.has(parent.tagName)) {
          return NodeFilter.FILTER_REJECT
        }
        return node.textContent && node.textContent.includes('  ')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP
      }
    }
  )

  let current = walker.nextNode()
  while (current) {
    const textNode = current as Text
    textNode.textContent =
      textNode.textContent?.replace(/ {2,}/g, spaces => ` ${'\u00A0'.repeat(spaces.length - 1)}`) ?? ''
    current = walker.nextNode()
  }

  return container.innerHTML
}