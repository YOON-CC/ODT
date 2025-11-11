import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      /**
       * 현재 선택 영역 또는 이후 입력될 텍스트에 글자 크기를 적용합니다.
       */
      setFontSize: (fontSize: string) => ReturnType
      /**
       * 글자 크기 스타일을 제거하여 기본 크기로 되돌립니다.
       */
      unsetFontSize: () => ReturnType
    }
  }
}

export type FontSizeOptions = {
  types: string[]
  defaultSize: string | null
}

const FontSize = Extension.create<FontSizeOptions>({
  name: 'fontSize',

  addOptions() {
    return {
      types: ['textStyle'],
      defaultSize: null
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: this.options.defaultSize,
            renderHTML: attributes => {
              if (!attributes.fontSize) {
                return {}
              }

              return {
                style: `font-size: ${attributes.fontSize}`
              }
            },
            parseHTML: element => {
              const value = element.style.fontSize
              return value || null
            }
          }
        }
      }
    ]
  },

  addCommands() {
    return {
      setFontSize:
        fontSize =>
        ({ chain }) => {
          if (!fontSize) {
            return this.editor.commands.unsetFontSize()
          }

          return chain().setMark('textStyle', { fontSize }).run()
        },
      unsetFontSize:
        () =>
        ({ chain }) => {
          return chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
        }
    }
  }
})

export default FontSize

