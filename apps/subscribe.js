import { BaseApp, log, config } from '../components/index.js'
import { fetchCurrentGoods } from '../models/merchant.js'
import { activeSlot } from '../models/merchant.js'
import { slotKey, alreadyNotified, markNotified, fetchMatched } from '../models/notify.js'
import { renderMerchant } from '../render/merchant-renderer.js'
import { fmtLeft } from '../models/merchant.js'

const pad = (n) => String(n).padStart(2, '0')

/** 远行商人开轮提醒 */
export async function runSubscribeCheck(bot) {
  const s = config.subscribe
  if (!s.enable || !s.groups.length || !s.keywords.length) return

  const now = new Date()
  const slot = activeSlot(now)
  if (!slot) return

  const key = slotKey(now)
  if (await alreadyNotified(key)) return

  let res
  try {
    res = await fetchMatched(fetchCurrentGoods, now)
  } catch (err) {
    log.e('订阅抓取失败：', err)
    return
  }
  // 先标记，避免重试期间并发重复推送
  await markNotified(key)

  if (!res.matched.length) {
    log.i(`${slot.name} 无命中订阅商品`)
    return
  }

  const leftText = fmtLeft(res.data?.left ?? 0)
  const nowText = `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  const img = await renderMerchant({ ...(res.data || {}), slot: res.slot, goods: res.data?.goods || res.goods, leftText, nextText: '', nowText })

  const hits = res.matched.map((g) => g.name).join('、')
  const msg = [`远行商人 ${slot.name} 开轮，命中订阅：${hits}`]

  for (const gid of s.groups) {
    try {
      const group = bot.pickGroup(Number(gid) || gid)
      if (!group) {
        log.w(`群 ${gid} 不可用，跳过`)
        continue
      }
      const payload = s.atAll ? [segment.at('all'), '\n', ...msg] : msg
      try {
        await group.sendMsg(payload)
      } catch (err) {
        // @全体失败（无管理员权限/风控）时降级为普通消息
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
