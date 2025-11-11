import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { OdtDoc } from './types'
import { buildContentXml } from './odtBuilder'
import { odfMetaXml, odfManifestXml, odfSettingsXml, odfStylesXml } from './odtTemplates'

export async function makeAndDownloadOdt(doc: OdtDoc, filename = 'document.odt') {
  const zip = new JSZip()

  // Spec prefers "mimetype" as first entry and uncompressed
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' })

  const contentXml = buildContentXml(doc)
  const stylesXml = odfStylesXml()
  const metaXml = odfMetaXml(doc.meta.title, doc.meta.creator)
  const settingsXml = odfSettingsXml()
  const manifestXml = odfManifestXml()
  
  // contentXml, stylesXml 등이 만들어진 직후 콘솔에 출력
  console.log('[ODT] content.xml\n', contentXml)
  console.log('[ODT] styles.xml\n', stylesXml)
  console.log('[ODT] META-INF/manifest.xml\n', manifestXml)

  zip.file('content.xml', contentXml)
  zip.file('styles.xml', stylesXml)
  zip.file('meta.xml', metaXml)
  zip.file('settings.xml', settingsXml)
  zip.folder('META-INF')!.file('manifest.xml', manifestXml)

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  saveAs(blob, filename)
}