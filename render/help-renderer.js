import Puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { templateDir, config, log } from '../components/index.js'
import { pathToFileURL } from 'node:url'
import { helpData } from '../components/help.js'

/** 渲染插件帮助图，失败返回 null */
export async function renderHelp() {
  try {
    return await Puppeteer.screenshot('rocom_help', {
      tplFile: templateDir + 'help.html',
      saveId: 'help',
      ...helpData(),
      imgType: 'png',
      renderScale: config.renderScale / 100,
      fontUrl: pathToFileURL(templateDir + 'font/AlimamaFangYuanTiVF.ttf').href
    })
  } catch (err) {
    log.e('帮助图渲染失败：', err)
    return null
  }
}
