import Puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { templateDir, pluginDir, config, log } from '../components/index.js'
import { pathToFileURL } from 'node:url'

const tplFile = pluginDir + 'resources/merchant.html'

/** 渲染远行商人卡片，失败返回 null */
export async function renderMerchant(data) {
  try {
    return await Puppeteer.screenshot('rocom_merchant', {
      tplFile,
      saveId: 'merchant',
      ...data,
      imgType: 'png',
      renderScale: config.renderScale / 100,
      fontUrl: pathToFileURL(templateDir + 'font/AlimamaFangYuanTiVF.ttf').href
    })
  } catch (err) {
    log.e('远行商人渲染失败：', err)
    return null
  }
}
