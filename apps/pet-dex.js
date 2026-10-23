import { BaseApp, log } from '../components/index.js'
import { searchPets, findPet, findPetByNumber, getPetDetail, buildPetDexData } from '../models/pet-dex.js'
import { renderPetDex } from '../render/pet-dex-renderer.js'

/** 精灵图鉴查询：搜索、详情（普通/异色双图）、编号定位。 */
export class RocomPetDex extends BaseApp {
  constructor() {
    super({
      name: 'pet-dex',
      dsc: '精灵图鉴查询（详情含种族值/技能/进化链）',
      priority: 5000,
      rule: [
        { reg: '^#?精灵搜索\s*(.+)$', fnc: 'search' },
        { reg: '^#?精灵编号\s*(.+)$', fnc: 'byNumber' },
        { reg: '^#?精灵异色\s*(.+)$', fnc: 'detailShiny' },
        { reg: '^#?精灵图鉴?$', fnc: 'usage' },
        { reg: '^#?精灵\s*(.+)$', fnc: 'detail' }
      ]
    })
  }

  usage(e) {
    return e.reply([
      '【精灵图鉴】',
      '· #精灵 <名称>：查看精灵详情（种族值/基础信息/进化链/技能表）',
      '· #精灵异色 <名称>：详情立绘优先显示异色形态',
      '· #精灵搜索 <关键词>：按名称模糊搜索',
      '· #精灵编号 <编号>：按图鉴编号查询',
      '首次查询会从 Wiki 抓取并缓存，之后秒出。'
    ].join('\n'))
  }

  async search(e) {
    if (!(await this.checkGroup(e))) return false
    const keyword = this.args(e, /^#?精灵搜索\s*/)[0]
    if (!keyword) return e.reply('请输入要搜索的名称关键词，例如：#精灵搜索 迪莫')
    const pets = searchPets(keyword)
    if (!pets.length) return e.reply(`没有找到名称包含「${keyword}」的精灵。`)
    const lines = pets.slice(0, 30).map((p) => `· ${p.name}（${p.number} ${p.types.join('/')}${p.shiny ? ' ·有异色' : ''}）`)
    const more = pets.length > 30 ? `` : ''
    return e.reply([`找到 ${pets.length} 只精灵：`, ...lines, pets.length > 30 ? `（仅显示前 30 只）` : ''].filter(Boolean).join('\n'))
  }

  async byNumber(e) {
    if (!(await this.checkGroup(e))) return false
    const number = this.args(e, /^#?精灵编号\s*/)[0]
    const found = findPetByNumber(number)
    if (!found) return e.reply(`没有找到编号 ${number} 的精灵。`)
    if (found.candidates) return this.pickCandidate(e, found.candidates)
    return this.renderDetail(e, found, false)
  }

  async detail(e) {
    if (!(await this.checkGroup(e))) return false
    const keyword = this.args(e, /^#?精灵\s*/)[0]
    if (!keyword) return this.usage(e)
    const found = findPet(keyword)
    if (!found) return e.reply(`没有找到名称包含「${keyword}」的精灵，可先 #精灵搜索 ${keyword}`)
    if (found.candidates) return this.pickCandidate(e, found.candidates)
    return this.renderDetail(e, found, false)
  }

  async detailShiny(e) {
    if (!(await this.checkGroup(e))) return false
    const keyword = this.args(e, /^#?精灵异色\s*/)[0]
    const found = findPet(keyword)
    if (!found) return e.reply(`没有找到名称包含「${keyword}」的精灵，可先 #精灵搜索 ${keyword}`)
    if (found.candidates) return this.pickCandidate(e, found.candidates)
    if (!found.artShiny) return e.reply(`${found.name} 暂无异色形态。`)
    return this.renderDetail(e, found, true)
  }

  pickCandidate(e, candidates) {
    const lines = candidates.map((p) => `· #精灵 ${p.name}（${p.number} ${p.types.join('/')}${p.formLabel ? ' ' + p.formLabel : ''}）`)
    return e.reply(['该关键词对应多只精灵，请指定完整名称：', ...lines].join('\n'))
  }

  async renderDetail(e, pet, shinyFirst) {
    let detail = null
    try {
      detail = await getPetDetail(pet)
    } catch (err) {
      log.w('[rocom] 精灵详情抓取失败：', err?.message || err)
      return e.reply(`抓取 ${pet.name} 的详情页失败，请稍后再试。`)
    }
    if (!detail) return e.reply(`未能获取 ${pet.name} 的详情数据。`)
    let img = null
    try {
      const data = await buildPetDexData(pet, detail, { shinyFirst })
      img = await renderPetDex(data)
    } catch (err) {
      log.w('[rocom] 精灵详情图渲染失败：', err?.message || err)
    }
    if (img) return e.reply(img)
    return e.reply(this.detailText(pet, detail))
  }

  detailText(pet, detail) {
    const lines = [`【${pet.name}】编号 ${pet.number} · ${pet.types.join('/')}系`]
    if (pet.formLabel) lines.push('形态：' + pet.formLabel)
    if (pet.season !== 'none' && pet.season) lines.push('赛季：' + pet.season)
    if (pet.artShiny) lines.push('异色：有')
    for (const s of detail.stats || []) lines.push(`${s.name} ${s.value}`)
    for (const p of detail.pills || []) lines.push(`${p.key}：${p.value}`)
    for (const b of detail.branches || []) lines.push(`进化：${b.nodes.map((n) => n.name + (n.current ? '（当前）' : '')).join(' → ')}`)
    const skills = detail.skills || []
    if (skills.length) lines.push(`技能 ${skills.length} 个：${skills.map((s) => s.name).join('、')}`)
    lines.push('（图片渲染失败，文字兜底）')
    return lines.join('\n')
  }
}
