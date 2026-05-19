# GeekCalendarLab 极客日历实验室

## 项目概览

GeekCalendarLab 极客日历实验室是一个节假日订阅 + 个人日程的前端日历应用，支持 PWA 离线浏览。项目以 Vite + React + TypeScript 构建，通过脚本维护节假日数据，并在前端提供清晰的月视图与列表视图。

## 功能清单

### 节假日/调休
- 读取 `data/holidays.json` 显示节假日与调休工作日
- 日历单元格徽标区分节假日 / 调休 / 其他
- 详情面板展示节日描述与类型

### 个人日程（本地隐私）
- 右键日期弹出菜单：查看当天 / 添加日程
- 当天预览弹窗支持新增与删除个人日程
- 个人日程仅存储在浏览器本地（localStorage），不上传云端

### 农历/节气/传统节日
- 使用 `lunar-javascript` 前端计算
- 优先级：传统节日 > 节气 > 农历日期

### 天气模块
- 手动城市查询或点击“定位获取”
- 未来 7 天游览卡片
- 天气数据通过 Cloudflare Pages Functions 转发
- 国内优先心知天气，海外优先 OpenWeather，失败回退 Open-Meteo

## 技术架构

### 前端
- Vite + React 19 + TypeScript
- 全局样式集中在 `src/styles.css`
- UI 文案为中文

### 数据流
- `data/sources.json` 定义 ICS 订阅源
- `npm run update:holidays` 生成 `data/holidays.json` + `public/calendar.ics`
- UI 运行时加载 `data/holidays.json`

### 天气代理（Cloudflare Pages Functions）
- 入口：`/weather?lat=...&lon=...`
- 由 `functions/weather.ts` 实现
- 读取 Cloudflare 环境变量中的 API Key

## 目录结构

```
./
├─ data/
│  ├─ holidays.json        # UI 读取的节假日数据
│  └─ sources.json         # ICS 订阅源列表
├─ functions/
│  └─ weather.ts           # Cloudflare Pages Functions 天气代理
├─ public/
│  └─ calendar.ics         # 订阅输出
├─ scripts/
│  └─ update-holidays.mjs  # ICS 合并脚本
├─ src/
│  ├─ App.tsx              # 主界面
│  ├─ main.tsx             # 入口
│  ├─ lib/
│  │  ├─ date.ts           # 日期工具
│  │  ├─ lunar.ts          # 农历计算
│  │  ├─ types.ts          # 类型定义
│  │  └─ weather.ts        # 天气工具
│  └─ styles.css           # 全局样式
└─ README.md
```

## 本地开发

```bash
npm install
npm run dev
```

质量检查：

```bash
npm run check
```

更新节假日数据：

```bash
npm run update:holidays
```

## 部署（GitHub + Cloudflare Pages）

### 1. 推送到 GitHub 私有仓库

```bash
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin <你的仓库地址>
git push -u origin main
```

### 2. Cloudflare Pages 连接 GitHub

1. 打开 Cloudflare 控制台 → Pages → Create a project
2. 选择 “Connect to Git” 并授权 GitHub
3. 选择仓库
4. 构建配置
   - Framework: Vite
   - Build command: `npm run build`
   - Build output directory: `dist`

### 3. 环境变量（必须）

在 Cloudflare Pages → Settings → Environment variables 添加：

- `SENIVERSE_PUBLIC_KEY`
- `SENIVERSE_PRIVATE_KEY`
- `OPENWEATHER_KEY`

前端订阅链接默认使用当前访问域名。若要固定生产域名，可配置：

- `VITE_PUBLIC_BASE_URL=https://calendar.geekfunlab.com`

> 心知天气免费版要求标注来源，项目已在页面底部显示数据来源。

### 4. 代理接口验证

部署完成后访问：

```
https://<你的域名>/weather?lat=39.9&lon=116.4
```

返回 JSON 说明 Functions 生效。

### 5. 订阅地址

```
https://<你的域名>/subscribe/china
https://<你的域名>/subscribe/overseas
https://<你的域名>/subscribe/other
```

这些地址会由 Cloudflare Pages Functions 记录订阅访问后跳转到对应 ICS 文件。

## 注意事项

- 心知天气免费版要求注明数据来源，勿删除来源说明
- 个人日程为本地存储，清理浏览器缓存会丢失数据
- `data/holidays.json` 每年需更新一次
- 若调整 `data/sources.json`，请务必重新运行 `npm run update:holidays`
