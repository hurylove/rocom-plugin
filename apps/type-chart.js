import { BaseApp, log } from '../components/index.js'
import { parseTypes, queryTypes, queryFullChart, TYPES } from '../models/type-chart.js'
import { renderTypeChart, renderTypeTable } from '../render/type-chart-renderer.js'

export class RocomTypeChart extends BaseApp {
  constructor() {
    super({
      name: 'type-chart',
      dsc: '洛克王国世界系别克制查询',
      priority: 5000,
      rule: [
        { reg: '^#?克制表$', fnc: 'table' },
        { reg: '^#?克制', fnc: 'chart' }
      ]
    })
  }

  async chart(e) {
    if (!(await this.checkGroup(e))) return false

    const input = this.args(e, /^#?克制/)
    const types = parseTypes(input.join(' '))
    if (!types.length) {
      return e.reply(`请指定系别，例如：#克制 火  或  #克制 火 水\n可用：${TYPES.join(' ')}`)
    }

    let data
    try {
      data = await queryTypes(types)
    } catch (err) {
      log.e('系别克制计算失败：', err)
      return e.reply('系别克制查询暂时不可用，请稍后再试~')
    }

    log.i(`${types.join('+')} 系别克制查询`)
    const img = await renderTypeChart(data)
    if (img) return e.reply(img)

    log.w('系别克制渲染失败，退回文字')
    return e.reply(this.textFallback(data))
  }

  async table(e) {
    if (!(await this.checkGroup(e))) return false
    let data
    try {
      data = await queryFullChart()
    } catch (err) {
      log.e('克制总表生成失败：', err)
      return e.reply('克制总表暂时不可用，请稍后再试~')
    }
    log.i('渲染系别克制总表')
    const img = await renderTypeTable(data)
    if (img) return e.reply(img)
    return e.reply('克制总表渲染失败，请稍后再试~')
  }

  textFallback(data) {
    const lines = [`系别克制：${data.types.join(' + ')}`]
    const push = (title, groups) => {
      const parts = []
      if (groups.x4.length) parts.push(`4× ${groups.x4.map((x) => x.type).join(' ')}`)
      if (groups.x2.length) parts.push(`2× ${groups.x2.map((x) => x.type).join(' ')}`)
      if (groups.x05.length) parts.push(`0.5× ${groups.x05.map((x) => x.type).join(' ')}`)
      if (groups.x025.length) parts.push(`0.25× ${groups.x025.map((x) => x.type).join(' ')}`)
      lines.push(`${title}：${parts.length ? parts.join('｜') : '均为 1×'}`)
    }
    push('进攻', data.attack)
    push('防守', data.defend)
    return lines.join('\n')
  }
}
