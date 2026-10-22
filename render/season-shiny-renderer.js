import Puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { templateDir, config, log } from '../components/index.js'
import { pathToFileURL } from 'node:url'

/** 渲染赛季异色总图，失败返回 null */
export async function renderSeasonShiny(season) {
  try {
    return await Puppeteer.screenshot(`rocom_season_${season.id.toLowerCase()}_shiny`, {
      tplFile: templateDir + 'season-shiny.html',
      saveId: `${season.id.toLowerCase()}-shiny`,
      season,
      imgType: 'png',
      renderScale: config.renderScale / 100,
      fontUrl: pathToFileURL(templateDir + 'font/AlimamaFangYuanTiVF.ttf').href
    })
  } catch (err) {
    log.e('赛季异色总图渲染失败：', err)
    return null
  }
}
