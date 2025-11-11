export const STYLE_MAP = {
  // Colors
  "text-red": { color: "#ff0000" },
  "text-blue": { color: "#0070ff" },
  "text-green": { color: "#2ecc71" },
  "text-yellow": { color: "#f1c40f" },
  "text-gray": { color: "#555555" },

  // Font size (pt conversion)
  "font-12": { fontSize: "9pt" },
  "font-14": { fontSize: "10.5pt" },
  "font-16": { fontSize: "12pt" },
  "font-18": { fontSize: "13.5pt" },
  "font-20": { fontSize: "15pt" },
  "font-24": { fontSize: "18pt" },

  // Quill sizes
  "ql-size-small": { fontSize: "8pt" },
  "ql-size-large": { fontSize: "14pt" },
  "ql-size-huge": { fontSize: "24pt" },

  // Alignment
  "center": { textAlign: "center" },
  "right": { textAlign: "end" },
  "left": { textAlign: "start" },
  "ql-align-center": { textAlign: "center" },
  "ql-align-right": { textAlign: "end" },
  "ql-align-left": { textAlign: "start" },
  "ql-align-justify": { textAlign: "justify" },

  // Text styles
  "bold": { fontWeight: "bold" },
  "italic": { fontStyle: "italic" },
  "underline": { textDecoration: "underline" },

  // Highlight
  "highlight-yellow": { backgroundColor: "#fff59d" },
  "highlight-green": { backgroundColor: "#d4efdf" },
  "highlight-blue": { backgroundColor: "#d6eaf8" },

  // Table style
  "table-bordered": { border: "1px solid #444" },
  "table-borderless": { border: "none" },
};

/**
 * ✅ ODT 변환용 fontFamily 매핑
 * JSON → ODT 스타일네임
 */
export const FONT_FAMILY_MAP: Record<"body" | "serif" | "gungsuh", string> = {
  body: "T_Body",
  serif: "T_Serif",
  gungsuh: "T_Gungsuh",
}