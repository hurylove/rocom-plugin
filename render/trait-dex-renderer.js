import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { templateDir } from '../components/paths.js'

const text = (value, fallback = '') => value == null || String(value).trim() === '' ? fallback : String(value).trim()
const list = (value) => Array.isArray(value) ? value : []
const displayName = (owner) => text(owner.displayName) || text(owner.name, '名称未提供') + (owner.formLabel ? '（' + owner.formLabel + '）' : '')

export function buildTraitPages(detail, pageSize = Infinity) {
  if (pageSize !== Infinity && (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 60)) throw new RangeError('每页条数须为正整数或 Infinity')
  const source = detail || {}
  const owners = list(source.owners).map(owner => ({
    displayName: displayName(owner),
    number: text(owner.number, '—'),
    icon: text(owner.icon),
    types: list(owner.types).map(value => text(value)).filter(Boolean).join('/'),
    url: text(owner.url)
  }))
  const total = Number.isFinite(Number(source.total)) ? Number(source.total) : owners.length
  const pageCount = Math.max(1, Math.ceil(owners.length / pageSize))
  const stamp = new Date(source.fetchedAt)
  const base = {
    name: text(source.name, '特性详情'),
    type: text(source.type, '未提供'),
    secondaryType: text(source.secondaryType),
    types: [text(source.type, '未提供'), text(source.secondaryType)].filter(Boolean).join('/'),
    description: text(source.description, '效果暂未提供'),
    icon: text(source.icon),
    total, shownTotal: owners.length,
    stale: source.stale === true,
    fetchedAt: Number.isNaN(stamp.getTime()) ? '时间未提供' : stamp.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }),
    fontUrl: pathToFileURL(templateDir + 'font/AlimamaFangYuanTiVF.ttf').href,
    renderScale: 1, pageCount
  }
  return Array.from({ length: pageCount }, (_, index) => {
    const items = owners.slice(index * pageSize, (index + 1) * pageSize)
    return { ...base, owners: items, pageNumber: index + 1, shown: items.length, firstPage: index === 0 }
  })
}

export async function renderTraitDex(detail, options = {}) {
  try {
    let screenshot = options.screenshot
    let renderScale = options.renderScale ?? 1
    if (!screenshot) {
      const [{ default: Puppeteer }, { config }] = await Promise.all([
        import('../../../lib/puppeteer/puppeteer.js'), import('../components/runtime.js')
      ])
      screenshot = (name, data) => Puppeteer.screenshot(name, data)
      renderScale = config.renderScale / 100
    }
    if (!Number.isFinite(renderScale) || renderScale <= 0) renderScale = 1
    const pages = buildTraitPages(detail, options.pageSize ?? Infinity)
    const cacheImage = options.cacheImage || (await import('../models/trait-dex.js')).cachedTraitImage
    const urls = [...new Set(pages.flatMap(page => [page.icon, ...page.owners.map(owner => owner.icon)]).filter(Boolean))]
    const images = new Map()
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(6, urls.length) }, async () => {
      while (cursor < urls.length) {
        const url = urls[cursor++]
        try {
          const cached = await cacheImage(url)
          images.set(url, typeof cached === 'string' && /^(file:\/\/|data:image\/(?:png|jpeg|gif|webp);base64,)/.test(cached) ? cached : '')
        } catch { images.set(url, '') }
      }
    }))
    const jobId = 'trait_' + randomUUID().replaceAll('-', '')
    const result = []
    for (const page of pages) {
      const payload = {
        ...page,
        icon: images.get(page.icon) || '',
        owners: page.owners.map(owner => ({ ...owner, icon: images.get(owner.icon) || '' })),
        renderScale, tplFile: templateDir + 'trait-dex.html', saveId: jobId + '_' + page.pageNumber, imgType: 'png'
      }
      const image = await screenshot('rocom_trait_dex', payload)
      if (!image) throw new Error('特性详情第 ' + page.pageNumber + ' 页渲染失败')
      result.push(image)
    }
    return result
  } catch (err) {
    const logger = options.logger || globalThis.logger
    logger?.error?.('[rocom] 渲染特性详情失败：', err)
    return null
  }
}
