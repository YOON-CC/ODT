// Tiny helpers to produce valid ODT XML wrappers
export function odfDocumentContent(contentInnerXml: string, automaticStylesInner: string): string {
  const fontFaceDecls = `
  <office:font-face-decls>
    <style:font-face 
      style:name="BodyFont" 
      svg:font-family="'Malgun Gothic','Nanum Gothic','Apple SD Gothic Neo','Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',Arial" 
      style:font-family-generic="system" 
      style:font-pitch="variable"
    />
    <style:font-face 
      style:name="EmojiFont" 
      svg:font-family="'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji'" 
      style:font-family-generic="system" 
      style:font-pitch="variable"
    />

    <!-- ✅✅ 궁서체 폰트 선언 추가 -->
    <style:font-face 
      style:name="GungsuhFont"
      svg:font-family="'Gungsuh','궁서','GungsuhChe','궁서체'"
    />
  </office:font-face-decls>`

  const pageLayout = `
  <style:page-layout style:name="PageLayout">
    <style:page-layout-properties 
      fo:page-width="21cm" fo:page-height="29.7cm"
      fo:margin-top="2cm" fo:margin-bottom="2cm"
      fo:margin-left="2cm" fo:margin-right="2cm"
    />
  </style:page-layout>
  <style:master-page style:name="Standard" style:page-layout-name="PageLayout"/>`

  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
  office:version="1.4">

  ${fontFaceDecls}

  <office:automatic-styles>

    ${pageLayout}

    <!-- ✅✅ 여기에 자동 텍스트 스타일(T_Gungsuh)을 넣어야 함 -->
    <style:style style:name="T_Gungsuh" style:family="text">
      <style:text-properties style:font-name="GungsuhFont"/>
    </style:style>

    <!-- 기존 생성된 자동 스타일들 -->
    ${automaticStylesInner}

  </office:automatic-styles>

  <office:body>
    <office:text>
      ${contentInnerXml}
    </office:text>
  </office:body>

</office:document-content>`
}

export function odfStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles 
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
  office:version="1.4">

  <office:styles>
    <style:default-style style:family="paragraph">
      <style:paragraph-properties 
        fo:margin-top="0cm" 
        fo:margin-bottom="0cm"
        fo:line-height="140%" 
        fo:text-indent="0cm"
      />
      <style:text-properties 
        style:font-name="BodyFont" 
        fo:font-size="12pt"
      />
    </style:default-style>

    <style:default-style style:family="text">
      <style:text-properties 
        style:font-name="BodyFont" 
        fo:font-size="12pt"
      />
    </style:default-style>
  </office:styles>

</office:document-styles>`
}

export function odfMetaXml(title?: string, creator?: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta 
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
  office:version="1.4">

  <office:meta>
    ${title ? `<dc:title>${escapeXml(title)}</dc:title>` : ''}
    ${creator ? `<dc:creator>${escapeXml(creator)}</dc:creator>` : ''}
    <meta:creation-date>${new Date().toISOString()}</meta:creation-date>
  </office:meta>

</office:document-meta>`
}

export function odfSettingsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-settings 
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"
  office:version="1.4">

  <office:settings>
    <config:config-item-set config:name="ooo:view-settings">
      <config:config-item config:name="ZoomType" config:type="short">0</config:config-item>
    </config:config-item-set>
  </office:settings>

</office:document-settings>`
}

export function odfManifestXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest 
  xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" 
  manifest:version="1.2">

  <manifest:file-entry 
    manifest:media-type="application/vnd.oasis.opendocument.text" 
    manifest:full-path="/" 
  />
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="styles.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="meta.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="settings.xml"/>
</manifest:manifest>`
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
