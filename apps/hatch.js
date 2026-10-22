import { BaseApp, log } from '../components/index.js'
import { parseEggInput, queryHatch } from '../models/hatch.js'
import { renderHatch } from '../render/hatch-renderer.js'

export class RocomHatch extends BaseApp {
  constructor() {
    super({
      name: 'hatch',
      dsc: '洛克王国世界孵蛋查询（按蛋体尺寸与重量反推可孵精灵）',
      priority: 5000,
      rule: [{ reg: '^#?孵蛋查询', fnc: 'hatch' }]
    })
  }

  async hatch(e) {
    if (!(await this.checkGroup(e))) return false

    const input = this.args(e, /^#?孵蛋查询/)
    const egg = parseEggInput(input.join(' '))
    if (!egg) {
      return e.reply('用法：#孵蛋查询 <尺寸m> <重量kg>\n例如：#孵蛋查询 0.56 20.504\n数值请用蛋详情里的原始数字，单位必须是米和千克。')
    }

    let result
    try {
      result = await queryHatch(egg.size, egg.weight)
    } catch (err) {
      log.e('孵蛋查询失败：', err)
      return e.reply('孵蛋查询暂时不可用，请稍后再试~')
    }

    if (!result.total) {
      return e.reply(`没有命中候选精灵。\n蛋体：${egg.size} m / ${egg.weight} kg\n请确认单位为 m 与 kg，并尽量输入蛋详情里的原始数值。`)
    }

    log.i(`${egg.size}m/${egg.weight}kg 命中 ${result.total} 只候选`)
    const img = await renderHatch(result)
    if (img) return e.reply(img)

    log.w('孵蛋查询渲染失败，退回文字')
    return e.reply(this.textFallback(result))
  }

  textFallback(result) {
    const lines = result.cards.map(
      (card, i) => `${i + 1}. ${card.name} ${card.number}  ${card.probText}  ${card.sizeRange} / ${card.weightRange}`
    )
    return [`孵蛋查询：${result.size} m / ${result.weight} kg`, ...lines].join('\n')
  }
}
