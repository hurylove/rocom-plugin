import { BaseApp, log } from '../components/index.js'
import { getSeasonData } from '../models/season-shiny.js'
import { renderSeasonShiny } from '../render/season-shiny-renderer.js'

export class RocomSeasonShiny extends BaseApp {
  constructor() {
    super({
      name: 'season-shiny',
      dsc: '洛克王国世界赛季有异色初始精灵总图',
      priority: 5000,
      rule: [{ reg: '^#?(?:S|s)[1-4]异色$', fnc: 'season' }]
    })
  }

  async season(e) {
    if (!(await this.checkGroup(e))) return false
    const id = String(e.msg).trim().replace(/^#?/i, '').replace(/异色$/i, '').toUpperCase()
    const season = getSeasonData(id)
    if (!season) return false

    log.i(`正在渲染 ${id} 有异色初始精灵，共 ${season.pets.length} 条`)
    const img = await renderSeasonShiny(season)
    if (img) return e.reply(img)

    log.w(`${id} 异色总图渲染失败，退回文字`)
    return e.reply(this.textFallback(season))
  }

  textFallback(season) {
    const lines = season.pets.map((pet) => `· ${pet.number} ${pet.name}（${pet.types.join('/')}）`)
    return [`${season.id} ${season.name} · 有异色 · 进化位置：初始`, ...lines].join('\n')
  }
}
