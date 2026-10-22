export default [
  { component: 'SOFT_GROUP_BEGIN', label: '远行商人订阅' },

  { component: 'Divider', label: '开关' },
  {
    field: 'subscribeEnable',
    label: '启用开轮订阅提醒',
    component: 'Switch',
    componentProps: { defaultValue: false },
    bottomHelpMessage: '开启后，每轮开始时自动抓取货物并比对关键词，命中则在订阅群里推送提醒。'
  },

  { component: 'Divider', label: '推送目标' },
  {
    field: 'subscribeGroups',
    label: '推送群聊',
    component: 'GSelectGroup',
    componentProps: { placeholder: '选择要接收提醒的群' },
    bottomHelpMessage: '命中订阅关键词时，向这些群推送提醒和货物图片。'
  },
  {
    field: 'subscribeAtAll',
    label: '提醒时 @全体成员',
    component: 'Switch',
    componentProps: { defaultValue: true },
    bottomHelpMessage: '机器人没有管理员权限时会自动降级为普通消息，不会发送失败。'
  },

  { component: 'Divider', label: '订阅关键词' },
  {
    field: 'subscribeKeywords',
    label: '关键词列表',
    component: 'GTags',
    componentProps: { placeholder: '输入关键词后回车添加，如：国王球、粉尘' },
    bottomHelpMessage: '模糊包含匹配。商品名、描述、标签中任一包含关键词即算命中，不区分大小写。'
  },

  { component: 'Divider', label: '抓取时机' },
  {
    field: 'subscribeDelaySeconds',
    label: '开轮后延迟（秒）',
    component: 'InputNumber',
    componentProps: { min: 0, max: 1800 },
    bottomHelpMessage: '数据源按轮次更新，开轮瞬间可能还是旧数据。延迟一段时间再抓能提高准确率。'
  },
  {
    field: 'subscribeRetry',
    label: '重试次数',
    component: 'InputNumber',
    componentProps: { min: 1, max: 20 },
    bottomHelpMessage: '抓取失败或未命中时的重试次数。'
  },
  {
    field: 'subscribeRetryIntervalSeconds',
    label: '重试间隔（秒）',
    component: 'InputNumber',
    componentProps: { min: 10, max: 600 },
    bottomHelpMessage: '每次重试之间等待的时间。总覆盖窗口 = 延迟 + 重试次数 × 重试间隔。'
  }
]
