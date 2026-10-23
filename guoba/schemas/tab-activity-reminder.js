export default [
  { component: 'SOFT_GROUP_BEGIN', label: '活动到期提醒' },

  { component: 'Divider', label: '提醒开关' },
  {
    field: 'activityReminderEnable',
    label: '启用活动到期检查',
    component: 'Switch',
    componentProps: { defaultValue: true },
    bottomHelpMessage: '总开关默认开启，但各群默认不订阅。每分钟全天检查，无到期事项时静默；默认结束前 24h / 6h 各提醒一次。'
  },

  { component: 'Divider', label: '独立群订阅' },
  {
    field: 'activityReminderGroups',
    label: '订阅活动提醒的群',
    component: 'GSelectGroup',
    componentProps: { placeholder: '留空表示所有群均不订阅' },
    bottomHelpMessage: '各群独立订阅。群内管理命令仅主人或本群管理员可用；同次到期事项合并为一张图片和短文，图失败使用完整文字。'
  },
  {
    field: 'activityReminderAtAllGroups',
    label: '提醒时 @全体的群',
    component: 'GSelectGroup',
    componentProps: { placeholder: '默认留空，不 @全体成员' },
    bottomHelpMessage: '只能影响已订阅群；未订阅群即使选中也不会收到提醒。每群可单独开启或关闭 @全体，无权限时按普通消息提醒。'
  },

  { component: 'Divider', label: '时机与数据保护' },
  {
    field: 'activityReminderHoursBefore',
    label: '结束前提醒（小时）',
    component: 'GTags',
    componentProps: { placeholder: '默认 24、6；输入正数后回车添加' },
    bottomHelpMessage: '默认 24h / 6h，各阶段成功送达后持久化去重，发送失败可重试。接受 1—168 小时有限正数并去重降序，非法值回到默认；新订阅或重启只补当前最近到期阶段，已结束不补。'
  },
  {
    field: 'activityReminderCacheMaxAgeHours',
    label: '缓存有效期（小时）',
    component: 'InputNumber',
    componentProps: { min: 1, max: 168 },
    bottomHelpMessage: '默认 48 小时，仅使用有效本地活动缓存及已缓存本地封面；数据缺失、失效或过期时不提醒。缓存每日中国时间 01:00 更新，提醒期间不联网补图。'
  }
]
