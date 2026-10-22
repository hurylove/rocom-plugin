import Puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { templateDir, config, log } from '../components/index.js'
import { pathToFileURL } from 'node:url'

const base = () => ({
  imgType: 'png',
  renderScale: config.renderScale / 100,
  fontUrl: pathToFileURL(templateDir + 'font/AlimamaFangYuanTiVF.ttf').href
})

export async function renderTypeChart(data) {
  try {
    return await Puppeteer.screenshot('rocom_type_chart', {
      tplFile: templateDir + 'type-chart.html',
      saveId: 'type-chart',
      data,
      ...base()
    })
  } catch (err) {
    log.e('系别克制渲染失败：', err)
    return null
  }
}

export async function renderTypeTable(data) {
  try {
    return await Puppeteer.screenshot('rocom_type_table', {
      tplFile: templateDir + 'type-table.html',
      saveId: 'type-table',
      data,
      ...base()
    })
  } catch (err) {
    log.e('克制总表渲染失败：', err)
    return null
  }
}
