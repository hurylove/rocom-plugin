import Puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { templateDir } from './paths.js'
import { config, getBot, isGroupAllowed } from './runtime.js'

/**
 * 基类。
 * 注意：本模块在 index.js 的动态 import 里被加载，此时 Yunzai 已把 `plugin` 注入 globalThis，
 * 因此可以直接 extends plugin。
 */
export class BaseApp extends plugin {
  constructor({ name, dsc, rule, priority = 5000, task = [] }) {
    super({
      name: `rocom-${name}`,
      dsc,
      priority,
      rule,
      // Yunzai filtEvent: eventMap.message = [post_type, message_type, sub_type]
      // event='message' 时 mappedEvent.join('.') === e.post_type === 'message'，群聊私聊都命中。
      // 留空会让 filtEvent 直接 return false，导致命令永远收不到。
      event: 'message'
    })
    this.config = config
    this.Bot = getBot()
    // Yunzai 加载器会遍历 this.task[].cron，必须是数组
    this.task = task
  }

  async checkGroup(e) {
    if (e.isGroup && !isGroupAllowed(e.group_id)) return false
    return true
  }

  args(e, prefixRe) {
    return String(e.msg || '')
      .replace(prefixRe, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
  }

  async render(name, data = {}, saveId = name) {
    try {
      return await Puppeteer.screenshot(`rocom_${saveId}`, {
        tplFile: templateDir + name + '.html',
        saveId,
        ...data
      })
    } catch (err) {
      logger.error(`[rocom] 渲染 ${name} 失败：`, err)
      return null
    }
  }
}
