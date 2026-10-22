import { BaseApp, log } from '../components/index.js'
import { fetchCurrentGoods, fmtLeft } from '../models/merchant.js'
import { renderMerchant } from '../render/merchant-renderer.js'

const pad = (n) => String(n).padStart(2, '0')

export class RocomMerchant extends BaseApp {
  constructor() {
    super({
      name: 'merchant',
      dsc: '洛克王国世界远行商人当前轮次货物',
      rule: [{ reg: '^#?远行商人$', fnc: 'merchant' }]
    })
  }

  async merchant(e) {
    log.d && log.d(`收到命令：${e.msg} 群：${e.group_id}`)
    if (!(await this.checkGroup(e))) {
      log.i(`群 ${e.group_id} 未在放行列表，已忽略`)
      return false
    }

    let data
    try {
      data = await fetchCurrentGoods()
    } catch (err) {
      log.e('远行商人数据抓取失败：', err)
      return e.reply('远行商人数据获取失败了，稍后再试试吧~')
    }

    const now = new Date()
    const extra = {
      leftText: fmtLeft(data.left),
      nextText: fmtLeft(data.next),
      nowText: `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
    }

    log.i(`${data.slot ? data.slot.name : '非营业时间'} 抓取到 ${data.goods.length} 件货物`)
    const img = await renderMerchant({ ...data, ...extra })
    if (img) return e.reply(img)

    log.w('渲染失败，使用文字兜底')
    return e.reply(this.textFallback(data, extra))
  }

  /** 渲染不可用时的文字兜底 */
  textFallback(data, extra) {
    const head = data.slot
      ? `远行商人 ${data.slot.name}（${data.slot.start}-${data.slot.end}，剩余 ${extra.leftText}）`
      : `远行商人未营业，距下一轮 ${extra.nextText}`
    if (!data.goods.length) return head + '\n本轮暂无在售货物'
    const lines = data.goods.map((g) => `· ${g.name}  ${g.price} 洛克贝  限购 ${g.buy_limit || '不限'}`)
    return [head, ...lines].join('\n')
  }
}
