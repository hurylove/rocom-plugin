export default [
  { component: 'SOFT_GROUP_BEGIN', label: '远行商人订阅' },

  { component: 'Divider', label: '开关' },
  {
    field: 'subscribeEnable',
    label: '启用开轮订阅提醒',
    component: 'Switch',
    componentProps: { defaultValue: false },
    bottomHelpMessage: '开启后，开轮延迟结束即按分钟补查当前轮次商品，命中后按群通知；成功群本轮不重复发送。'
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
    bottomHelpMessage: '@全体失败时尝试普通提醒；降级成功后本轮不重复发送，完全失败则记录原因并在后续检查重试。'
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
    bottomHelpMessage: '首次检查的最早时间；此后在当前轮次内按分钟补查，空数据不会提前占用通知名额。'
  },
  {
    field: 'subscribeRetry',
    label: '抓取最大尝试次数',
    component: 'InputNumber',
    componentProps: { min: 1, max: 20 },
    bottomHelpMessage: '单次检查中抓取异常时的最大尝试次数；空数据或未命中交由后续分钟检查。'
  },
  {
    field: 'subscribeRetryIntervalSeconds',
    label: '重试间隔（秒）',
    component: 'InputNumber',
    componentProps: { min: 10, max: 600 },
    bottomHelpMessage: '抓取异常后的重试等待时间；不限制整轮补查窗口，同一次检查未结束时不会启动重叠任务。'
  }
]
