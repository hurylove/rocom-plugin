export default [
  { component: 'SOFT_GROUP_BEGIN', label: '基础设置' },

  { component: 'Divider', label: '通用' },
  {
    field: 'renderScale',
    label: '渲染缩放（%）',
    component: 'InputNumber',
    componentProps: { min: 50, max: 200 },
    bottomHelpMessage: '图片渲染比例，100 为原始尺寸。数值越大图越清晰但生成越慢。'
  },

  { component: 'Divider', label: '响应群聊' },
  {
    field: 'groupWhite',
    label: '白名单群',
    component: 'GSelectGroup',
    componentProps: { placeholder: '留空则不限制' },
    bottomHelpMessage: '只在这些群响应命令。留空表示不启用白名单，此时看黑名单。'
  },
  {
    field: 'groupBlack',
    label: '黑名单群',
    component: 'GSelectGroup',
    componentProps: { placeholder: '选择不响应的群' },
    bottomHelpMessage: '这些群不响应任何命令。白名单优先于黑名单。'
  }
]
