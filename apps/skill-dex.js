import { BaseApp, log } from '../components/index.js'
import { getSkillCatalog, searchSkills, findSkill, getSkillDetail } from '../models/skill-dex.js'
import { renderSkillDex } from '../render/skill-dex-renderer.js'

const TEXT_LIMIT = 1800
const LEARNING_SOURCES = { default: '自学', blood: '血脉', stone: '技能石' }
const USAGE = [
  '【技能图鉴】',
  '· #技能 <名称>：查看属性、威力、耗能、效果、技能石获取与全部可学习精灵形态',
  '· #技能搜索 <关键词>：匹配名称、描述或标签，最多显示前 30 条',
  '以上指令均可省略 #；空参数时显示用法。',
  '详情优先精确名称，也支持唯一模糊名称；多候选时请使用完整名称。',
  '例如：#技能 打喷嚏 / #技能搜索 冻结',
  '数据来自 Wiki，缓存过期且更新失败时会给出警告。'
].join('\n')

function skillLine(skill) {
  return '#技能 ' + skill.name + ' — ' + [skill.type, skill.category].filter(Boolean).join('/') +
    ' · 威力 ' + (skill.power ?? '—') + ' · 耗能 ' + (skill.energy ?? '—')
}

function staleWarning(data) {
  return data.stale ? '⚠ 数据更新失败，正在使用过期缓存' +
    (data.fetchedAt ? '（截至 ' + data.fetchedAt + '）' : '') + '，信息可能已变化。' : ''
}

function formName(record) {
  const name = record.displayName || record.name || '未知精灵'
  return record.formLabel && !name.includes(record.formLabel) ? name + '（' + record.formLabel + '）' : name
}

export class RocomSkillDex extends BaseApp {
  constructor() {
    super({
      name: 'skill-dex',
      dsc: '技能图鉴查询（效果/技能石/全部学习形态）',
      priority: 5000,
      rule: [
        { reg: '^#?技能搜索\\s*(.*)$', fnc: 'search' },
        { reg: '^#?技能\\s*(.*)$', fnc: 'detail' }
      ]
    })
  }

  async loadCatalog(e) {
    try {
      const catalog = await getSkillCatalog()
      if (!Array.isArray(catalog?.skills)) throw new Error('技能目录数据不可用')
      return catalog
    } catch (err) {
      log.w('[rocom] 技能目录获取失败：', err?.message || err)
      await e.reply('技能图鉴暂时不可用：网络不可用或 Wiki 暂时无法访问，且没有可用的目录缓存，请稍后再试。')
      return null
    }
  }

  async search(e) {
    if (!(await this.checkGroup(e))) return false
    const keyword = String(e.msg || '').replace(/^#?技能搜索\s*/, '').trim()
    if (!keyword) return e.reply('请输入搜索关键词，例如：#技能搜索 冻结\n' + USAGE)
    const catalog = await this.loadCatalog(e)
    if (!catalog) return true
    const skills = searchSkills(keyword, catalog.skills)
    return this.replyText(e, [
      staleWarning(catalog),
      skills.length ? '找到 ' + skills.length + ' 个技能：' : '没有找到名称、描述或标签包含「' + keyword + '」的技能。',
      ...skills.slice(0, 30).map(skillLine),
      skills.length > 30 ? '（仅显示前 30 条，共 ' + skills.length + ' 条，请缩小关键词范围）' : '',
      '查看详情：复制「#技能 名称」部分发送，不含后面的属性信息。'
    ].filter(Boolean).join('\n'))
  }

  async detail(e) {
    if (!(await this.checkGroup(e))) return false
    const keyword = String(e.msg || '').replace(/^#?技能\s*/, '').trim()
    if (!keyword) return e.reply(USAGE)
    const catalog = await this.loadCatalog(e)
    if (!catalog) return true
    const found = findSkill(keyword, catalog.skills)
    if (found?.skill) return this.renderDetail(e, found.skill, catalog)
    const candidates = found?.candidates || []
    return this.replyText(e, [
      staleWarning(catalog),
      candidates.length ? '匹配到 ' + candidates.length + ' 个技能，请使用完整名称：' :
        '没有找到名称匹配「' + keyword + '」的技能，可先 #技能搜索 ' + keyword,
      ...candidates.map(skillLine),
      candidates.length ? '请复制「#技能 名称」部分发送，不含后面的属性信息。' : ''
    ].filter(Boolean).join('\n'))
  }

  async renderDetail(e, skill, catalog) {
    let detail
    try {
      detail = await getSkillDetail(skill)
      if (!detail) throw new Error('技能详情数据不可用')
    } catch (err) {
      log.w('[rocom] 技能详情获取失败：', err?.message || err)
      return e.reply([
        staleWarning(catalog),
        '「' + skill.name + '」详情暂时不可用：网络不可用或 Wiki 暂时无法访问，且没有可用的详情缓存，请稍后再试。'
      ].filter(Boolean).join('\n'))
    }
    const data = { ...skill, ...detail }
    const warning = staleWarning(detail.stale ? detail : catalog)
    let images = null
    try {
      images = await renderSkillDex(data)
    } catch (err) {
      log.w('[rocom] 技能详情图渲染失败：', err?.message || err)
    }
    if (Array.isArray(images) && images.length) {
      if (warning) await e.reply(warning)
      for (const image of images) await e.reply(image)
      return true
    }
    return this.replyText(e, [warning, this.detailText(data)].filter(Boolean).join('\n'))
  }

  detailText(detail) {
    const lines = [
      '【' + detail.name + '】',
      '属性：' + (detail.type || '—') + ' · 分类：' + (detail.category || '—'),
      '威力：' + (detail.power ?? '—') + ' · 耗能：' + (detail.energy ?? '—'),
      '效果：' + (detail.description || '暂无说明')
    ]
    if (detail.season && detail.season !== 'none') lines.push('赛季：' + detail.season)
    if (detail.tags?.length) lines.push('标签：' + detail.tags.join('、'))
    lines.push('关联机制：')
    for (const mechanic of detail.relatedMechanics || []) {
      lines.push('· ' + mechanic.name + (mechanic.url ? ' — ' + mechanic.url : ''))
    }
    if (!detail.relatedMechanics?.length) lines.push('暂无记录')
    lines.push('技能石获取：')
    for (const source of detail.stoneSources || []) {
      lines.push('· ' + formName(source) + '：' + (source.condition || '未注明获取条件'))
      if (source.url) lines.push('  来源：' + source.url)
    }
    if (!detail.stoneSources?.length) lines.push('暂无记录')
    if (detail.learningAvailable === false) lines.push('该页面暂未提供学习数据（不表示没有可学习精灵）。')
    for (const [key, label] of Object.entries(LEARNING_SOURCES)) {
      const learners = detail.learners?.[key] || []
      const count = detail.learningAvailable === false && !learners.length ? '学习数据未提供' : learners.length + ' 条形态记录'
      lines.push(label + '（' + count + '）：')
      if (!learners.length) lines.push(detail.learningAvailable === false ? '未提供数据' : '无')
      for (const [index, learner] of learners.entries()) {
        const level = learner.level ? (/^\d+$/.test(learner.level) ? 'Lv' + learner.level : learner.level) : ''
        lines.push((index + 1) + '. ' + [
          formName(learner),
          learner.number ? '编号 ' + learner.number : '',
          learner.types?.join('/'),
          level,
          '学习来源：' + (LEARNING_SOURCES[learner.source] || learner.source || label)
        ].filter(Boolean).join(' · '))
        if (learner.url) lines.push('  来源：' + learner.url)
      }
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
