import { BaseApp, log, config } from '../components/index.js'
import { fetchCurrentGoods, activeSlot, fmtLeft } from '../models/merchant.js'
import { slotKey, groupNotifyKey, alreadyNotified, markNotified, fetchMatched } from '../models/notify.js'
import { isSendSuccess } from '../models/activity-reminder.js'
import { renderMerchant } from '../render/merchant-renderer.js'

const pad = (n) => String(n).padStart(2, '0')

export class RocomSubscribe extends BaseApp {
  constructor() {
    super({
      name: 'subscribe',
      dsc: '远行商人开轮订阅提醒',
      priority: 5001,
      task: [{ cron: '0 * * * * *', name: '开轮订阅检查', log: false, fnc: () => this.check() }]
    })
    this.checking = false
  }

  async sendChecked(group, message) {
    const result = await group.sendMsg(message)
    if (!isSendSuccess(result)) {
      throw new Error(result?.wording || result?.message || '发送接口返回失败')
    }
    return result
  }

  async check() {
    if (this.checking) return
    const s = config.subscribe
    if (!s.enable || !s.groups.length || !s.keywords.length) return

    const now = new Date()
    const slot = activeSlot(now)
    if (!slot) return
    const [sh, sm] = slot.start.split(':').map(Number)
    const startedAt = new Date(now)
    startedAt.setHours(sh, sm, 0, 0)
    if (now - startedAt < Math.max(0, s.delaySeconds) * 1000) return

    const key = slotKey(now)
    const settings = JSON.stringify(s)
    const isCurrent = () => slotKey(new Date()) === key && JSON.stringify(config.subscribe) === settings
    this.checking = true
    try {
      // 旧版标记无法区分成功与空数据，升级时保守跳过该轮，避免意外重发。
      if (await alreadyNotified(key)) {
        if (this.legacySkipped !== key) {
          log.i(slot.name + ' 存在旧版处理标记，本轮不自动重放，新逻辑从下一轮生效')
          this.legacySkipped = key
        }
        return
      }

      const groups = [...new Set(s.groups.map((gid) => String(Number(gid) || gid).trim()).filter(Boolean))]
      const pending = []
      for (const gid of groups) {
        if (!(await alreadyNotified(groupNotifyKey(key, gid)))) pending.push(gid)
      }
      if (!pending.length || !isCurrent()) return

      const res = await fetchMatched(fetchCurrentGoods, now)
      if (!isCurrent()) return
      if (!res.matched.length) {
        const reason = res.goods.length ? '未命中订阅商品' : '暂无本轮在售商品'
        if (this.waiting !== key + reason) {
          log.i(slot.name + ' ' + reason + '，本轮内继续按分钟补查')
          this.waiting = key + reason
        }
        return
      }
      this.waiting = null

      const hits = res.matched.map((g) => g.name).join('、')
      const msg = ['远行商人 ' + slot.name + ' 本轮在售，命中订阅：' + hits]
      const bot = this.Bot || globalThis.Bot
      const delivered = []
      let failed = 0

      for (const gid of pending) {
        if (!isCurrent()) break
        try {
          const group = bot?.pickGroup(Number(gid) || gid)
          if (!group) throw new Error('当前机器人无法访问该群')
          let mode = s.atAll ? 'at_all' : 'plain'
          let result
          let atAllError
          if (s.atAll) {
            try {
              result = await this.sendChecked(group, [segment.at('all'), '\n', ...msg])
            } catch (err) {
              atAllError = err.message
              log.w('群 ' + gid + ' @全体失败，尝试普通提醒：' + atAllError)
              if (!isCurrent()) break
              result = await this.sendChecked(group, [...msg])
              mode = 'fallback'
            }
          } else {
            result = await this.sendChecked(group, [...msg])
          }

          delivered.push({ gid, group })
          try {
            await markNotified(groupNotifyKey(key, gid), {
              mode,
              atAllError,
              messageId: result?.message_id || result?.data?.message_id
            })
          } catch (err) {
            log.w('群 ' + gid + ' 提醒已发送，去重持久化失败，将重试保存：' + err.message)
          }
          log.i('群 ' + gid + ' ' + slot.name + ' 提醒已发送，方式：' + mode)
        } catch (err) {
          failed++
          log.w('群 ' + gid + ' 提醒发送失败，下次检查重试：' + err.message)
        }
      }

      log.i(slot.name + ' 订阅提醒：成功 ' + delivered.length + ' 个群，失败 ' + failed + ' 个群')
      if (!delivered.length || !isCurrent()) return

      // 文字提醒已独立记账，渲染或图片发送失败不能导致再次 @全体。
      let img
      try {
        const renderedAt = new Date()
        img = await renderMerchant({
          ...(res.data || {}),
          slot: res.slot,
          goods: res.data?.goods || res.goods,
          leftText: fmtLeft(res.data?.left ?? 0),
          nextText: '',
          nowText: pad(renderedAt.getMonth() + 1) + '-' + pad(renderedAt.getDate()) + ' ' + pad(renderedAt.getHours()) + ':' + pad(renderedAt.getMinutes())
        })
      } catch (err) {
        log.w(slot.name + ' 订阅图片渲染失败，文字提醒不受影响：' + err.message)
      }
      if (!img) return
      for (const { gid, group } of delivered) {
        if (!isCurrent()) break
        try {
          await this.sendChecked(group, img)
        } catch (err) {
          log.w('群 ' + gid + ' 订阅图片发送失败，不重复文字提醒：' + err.message)
        }
      }
    } catch (err) {
      log.w('商人订阅检查失败，保留待检查状态：' + err.message)
    } finally {
      this.checking = false
    }
  }
}
