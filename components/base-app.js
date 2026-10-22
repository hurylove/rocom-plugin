import Puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { templateDir } from './paths.js'
import { config, getBot, isGroupAllowed } from './runtime.js'

export class BaseApp extends plugin {
  constructor({ name, dsc, rule, priority = 5000, event = 'message.group', task = [] }) {
    super({ name: `rocom-${name}`, dsc, event, priority, rule })
    this.config = config
    this.Bot = getBot()
    // Yunzai 加载器会遍历 this.task[].cron，必须始终是数组
    this.task = task
  }

  /** 群开关校验，未放行的群静默退出 */
  async checkGroup(e) {
    if (e.isGroup && !isGroupAllowed(e.group_id)) return false
    return true
  }

  /** 参数解析：去掉命令前缀后按空白切分 */
  args(e, prefixRe) {
    return String(e.msg || '')
      .replace(prefixRe, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
  }

  /** 套 html 模板截图，失败返回 null */
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
