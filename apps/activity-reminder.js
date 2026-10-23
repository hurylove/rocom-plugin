import path from 'node:path'
import { BaseApp, log, config, getBot, isGroupAllowed, dataDir } from '../components/index.js'
import { reloadConfig } from '../components/runtime.js'
import { saveUserConfig } from '../components/config.js'
import { REMINDER_COMMAND_PATTERN, parseReminderCommand, isReminderOperator, resolveReminderTargets, runActivityReminderCycle, readActivityReminderCache, pickReminderGroup, isSendSuccess } from '../models/activity-reminder.js'

const CACHE_FILE = path.join(dataDir, 'activity_cache.json')
const STATE_FILE = path.join(dataDir, 'activity_reminder_state.json')

const groupIdOf = (value) => String(value ?? '').trim()

/** Yunzai 在运行时注入全局 segment；未注入时退回纯文字，不臆造 API。 */
function atAllSegment() {
  try {
    return typeof segment !== 'undefined' && typeof segment.at === 'function' ? segment.at('all') : null
  } catch {
    return null
  }
}

function reminderText(data) {
  const lines = ['【活动到期提醒】']
  for (const item of data.items || []) {
    lines.push(`· ${item.title}（${item.category}）结束前 ${item.hoursBefore}h 提醒`)
    lines.push(`  截止：${item.end}（中国时间），剩余 ${item.leftText}`)
    if (item.rewards) lines.push(`  奖励：${item.rewards}`)
  }
  if (data.nowText) lines.push(`提醒时间 ${data.nowText}`)
  if (data.updatedAt) lines.push(`活动缓存更新 ${data.updatedAt}`)
  return lines.join('\n')
}

/** 每分钟检查活动到期；无到期事项时完全静默。 */
export class RocomActivityReminder extends BaseApp {
  constructor() {
    super({
      name: 'activity-reminder',
      dsc: '活动到期提醒（结束前 24h / 6h 各一次）',
      priority: 5002,
      rule: [{ reg: REMINDER_COMMAND_PATTERN, fnc: 'reminder' }],
      task: [{ cron: '0 * * * * *', name: '活动到期提醒检查', log: false, fnc: () => this.check() }]
    })
  }

  reminderSettings() {
    const reminder = config.activityReminder
    return reminder && typeof reminder === 'object' ? reminder : {}
  }

  /** 命令入口：私聊拒绝，群黑白名单同时约束命令与推送。 */
  async reminder(e) {
    const command = parseReminderCommand(e?.msg)
    if (!command) return false
    if (!e.isGroup) return e.reply('活动提醒设置请在群聊内操作。')
    if (!isGroupAllowed(e.group_id)) return false
    if (command.action === 'status') return this.status(e)
    if (!isReminderOperator(e)) return e.reply('只有主人或本群群主/管理员可以修改活动提醒设置。')
    return command.scope === 'atAll' ? this.toggleAtAll(e, command.action === 'atAllEnable') : this.toggleSubscribe(e, command.action === 'enable')
  }

  status(e) {
    const settings = this.reminderSettings()
    const groupId = groupIdOf(e.group_id)
    const cache = readActivityReminderCache({ cachePath: CACHE_FILE, cacheMaxAgeHours: settings.cacheMaxAgeHours })
    const cacheText = cache.ok
      ? `有效（更新于 ${cache.updatedAtText}）`
      : { missing: '未找到', corrupt: '已损坏', stale: '已过期', future: '时间异常', updatedAt: '缺少更新时间', shape: '格式不符' }[cache.reason] || '不可用'
    const hours = Array.isArray(settings.hoursBefore) && settings.hoursBefore.length ? settings.hoursBefore : [24, 6]
    const lines = [
      `本群活动提醒：${(settings.groups || []).map(groupIdOf).includes(groupId) ? '已开启' : '未开启'}`,
      `提醒阶段：结束前 ${hours.join(' 小时、')} 小时`,
      `@全体成员：${(settings.atAllGroups || []).map(groupIdOf).includes(groupId) ? '已开启' : '未开启'}`,
      `插件总开关：${settings.enable === false ? '已关闭' : '已开启'}`,
      `活动缓存：${cacheText}`
    ]
    return e.reply(lines.join('\n'))
  }

  /** 只改本群相关字段，保留其余配置与内部路由。 */
  persist(patch) {
    const next = saveUserConfig({ activityReminder: patch })
    reloadConfig()
    return next
  }

  toggleSubscribe(e, enable) {
    const settings = this.reminderSettings()
    const groupId = groupIdOf(e.group_id)
    const groups = (settings.groups || []).map(groupIdOf).filter(Boolean)
    const next = enable ? [...new Set([...groups, groupId])] : groups.filter((id) => id !== groupId)
    const patch = { groups: next }
    const selfId = groupIdOf(e.self_id)
    if (enable && selfId) patch.botRoutes = { ...(settings.botRoutes || {}), [groupId]: selfId }
    this.persist(patch)
    if (!enable) return e.reply('已关闭本群活动到期提醒。')
    return e.reply('已开启本群活动到期提醒：结束前 ' + (settings.hoursBefore || [24, 6]).join(' / ') + ' 小时各提醒一次。')
  }

  /** @全体 名单不自动订阅群，只影响已订阅群。 */
  toggleAtAll(e, enable) {
    const settings = this.reminderSettings()
    const groupId = groupIdOf(e.group_id)
    const list = (settings.atAllGroups || []).map(groupIdOf).filter(Boolean)
    const next = enable ? [...new Set([...list, groupId])] : list.filter((id) => id !== groupId)
    this.persist({ atAllGroups: next })
    const subscribed = (settings.groups || []).map(groupIdOf).includes(groupId)
    if (!enable) return e.reply('已关闭本群提醒时 @全体成员。')
    return e.reply(subscribed ? '已开启本群提醒时 @全体成员。' : '已开启本群提醒时 @全体成员，但本群尚未订阅提醒，需先发送 #活动提醒开启。')
  }

  async check() {
    const settings = this.reminderSettings()
    if (settings.enable === false) return
    const targets = resolveReminderTargets({
      groups: settings.groups,
      atAllGroups: settings.atAllGroups,
      botRoutes: settings.botRoutes,
      isAllowed: isGroupAllowed
    })
    if (!targets.length) return
    let result
    try {
      result = await runActivityReminderCycle({
        cachePath: CACHE_FILE,
        statePath: STATE_FILE,
        hoursBefore: settings.hoursBefore,
        cacheMaxAgeHours: settings.cacheMaxAgeHours,
        targets,
        sendReminder: ({ target, data }) => this.deliver(target, data)
      })
    } catch (err) {
      log.e('活动到期提醒检查失败：', err)
      return
    }
    if (result.sent) log.i(`活动到期提醒已发送 ${result.sent} 个群`)
    if (result.failed) log.w(`活动到期提醒发送失败 ${result.failed} 个群`, result.errors)
  }

  /** 同群本次合并成一条消息；@全体失败降级为普通提醒。 */
  async deliver(target, data) {
    const picked = await pickReminderGroup(this.Bot || getBot(), target.groupId, target.routeId)
    if (!picked) return false
    let img = null
    try {
      const { renderActivityReminder } = await import('../render/activity-reminder-renderer.js')
      img = await renderActivityReminder(data)
    } catch (err) {
      log.d('活动提醒渲染不可用，改用文字：', err?.message || err)
    }
    const text = reminderText(data)
    const body = img ? [text, '\n', img] : [text]
    if (target.atAll) {
      const at = atAllSegment()
      if (at) {
        try {
          const response = await picked.group.sendMsg([at, '\n', ...body])
          if (isSendSuccess(response)) return response
          log.d(`群 ${target.groupId} @全体返回失败，降级普通提醒`)
        } catch (err) {
          log.d(`群 ${target.groupId} @全体失败，降级普通提醒：`, err?.message || err)
        }
      }
    }
    return picked.group.sendMsg(body)
  }
}
