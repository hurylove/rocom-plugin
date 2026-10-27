import { BaseApp, log } from '../components/index.js'
import { getTraitCatalog, getTraitDetail, searchTraits, findTrait } from '../models/trait-dex.js'
import { renderTraitDex } from '../render/trait-dex-renderer.js'

const TEXT_LIMIT = 1800
const USAGE = [
  '【特性图鉴】',
  '· #特性 <名称>：查看主副系别、效果全文与全部携带精灵形态',
  '· #特性搜索 <关键词>：匹配名称、系别或效果，最多显示前 30 条',
  '以上指令均可省略 #；空参数时显示用法。',
  '详情优先精确名称，也支持唯一模糊名称；多候选时请使用完整名称。',
  '例如：#特性 蓄电 / #特性搜索 光',
  '携带精灵以特性详情页为准，缓存过期且更新失败时会给出警告。',
  '数据来自 Wiki（wiki.biligame.com/nrc）。'
].join('\n')

function typeLabel(trait) {
  return [trait.type, trait.secondaryType].filter(Boolean).join('/') || '系别未提供'
}

function traitLine(trait) {
  return '#特性 ' + trait.name + ' — ' + typeLabel(trait)
}

function staleWarning(data) {
  return data.stale ? '⚠ 数据更新失败，正在使用过期缓存' +
    (data.fetchedAt ? '（截至 ' + data.fetchedAt + '）' : '') + '，信息可能已变化。' : ''
}

function formName(record) {
  const name = record.displayName || record.name || '未知精灵'
  return record.formLabel && !name.includes(record.formLabel) ? name + '（' + record.formLabel + '）' : name
}

export class RocomTraitDex extends BaseApp {
  constructor() {
    super({
      name: 'trait-dex',
      dsc: '特性图鉴查询（效果/携带精灵）',
      priority: 5000,
      rule: [
        { reg: '^#?特性搜索\\s*(.*)$', fnc: 'search' },
        { reg: '^#?特性\\s*(.*)$', fnc: 'detail' }
      ]
    })
  }

  async loadCatalog(e) {
    try {
      const catalog = await getTraitCatalog()
      if (!Array.isArray(catalog?.traits)) throw new Error('特性目录数据不可用')
      return catalog
    } catch (err) {
      log.w('[rocom] 特性目录获取失败：', err?.message || err)
      await e.reply('特性图鉴暂时不可用：网络不可用或 Wiki 暂时无法访问，且没有可用的目录缓存，请稍后再试。')
      return null
    }
  }

  async search(e) {
    if (!(await this.checkGroup(e))) return false
    const keyword = String(e.msg || '').replace(/^#?特性搜索\s*/, '').trim()
    if (!keyword) return e.reply('请输入搜索关键词，例如：#特性搜索 光\n' + USAGE)
    const catalog = await this.loadCatalog(e)
    if (!catalog) return true
    const traits = searchTraits(keyword, catalog.traits)
    return this.replyText(e, [
      staleWarning(catalog),
      traits.length ? '找到 ' + traits.length + ' 个特性：' : '没有找到名称、系别或效果包含「' + keyword + '」的特性。',
      ...traits.slice(0, 30).map(traitLine),
      traits.length > 30 ? '（仅显示前 30 条，共 ' + traits.length + ' 条，请缩小关键词范围）' : '',
      '查看详情：复制「#特性 名称」部分发送，不含后面的系别信息。'
    ].filter(Boolean).join('\n'))
  }

  async detail(e) {
    if (!(await this.checkGroup(e))) return false
    const keyword = String(e.msg || '').replace(/^#?特性\s*/, '').trim()
    if (!keyword) return e.reply(USAGE)
    const catalog = await this.loadCatalog(e)
    if (!catalog) return true
    const found = findTrait(keyword, catalog.traits)
    if (found?.trait) return this.renderDetail(e, found.trait, catalog)
    const candidates = found?.candidates || []
    return this.replyText(e, [
      staleWarning(catalog),
      candidates.length ? '匹配到 ' + candidates.length + ' 个特性，请使用完整名称：' :
        '没有找到名称匹配「' + keyword + '」的特性，可先 #特性搜索 ' + keyword,
      ...candidates.map(traitLine),
      candidates.length ? '请复制「#特性 名称」部分发送，不含后面的系别信息。' : ''
    ].filter(Boolean).join('\n'))
  }

  async renderDetail(e, trait, catalog) {
    let detail
    try {
      detail = await getTraitDetail(trait)
      if (!detail) throw new Error('特性详情数据不可用')
    } catch (err) {
      log.w('[rocom] 特性详情获取失败：', err?.message || err)
      return e.reply([
        staleWarning(catalog),
        '「' + trait.name + '」详情暂时不可用：网络不可用或 Wiki 暂时无法访问，且没有可用的详情缓存，请稍后再试。'
      ].filter(Boolean).join('\n'))
    }
    const data = { ...trait, ...detail }
    const warning = staleWarning(detail.stale ? detail : catalog)
    let images = null
    try {
      images = await renderTraitDex(data)
    } catch (err) {
      log.w('[rocom] 特性详情图渲染失败：', err?.message || err)
    }
    if (Array.isArray(images) && images.length) {
      if (warning) await e.reply(warning)
      for (const image of images) await e.reply(image)
      return true
    }
    return this.replyText(e, [warning, this.detailText(data)].filter(Boolean).join('\n'))
  }

  detailText(detail) {
    const owners = Array.isArray(detail.owners) ? detail.owners : []
    const total = detail.total == null || Number.isNaN(Number(detail.total)) ? owners.length : Number(detail.total)
    const lines = [
      '【' + detail.name + '】',
      '系别：' + typeLabel(detail),
      '效果：' + (detail.description || '暂无说明'),
      '携带精灵（共 ' + total + ' 个精灵形态，以详情页为准）：'
    ]
    if (!owners.length) lines.push('暂无记录')
    for (const [index, owner] of owners.entries()) {
      lines.push((index + 1) + '. ' + [
        formName(owner),
        owner.number ? '编号 ' + owner.number : '',
        owner.types?.join('/')
      ].filter(Boolean).join(' · '))
      if (owner.url) lines.push('  来源：' + owner.url)
    }
    lines.push('来源：' + (detail.url || 'Wiki（地址未提供）'))
    if (detail.fetchedAt) lines.push('数据截至：' + detail.fetchedAt)
    lines.push('（图片未能生成，以上为完整文字详情）')
    return lines.join('\n')
  }

  async replyText(e, text) {
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + TEXT_LIMIT, text.length)
      if (end < text.length) {
        const newline = text.lastIndexOf('\n', end - 1)
        if (newline >= start) end = newline + 1
        else if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--
      }
      await e.reply(text.slice(start, end))
      start = end
    }
    return true
  }
}
