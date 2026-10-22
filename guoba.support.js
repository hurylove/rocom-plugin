import { getConfigData, setConfigData } from './guoba/config-handler.js'
import schemas from './guoba/schemas/schema.js'

export function supportGuoba() {
  return {
    pluginInfo: {
      name: 'rocom-plugin',
      title: '洛克王国世界助手',
      author: 'hurylove',
      link: 'https://github.com/hurylove/rocom-plugin',
      isV2: false,
      isV3: true,
      showInMenu: 'auto',
      description: '洛克王国世界助手：远行商人当前轮次货物查询与开轮订阅提醒。'
    },
    configInfo: {
      schemas,
      getConfigData,
      setConfigData
    }
  }
}
