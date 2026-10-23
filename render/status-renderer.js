import { pathToFileURL } from 'node:url'
import Puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { templateDir } from '../components/paths.js'
import { config } from '../components/runtime.js'

/** 渲染插件运行状态图；失败返回 null，由调用方退回文字。 */
export async function renderStatus(data) {
  try {
    return await Puppeteer.screenshot('rocom_status', {
      tplFile: templateDir + 'status.html',
      saveId: 'status',
      ...data,
      imgType: 'png',
      renderScale: config.renderScale / 100,
      fontUrl: pathToFileURL(templateDir + 'font/AlimamaFangYuanTiVF.ttf').href
    })
  } catch (err) {
    logger.error('[rocom] 渲染 status 失败：', err)
    return null
  }
}
