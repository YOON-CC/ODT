import { STYLE_MAP, FONT_FAMILY_MAP } from "./styleMap";

export function applyRichStyles(html: string): string {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  wrapper.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const styleMap = STYLE_MAP as Record<string, Record<string, string>>;

    el.classList.forEach((cls) => {
      const entry = styleMap[cls];
      if (entry) {
        Object.entries(entry).forEach(([key, value]) => {
          const cssKey = toCssKey(key);
          el.style.setProperty(cssKey, value);

          if (key === "backgroundColor") {
            el.setAttribute("data-odt-background", value);
          }
          if (key === "color") {
            el.setAttribute("data-odt-color", value);
          }
          if (key === "fontSize") {
            el.setAttribute("data-odt-font-size", value);
          }
          if (key === "border") {
            el.setAttribute("data-odt-border", value);
          }
        });
      }

      // ✅✅ 폰트 패밀리 클래스 기반 적용 (핵심)
      if (cls === "font-gungsuh") {
        el.setAttribute("data-odt-font-family", "gungsuh");
      }
      if (cls === "font-serif") {
        el.setAttribute("data-odt-font-family", "serif");
      }
      if (cls === "font-body") {
        el.setAttribute("data-odt-font-family", "body");
      }
    });
  });

  const baseStyle = `
    <style>
      :root {
        --odt-emoji: 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji';
        --odt-base: 'Malgun Gothic','Nanum Gothic',var(--odt-emoji),Arial,sans-serif;
      }
      .odt-preview-root {
        font-family: var(--odt-base);
      }
    </style>`;

  return `${baseStyle}<div class="odt-preview-root">${wrapper.innerHTML}</div>`;
}

function toCssKey(key: string) {
  return key.replace(/[A-Z]/g, ch => `-${ch.toLowerCase()}`);
}
