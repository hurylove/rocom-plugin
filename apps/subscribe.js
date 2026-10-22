import { BaseApp, log, config } from '../components/index.js'
import { fetchCurrentGoods, activeSlot, fmtLeft } from '../models/merchant.js'
import { slotKey, alreadyNotified, markNotified, fetchMatched } from '../models/notify.js'
import { renderMerchant } from '../render/merchant-renderer.js'

const pad = (n) => String(n).padStart(2, '0')

/** 每分钟检查一次是否到了开轮窗口，到点才真正抓取 */
export class RocomSubscribe extends BaseApp {
  constructor() {
    super({
      name: 'subscribe',
      dsc: '远行商人开轮订阅提醒',
      priority: 5001,
      task: [{ cron: '0 * * * * *', name: '开轮订阅检查', fnc: () => this.check() }]
    })
  }

  async check() {
    const s = config.subscribe
    if (!s.enable || !s.groups.length || !s.keywords.length) return

    const now = new Date()
    const slot = activeSlot(now)
    if (!slot) return

    // 开轮后延迟窗口内才执行：在第 delaySeconds 所在的那一分钟触发一次
    const [sh, sm] = slot.start.split(':').map(Number)
    const target = sh * 60 + sm + Math.floor(s.delaySeconds / 60)
    const cur = now.getHours() * 60 + now.getMinutes()
    if (cur !== target) return

    const key = slotKey(now)
    if (await alreadyNotified(key)) return
    await markNotified(key)

    let res
    try {
      res = await fetchMatched(fetchCurrentGoods, now)
    } catch (err) {
      log.e('订阅抓取失败：', err)
      return
    }
    if (!res.matched.length) {
      log.i(`${slot.name} 无命中订阅商品`)
      return
    }

    const nowText = `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
    const img = await renderMerchant({
      ...(res.data || {}),
      slot: res.slot,
      goods: res.data?.goods || res.goods,
      leftText: fmtLeft(res.data?.left ?? 0),
      nextText: '',
      nowText
    })

    const hits = res.matched.map((g) => g.name).join('、')
    const msg = [`远行商人 ${slot.name} 开轮，命中订阅：${hits}`]
    const bot = this.Bot || globalThis.Bot

    for (const gid of s.groups) {
      try {
        const group = bot.pickGroup(Number(gid) || gid)
        if (!group) {
          log.w(`群 ${gid} 不可用，跳过`)
          continue
        }
        try {
          await group.sendMsg(s.atAll ? [segment.at('all'), '\n', ...msg] : msg)
        } catch (err) {
          log.w(`群 ${gid} @全体失败，降级发送：${err.message}`)
          await group.sendMsg(msg)
        }
        if (img) await group.sendMsg(img)
      } catch (err) {
        log.e(`群 ${gid} 推送失败：`, err)
      }
    }
    log.i(`${slot.name} 订阅提醒已推送 ${s.groups.length} 个群`)
  }
}
