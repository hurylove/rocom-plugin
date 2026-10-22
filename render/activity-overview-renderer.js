import Puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { templateDir, config, log } from '../components/index.js'
import { pathToFileURL } from 'node:url'

export async function renderActivityOverview(activity) {
  try {
    return await Puppeteer.screenshot('rocom_activity_overview', {
      tplFile: templateDir + 'activity-overview.html',
      saveId: 'activity-overview',
      activity,
      imgType: 'png',
      renderScale: config.renderScale / 100,
      fontUrl: pathToFileURL(templateDir + 'font/AlimamaFangYuanTiVF.ttf').href
    })
  } catch (err) {
    log.e('活动总览渲染失败：', err)
    return null
  }
}
