import Puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { templateDir, config, log } from '../components/index.js'
import { pathToFileURL } from 'node:url'

export async function renderHatch(result) {
  try {
    return await Puppeteer.screenshot('rocom_hatch', {
      tplFile: templateDir + 'hatch.html',
      saveId: 'hatch',
      result,
      imgType: 'png',
      renderScale: config.renderScale / 100,
      fontUrl: pathToFileURL(templateDir + 'font/AlimamaFangYuanTiVF.ttf').href
    })
  } catch (err) {
    log.e('孵蛋查询渲染失败：', err)
    return null
  }
}
