export const FONT_FAMILIES = {
  notoSans: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Segoe UI', 'Helvetica Neue', sans-serif",
  nanumGothic: "'Nanum Gothic', 'Apple SD Gothic Neo', 'Segoe UI', sans-serif",
  nanumMyeongjo: "'Nanum Myeongjo', 'Iropke Batang', serif",
  gowunDodum: "'Gowun Dodum', 'Apple SD Gothic Neo', sans-serif",
  gungsuh: "'Gungsuh', '궁서', 'GungSeo', 'GungsuhChe', serif",
  headlineA: "'HeadlineA', 'Apple SD Gothic Neo', 'Segoe UI', sans-serif"
} as const

export type FontFamilyKey = keyof typeof FONT_FAMILIES
export type FontKey = FontFamilyKey | 'system'

export const FONT_OPTIONS: Array<{ key: FontKey; label: string }> = [
  { key: 'notoSans', label: '노토 산스 (Noto Sans KR)' },
  { key: 'nanumGothic', label: '나눔고딕 (Nanum Gothic)' },
  { key: 'nanumMyeongjo', label: '나눔명조 (Nanum Myeongjo)' },
  { key: 'gowunDodum', label: '고운돋움 (Gowun Dodum)' },
  { key: 'gungsuh', label: '궁서체 (Gungsuh)' },
  { key: 'headlineA', label: '헤드라인A (HeadlineA)' },
  { key: 'system', label: '시스템 기본' }
] as const

export const DEFAULT_COLOR = '#1f2328' as const
export const DEFAULT_CELL_BACKGROUND = '#ffffff' as const

export const FONT_SIZE_DEFAULT = 'default' as const
export const DEFAULT_FONT_SIZE_LABEL = '기본 (14px)' as const

export const TABLE_PICKER_MAX_ROWS = 8
export const TABLE_PICKER_MAX_COLS = 8
export const TABLE_PICKER_DEFAULT_SIZE = { rows: 2, cols: 2 } as const

export const FONT_SIZE_OPTIONS = [
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

export type FontSizeValue = (typeof FONT_SIZE_OPTIONS)[number]['value']
export type FontSizePreset = Exclude<FontSizeValue, typeof FONT_SIZE_DEFAULT>
export const FONT_SIZE_PRESET_SET = new Set<FontSizePreset>(
  FONT_SIZE_OPTIONS.filter(option => option.value !== FONT_SIZE_DEFAULT).map(option => option.value as FontSizePreset)
)

export function resolveFontKey(fontFamily: string): FontKey {
  if (!fontFamily) return 'system'
  const normalized = normalizeFontValue(fontFamily)
  const matched = (Object.entries(FONT_FAMILIES) as Array<[FontFamilyKey, string]>)
    .find(([, value]) => normalizeFontValue(value) === normalized)
  return matched ? matched[0] : 'system'
}

export function normalizeFontValue(value: string): string {
  return value.replace(/['"]/g, '')
    .split(',')
    .map(part => part.trim().toLowerCase())
    .filter(Boolean)
    .join(',')
}

export function normalizeFontSizeValue(value: string): FontSizeValue {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return FONT_SIZE_DEFAULT
  if (FONT_SIZE_PRESET_SET.has(trimmed as FontSizePreset)) return trimmed as FontSizeValue
  const compact = trimmed.replace(/\s+/g, '')
  if (FONT_SIZE_PRESET_SET.has(compact as FontSizePreset)) return compact as FontSizeValue
  return FONT_SIZE_DEFAULT
}

export function normalizeOptionalColorValue(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed || trimmed === 'transparent') return ''
  if (/^#[0-9a-f]{3,8}$/.test(trimmed)) {
    if (trimmed.length === 4) {
      const [r, g, b] = trimmed.slice(1)
      return `#${r}${r}${g}${g}${b}${b}`
    }
    if (trimmed.length === 9) return trimmed.slice(0, 7)
    return trimmed
  }
  const match = trimmed.match(/^rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})/)
  if (match) {
    const [r, g, b] = match.slice(1, 4).map(n => clampColorChannel(Number.parseInt(n, 10)))
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }
  return ''
}

export function normalizeColorValue(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return DEFAULT_COLOR
  if (trimmed.startsWith('#')) {
    if (trimmed.length === 4) {
      const [r, g, b] = trimmed.slice(1).split('')
      return `#${r}${r}${g}${g}${b}${b}`
    }
    if (trimmed.length === 7) return trimmed
    return DEFAULT_COLOR
  }
  const match = trimmed.match(/^rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})/)
  if (match) {
    const [r, g, b] = match.slice(1, 4).map(n => clampColorChannel(Number.parseInt(n, 10)))
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }
  return DEFAULT_COLOR
}

export function clampColorChannel(value: number): number {
  return Math.min(255, Math.max(0, Number.isNaN(value) ? 0 : value))
}

export function toHex(value: number): string {
  return value.toString(16).padStart(2, '0')
}

