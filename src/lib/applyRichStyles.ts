//------------------------------------------------------
// applyRichStyles.ts (FULL VERSION)
//------------------------------------------------------

import { STYLE_MAP, FONT_FAMILY_MAP } from "./styleMap";

export function applyRichStyles(html: string): string {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  wrapper.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const styleMap = STYLE_MAP as Record<string, Record<string, string>>;

    el.classList.forEach((cls) => {
      const entry = styleMap[cls];
      if (entry) {
        Object.entries(entry).forEach(([k, v]) => {
          const cssKey = toCssKey(k);
          el.style.setProperty(cssKey, v);
        });
      }

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

function toCssKey(k: string) {
  return k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
