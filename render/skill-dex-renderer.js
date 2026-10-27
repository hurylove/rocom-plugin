import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { templateDir } from '../components/paths.js'

const METHODS = [['default', '自学'], ['blood', '血脉'], ['stone', '技能石']]
const text = (value, fallback = '') => value == null || String(value).trim() === '' ? fallback : String(value).trim()
const list = (value) => Array.isArray(value) ? value : []
const displayName = (pet) => text(pet.displayName) || text(pet.name, '名称未提供') + (pet.formLabel ? '（' + pet.formLabel + '）' : '')
const readableUrl = (value) => { try { return decodeURI(text(value)) } catch { return text(value) } }

export function buildSkillPages(detail, pageSize = 24) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 60) throw new RangeError('每页条数须为 1–60')
  const all = METHODS.flatMap(([source]) => list(detail.learners?.[source]).map(pet => ({
    displayName: displayName(pet), number: text(pet.number, '—'), icon: text(pet.icon),
    types: list(pet.types).join('/'), level: text(pet.level) ? (/^\d+$/.test(text(pet.level)) ? 'Lv.' + pet.level : text(pet.level)) : '', source
  })))
  const counts = Object.fromEntries(METHODS.map(([key]) => [key, list(detail.learners?.[key]).length]))
  const pageCount = Math.max(1, Math.ceil(all.length / pageSize))
  const stamp = new Date(detail.fetchedAt)
  const base = {
    name: text(detail.name, '技能详情'), type: text(detail.type, '未提供'), category: text(detail.category, '未提供'),
    power: text(detail.power, '—'), energy: text(detail.energy, '未提供'), description: text(detail.description, '效果暂未提供'),
    season: text(detail.season), tags: list(detail.tags).map(value => text(value)).filter(Boolean), icon: text(detail.icon),
    relatedMechanics: list(detail.relatedMechanics).map(item => ({ name: text(item.name), url: text(item.url) })),
    stoneSources: list(detail.stoneSources).map(pet => ({ displayName: displayName(pet), icon: text(pet.icon), condition: text(pet.condition, '获取条件未提供') })),
    learningAvailable: detail.learningAvailable === true, total: all.length, counts, stale: detail.stale === true,
    fetchedAt: Number.isNaN(stamp.getTime()) ? '时间未提供' : stamp.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }),
    sourceUrl: readableUrl(detail.url), fontUrl: pathToFileURL(templateDir + 'font/AlimamaFangYuanTiVF.ttf').href,
    renderScale: 1, pageCount
  }
  return Array.from({ length: pageCount }, (_, index) => {
    const items = all.slice(index * pageSize, (index + 1) * pageSize)
    const groups = METHODS.map(([source, label]) => ({ source, label, total: counts[source], items: items.filter(pet => pet.source === source) }))
      .filter(group => group.items.length || (index === 0 && group.total === 0 && base.learningAvailable))
    return { ...base, groups, pageNumber: index + 1, shown: items.length, firstPage: index === 0 }
  })
}

export async function renderSkillDex(detail, options = {}) {
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
    const pages = buildSkillPages(detail, options.pageSize ?? 24)
    const cacheImage = options.cacheImage || (await import('../models/skill-dex.js')).cachedSkillImage
    const urls = [...new Set(pages.flatMap(page => [page.icon, ...page.stoneSources.map(pet => pet.icon), ...page.groups.flatMap(group => group.items.map(pet => pet.icon))]).filter(Boolean))]
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
    const jobId = 'skill_' + randomUUID().replaceAll('-', '')
    const result = []
    for (const page of pages) {
      const payload = {
        ...page, icon: images.get(page.icon) || '',
        stoneSources: page.stoneSources.map(pet => ({ ...pet, icon: images.get(pet.icon) || '' })),
        groups: page.groups.map(group => ({ ...group, items: group.items.map(pet => ({ ...pet, icon: images.get(pet.icon) || '' })) })),
        renderScale, tplFile: templateDir + 'skill-dex.html', saveId: jobId + '_' + page.pageNumber, imgType: 'png'
      }
      const image = await screenshot('rocom_skill_dex', payload)
      if (!image) throw new Error('技能详情第 ' + page.pageNumber + ' 页渲染失败')
      result.push(image)
    }
    return result
  } catch (err) {
    const logger = options.logger || globalThis.logger
    logger?.error?.('[rocom] 渲染技能详情失败：', err)
    return null
  }
}
