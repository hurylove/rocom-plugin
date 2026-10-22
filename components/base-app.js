import Puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { templateDir } from './paths.js'
import { config, getBot, isGroupAllowed } from './runtime.js'

export class BaseApp extends plugin {
  constructor({ name, dsc, rule, priority = 5000, event = 'message.group' }) {
    super({ name: `rocom-${name}`, dsc, event, priority, rule })
    this.config = config
    this.Bot = getBot()
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

  /**
   * 套 html 模板截图
   * @param {string} name 模板名（resources 下，不含 .html）
   * @param {object} data 模板数据
   * @param {string} saveId 图片缓存名
   * @returns {Promise<object|null>} segment 或 null
   */
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
