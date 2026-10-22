# rocom-plugin

洛克王国世界的 Yunzai 插件。

## 功能

### 远行商人

`#远行商人` / `远行商人`：查询远行商人**当前轮次**在售货物，生成图片卡片。

每日四轮，每轮货物不同：

| 轮次 | 时间 |
| --- | --- |
| 第一轮 | 08:00 - 12:00 |
| 第二轮 | 12:00 - 16:00 |
| 第三轮 | 16:00 - 20:00 |
| 第四轮 | 20:00 - 24:00 |

### 开轮订阅提醒

在 `config/config.yaml` 配置关键词，每轮开始时自动比对货物，命中则向指定群推送提醒并附图。

```yaml
subscribe:
  enable: true
  groups:
    - 你的群号
  keywords:
    - 国王球
    - 粉尘
```

- 匹配方式为**模糊包含**：商品名、描述、标签任一命中即可
- 默认 @全体成员，bot 无权限时自动降级为普通消息
- 开轮后延迟抓取，失败自动重试（应对数据源更新滞后）

### 帮助

`#洛克帮助` / `#洛克菜单`：渲染插件帮助图。

## 安装

将本目录放入 Yunzai 的 `plugins/` 下，重启即可。

```bash
cd Yunzai/plugins
git clone <本仓库地址> rocom-plugin
```

无需安装额外依赖：`yaml`、`node-schedule`、`art-template`、`puppeteer` 均由 Yunzai 提供。

## 配置

| 文件 | 说明 |
| --- | --- |
| `config/default_config.yaml` | 默认配置模板，随插件更新 |
| `config/config.yaml` | 用户配置，只写需要覆盖的字段 |

`config.yaml` 已在 `.gitignore` 中忽略——它含有你的群号与订阅关键词，不应提交。

### 图片清晰度

商人图和帮助图使用 PNG 无损输出，默认 `renderScale: 200`，即按两倍像素渲染（宽 1440 像素）。可在锅巴面板的「渲染缩放」中调整，或在 `config/config.yaml` 中设置 `renderScale`（50–200）。已有用户配置中的值仍会优先保留。

## 目录结构

```
rocom-plugin/
├── index.js              入口，扫描 apps/ 并启动定时任务
├── apps/                 命令与定时推送
├── models/               数据抓取、匹配、去重
├── components/           配置、基类、定时器
├── render/               puppeteer 渲染
├── config/               YAML 配置
└── resources/            模板、字体、帮助文档
```

## 数据来源

货物数据来自 [db.18183.com](https://db.18183.com/lkwgyxsr/) 的公开静态数据快照。本插件仅做整理与展示。

## 字体

渲染使用 **阿里妈妈方圆体 VF**（`resources/font/AlimamaFangYuanTiVF.ttf`），依据阿里妈妈字体授权条款使用。

## License

MIT
