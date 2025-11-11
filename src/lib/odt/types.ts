// Minimal ODT JSON types for content building
export interface TextSpan {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  fontSize?: string

  // ✅ 유니온 타입으로 명확하게 정의
  fontFamily?: "body" | "serif" | "gungsuh"
}


export type Paragraph = { 
  spans: TextSpan[]; 
  align?: 'start' | 'center' | 'end' | 'justify'
  lineHeight?: string
  marginTop?: string
  marginBottom?: string
  marginLeft?: string
  marginRight?: string
  textIndent?: string
}

export type TableCell = {
  paragraphs: Paragraph[]
  colSpan?: number
  rowSpan?: number
  backgroundColor?: string
}

export type TableRow = { cells: TableCell[] }

export type Table = {
  rows: TableRow[]
  widthPct?: number
  widthCm?: string
  columnWidths?: Array<string | undefined>
}

export type OdtBlock = 
  | { type: 'paragraph'; value: Paragraph }
  | { type: 'table'; value: Table }

export type OdtDoc = {
  meta: { title?: string; creator?: string }
  styles: { bodyFont?: string }
  body: OdtBlock[]
}
