import { BaseApp, log } from '../components/index.js'
import { displayName, searchPets, findPet, findPetByNumber, getPetDetail, buildPetDexData } from '../models/pet-dex.js'
import { renderPetDex } from '../render/pet-dex-renderer.js'

/** 精灵图鉴查询：搜索、详情、编号定位。 */
export class RocomPetDex extends BaseApp {
  constructor() {
    super({
      name: 'pet-dex',
      dsc: '精灵图鉴查询（详情含种族值/技能/进化链）',
      priority: 5000,
      rule: [
        { reg: '^#?精灵搜索\\s*(.+)$', fnc: 'search' },
        { reg: '^#?精灵编号\\s*(.+)$', fnc: 'byNumber' },
        { reg: '^#?精灵图鉴?$', fnc: 'usage' },
        { reg: '^#?精灵\\s*(.+)$', fnc: 'detail' }
      ]
    })
  }

  usage(e) {
    return e.reply([
      '【精灵图鉴】',
      '· #精灵 <名称>：查看精灵详情（种族值/基础信息/进化链/技能表）',
      '· #精灵搜索 <关键词>：按名称模糊搜索',
      '· #精灵编号 <编号>：按图鉴编号查询',
      '同名多形态请用「名称（形态）」指定，例如：#精灵 雪绒鸟（春天的样子）',
      '首次查询会从 Wiki 抓取并缓存，之后秒出。'
    ].join('\\n'))
  }

  async search(e) {
    if (!(await this.checkGroup(e))) return false
    const keyword = this.args(e, /^#?精灵搜索\s*/)[0]
    if (!keyword) return e.reply('请输入要搜索的名称关键词，例如：#精灵搜索 迪莫')
    const pets = searchPets(keyword)
    if (!pets.length) return e.reply(`没有找到名称包含「${keyword}」的精灵。`)
    const lines = pets.map((p) => `· ${displayName(p)} — ${p.number} ${p.types.join('/')}${p.shiny ? ' 有异色' : ''}`)
    return e.reply([
      `找到 ${pets.length} 条精灵形态：`,
      ...lines.slice(0, 30),
      pets.length > 30 ? `（仅显示前 30 条，共 ${pets.length} 条）` : '',
      '查看详情：#精灵 <名称>'
    ].filter(Boolean).join('\\n'))
  }

  async byNumber(e) {
    if (!(await this.checkGroup(e))) return false
    const number = this.args(e, /^#?精灵编号\s*/)[0]
    const found = findPetByNumber(number)
    if (!found) return e.reply(`没有找到编号 ${number} 的精灵。`)
    if (found.candidates) return this.pickCandidate(e, found)
    return this.renderDetail(e, found)
  }

  async detail(e) {
    if (!(await this.checkGroup(e))) return false
    const keyword = this.args(e, /^#?精灵\s*/)[0]
    if (!keyword || !keyword.trim()) return this.usage(e)
    const found = findPet(keyword)
    if (!found) return e.reply(`没有找到名称包含「${keyword}」的精灵，可先 #精灵搜索 ${keyword}`)
    if (found.candidates) return this.pickCandidate(e, found)
    return this.renderDetail(e, found)
  }

  pickCandidate(e, found) {
    const candidates = found.candidates
    const sameName = new Set(candidates.map((p) => p.name)).size === 1
    const head = sameName
      ? `${candidates[0].name} 有 ${found.total || candidates.length} 个形态，请指定其中一个：`
      : `匹配到 ${found.total || candidates.length} 条，请用完整名称：`
    const lines = candidates.map((p) => `· #精灵 ${displayName(p)}`)
    return e.reply([head, ...lines].join('\\n'))
  }

  async renderDetail(e, pet) {
    let detail = null
    try {
      detail = await getPetDetail(pet)
    } catch (err) {
      log.w('[rocom] 精灵详情抓取失败：', err?.message || err)
      return e.reply(`抓取 ${displayName(pet)} 的详情页失败，请稍后再试。`)
    }
    if (!detail) return e.reply(`未能获取 ${displayName(pet)} 的详情数据。`)
    let img = null
    try {
      img = await renderPetDex(await buildPetDexData(pet, detail))
    } catch (err) {
      log.w('[rocom] 精灵详情图渲染失败：', err?.message || err)
    }
    if (img) return e.reply(img)
    return e.reply(this.detailText(pet, detail))
  }

  detailText(pet, detail) {
    const lines = [`【${displayName(pet)}】编号 ${pet.number} · ${pet.types.join('/')}系`]
    if (pet.season && pet.season !== 'none') lines.push('赛季：' + pet.season)
    if (pet.artShiny) lines.push('异色：有')
    for (const s of detail.stats || []) lines.push(`${s.name} ${s.value}`)
    for (const p of detail.pills || []) lines.push(`${p.key}：${p.value}`)
    for (const b of detail.branches || []) lines.push(`进化：${b.nodes.map((n) => n.name + (n.current ? '（当前）' : '')).join(' → ')}`)
    const skills = detail.skills || []
    if (skills.length) lines.push(`技能 ${skills.length} 个：${skills.map((s) => s.name).join('、')}`)
    lines.push('（图片渲染失败，文字兜底）')
    return lines.join('\\n')
  }
}
