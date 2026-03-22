# 版本历史 (Changelog)

> Channel Sentinel 各版本更新记录

---

## v2.0.0 (2026-03-21)

全面品牌重塑与移动端播放器布局优化

- **全面品牌重塑**
  - 项目名称从 "IPTV Checker" 更名为 "频道哨兵 Channel Sentinel"
  - package.json：name → `channel-sentinel`，description → `Channel Monitoring & Status Guardian Platform`，version → `2.0.0`
  - 所有 HTML 页面标题统一为 `频道哨兵 | Channel Sentinel`
  - 所有页面 favicon 从 `/iptv.png` 更换为 `/Sentinel.png`
  - 导航栏品牌文字、Logo 同步更新
  - GitHub 仓库链接从 `cgg888/iptv-checker` 更改为 `cgg888/channel-sentinel`
  - Docker 镜像从 `cgg888/iptv-checker` 更改为 `cgg888/channel-sentinel`（GHCR + Docker Hub）
  - CI/CD 工作流（docker-image.yml、release-on-tag.yml、ghcr-downloads.yml）全面同步新品牌
  - docs/WIKI.md、docs/USER_GUIDE.md 品牌相关内容同步更新

- **移动端播放器布局优化**
  - 播放器固定于顶部（40vh），频道列表与节目单通过 Tab 切换在下方抽屉显示
  - 移动端抽屉内部独立滚动，滚动时播放器区域不受影响
  - 移动端播放信息浮窗（player-info-overlay）默认隐藏
  - EPG 桌面端：鼠标移入自动显示，移出自动隐藏；首次打开播放器 3 秒后自动隐藏
  - EPG 移动端：抽屉模式始终可见，支持独立滚动
  - 频道列表与节目单共用同一深色/浅色主题状态

- **样式问题修复**
  - 恢复 CSS 清理过程中误删除的统计卡片样式（`.stat-card`、`.stat-title`、`.stat-value` 及颜色变体）
  - 修复顶部导航容器宽度与下方内容区不一致问题，Logo 与表格左对齐

- **CI/CD 持续集成优化**
  - 修复 Docker Hub 镜像同步缺失 `latest` 标签问题（main 分支 push 时同步 latest）
  - GHCR downloads workflow 同步更新包名为 `channel-sentinel`

- **运维体系成熟化**
  - 服务门禁质量 gate 稳定运行（7 类服务测试 + 4 类合同测试），13 次连续通过
  - calibrationReady=true，门禁阈值已冻结，门禁趋势看板与最终验收报告已更新

- **旧版数据迁移**
  - 新增旧版（v1.x）JSON 数据一键导入 SQLite 功能（设置 → 应用设置 → 旧数据导入）
  - 支持指定旧版 data 目录，迁移频道、FCC、UDPXy、分组、EPG、台标、代理等全部配置
  - 详情见 [使用指南 - 旧版数据导入](./WIKI.md#85-旧版数据导入-sqlite)

---

## v1.3.6 (2026-03-21)

CSS 架构重构与播放器移动端优化

- **CSS 架构重构**
  - 将 player.html ~470 行内联样式提取为 `player.css`
  - 将 login.html ~208 行内联样式提取为 `login.css`
  - 将 results.html ~218 行内联样式提取为 `results.css`
  - 将 index/results/logs 三页面重复导航样式提取为 `common-nav.css`
  - 重写 `custom.css`，删除 ~102 行被 shadcn-ui.css 覆盖的死代码
  - CSS 文件加载顺序重构：bootstrap → custom → theme-tokens → shadcn-ui → page-css

- **播放器移动端布局**
  - 播放器固定在上方（50vh），频道列表与节目单通过 Tab 切换在下方抽屉显示
  - 移动端抽屉内部独立滚动，滚动时播放器区域不受影响
  - 频道列表与节目单共用同一深色/浅色主题状态
  - 桌面端布局保持不变

- **EPG 交互优化**
  - 桌面端：鼠标移入 EPG 区域自动显示，移出自动隐藏（不再依赖鼠标移动事件）
  - 首次打开播放器 EPG 在 3 秒后自动隐藏（移动端除外）
  - EPG 浅色模式样式与频道列表同步

- **播放器内核模块化**
  - `start-kernel.js` 模块化：playDirectTs、startMpegtsPlayer、handleHevcSwitch、createHlsErrorHandler、bindHlsCoreEvents 等
  - 播放器 `start()` 函数精简约 120 行，内联 fallback 批量收口
  - 回放 `doReplay()` 函数收口：executeReplay 统一全链路 fallback，精简约 50 行

- **运维体系完善**
  - 新增服务门禁质量 gate（service-quality-gate.js），支持 7 类合同测试
  - 新增门禁趋势追踪（service-gate-trend.js）与最终验收报告
  - 新增运维治理 SOP（ops-domain-sop.js）与低频治理（ops-low-frequency-governance.js）
  - 新增认证网关功能，支持用户登录状态检查和重定向

---

## v1.3.5 (2026-02-24)

增强播放器功能并优化界面显示

- 在播放器界面增加节目进度条元信息显示（单播/组播、编码格式、分辨率、帧率）
- 为EPG列表和播放器添加无节目数据时的占位显示
- 优化播放器源切换逻辑，支持根据编码格式自动选择非HLS源
- 统一站点favicon并提供长缓存
- 改进频道切换记忆功能，记录上次播放的频道和源信息
- 调整播放器控制栏图标和布局，优化视觉体验
- 更新版本号至1.3.5

---

## v1.3.4 (2026-02-23)

- **WebDAV**
  - 备份：严格校验 MKCOL/PUT 状态；若未上传任何文件则返回失败；新增开始/每步/完成日志，包含目录与文件数
  - 恢复：新增开始、扫描候选、逐文件成功/失败、兜底重试、完成/异常的详细日志

- **播放日志**
  - 新增 /api/player/log 接口；播放器与代理在播放时记录频道、类型（直播/回放、组播/单播）、节目标题、范围、地址
  - 结果页"播放测试"弹窗也输出简化播放日志

- **界面与易用性**
  - 为 FCC、台标模板、EPG、分组、代理、接口、设置、播放测试等弹窗标题新增语义化图标
  - 修复"播放测试"弹窗底部按钮布局类名错误，按钮正确居中显示

- **其他**
  - 若 WebDAV 目录创建或文件上传失败，不再误报"备份成功"
  - 日志中心可筛选 Player/WebDAV 查看详细流水

---

## v1.3.3 (2026-02-22)

- **播放入口与直达播放**
  - 首页"组播单播预览列表"、检测结果页面列表、编辑频道信息三处的"播放"按钮改为直达当前频道地址，后端加载与频道一致；非 mini 场景携带 url 也自动播放。
  - 直达播放不再展示"选择线路"按钮，且不会在频道列表加载后被自动匹配频道覆盖，确保始终播放传入地址。
  - 直达播放补齐 LIVE 徽标与节目进度，基于 tvgName/title 自动拉取 EPG 并展示当前节目信息。

- **性能与首屏优化**
  - hls.js 与 mpegts.js 改为按需动态加载，移除页面静态引入，减少首屏无关脚本下载。
  - 频道列表台标懒加载、异步解码、低优先级；使用可见触发仅在列表项进入视口时请求"当前节目"。
  - 列表容器启用 content-visibility 优化首屏布局；预加载 Bootstrap Icons woff2 字体。

- **台标与缓存**
  - /api/logo 支持 w/h/fit/fmt 参数；检测到系统安装 sharp 时进行尺寸限制、去 EXIF 与转码压缩（webp/avif/png/jpeg），未安装则安全退回归出原图。
  - /api/logo 增加 ETag 与 7 天强缓存（含 stale-while-revalidate），提升复用；/vendor 资源 30 天 immutable；/public 资源 7 天缓存且 HTML 强制 no-cache。
  - 条件启用文本资源压缩（compression 可用时自动启用）。

- **兼容性**
  - 保持既有功能与接口不变；旧链接与模板参数继续可用。

---

## v1.3.2 (2026-02-21)

- **安全与认证**
  - 将 player.html 纳入登录保护；未登录重定向至登录页并支持 redirect 回跳
  - login.html 增加 redirect 解析与同源校验

- **播放体验**
  - 默认不静音；若浏览器拦截自动播放，首次点击后继续以未静音播放
  - EPG 节目单面板上下对称留白，避免贴近黑边与进度条

- **回看与地址规范**
  - 外网回看拼接遵循"单播代理 + 回放源基础 URL + 酷9时间参数"，阻断 /rtp/ 组播路径误拼
  - EPG/回看在外网模式下统一走单播代理

- **台标与外观**
  - 内/外网台标模板自动选择，统一通过 /api/logo 加载

- **导出与接口**
  - 新增 TVBox/猫影视 JSON（/api/export/tvbox）与 Xtream Codes JSON（/api/export/xtream）
  - 接口弹窗新增上述直连接口项

- **文档与许可**
  - 重构 README：简介与功能说明精简、美化，新增 GHCR/DockerHub 简介段
  - 新增 LICENSE（MIT）与 MIT 徽章；package.json 增加 license 字段

---

## v1.3.1 (2026-02-21)

- **播放与检测联动**
  - 检测结果列表与"编辑频道信息"弹窗的"网页播放"按钮统一使用"频道地址 (只读)"作为基址：组播自动在只读地址后拼接 FCC 参数；单播直接使用只读地址，避免任何硬编码
  - 修复部分组播/RTP 频道在结果页、编辑弹窗中无法通过 mini 播放器正确播放的问题，使其与列表展示的地址行为保持一致

- **播放器与 UI**
  - player.html 新增 ui=mini 简洁模式：隐藏频道列表与节目单，只保留视频区与基础控制条，适合检测/编辑弹窗的小窗播放
  - 修复 mini 模式下误加载频道表、误切换到其他频道的问题，确保始终播放传入的 url 源

- **登录与品牌样式**
  - 登录页新增随机 Bing UHD 壁纸背景（https://bing.img.run/rand_uhd.php），自适应铺满屏幕
  - 登录卡片顶部及输入框左侧图标统一使用本地 PNG 图标（iptv.png），整体品牌风格与应用内其他页面保持一致

- **图标与视觉统一**
  - 全站 favicon 统一使用 /iptv.png（登录页、检测页、结果页、播放器页）
  - 检测页与结果页标题前新增 IPTV PNG 图标，图标高度与标题文字字体大小一致，提升识别度

- **版本**
  - 软件版本更新至 1.3.1

---

## v1.3.0 (2026-02-19)

- **EPG 与回看**
  - 组播直播：统一使用 HTTP 基址 + /rtp/ + 组播地址，并追加 FCC 参数；通过 mpegts.js 播放 TS，修复 400 Bad Request 问题；按需加载 mpegts.js，提升首开速度
  - 单播直播/回看：m3u8 通过 hls.js 播放，按需加载 hls.js；"新窗口打开"根据当前状态自适应选择 mpegts.js（组播直播）或 hls.js（单播/回看）
  - 切换直播⇄回看、关闭/停止/切换频道时，统一销毁 mpegts/hls 实例并清空 video 源，避免内核冲突与残留播放

- **播放入口与按钮**
  - 结果页与"编辑频道信息"弹窗新增"外部播放器/网页播放"按钮：外部播放器桌面自动匹配 PotPlayer、移动端匹配 VLC；网页播放打开简洁模式 player 页面（隐藏频道列表与节目单）
  - 列表页播放按钮策略统一：组播走 mpegts.js，单播走 hls.js；打开 player.html 时附加 ui=mini

- **地址规范**
  - 组播地址规范化为 udpxy /rtp/ + 纯地址，组播直播自动追加 FCC 参数且避免重复追加；与显示地址逻辑保持一致

- **搜索与界面**
  - 结果页搜索框支持"分辨率"关键字
  - "EPG 与 回看"弹窗新增最大化按钮，可在全屏与居中卡片之间切换

- **稳定性**
  - 增强错误处理与日志；优化切换流程的可靠性

- **版本号更新至 1.3.0**

---

## v1.2.2 (2026-02-18)

- EPG/回看：LIVE 节目直接调用单播完整地址；复制栏显示原始地址，网页播放走代理（/api/proxy/hls 或 /api/proxy/stream）；组播频道在 LIVE 时自动匹配单播候选或基于回放基址拼接单播参数（zte_offset=30、ispcode=2、starttime=$单播），显著提升兼容性与成功率
- EPG 标题行新增"上一个频道/停止/下一个频道"按钮，支持在弹窗内切换频道与一键停止播放
- 状态联动优化：LIVE 点击显示"正在直播"，回看点击显示"正在回看"，二者互斥展示
- 稳定性：关闭/停止时销毁 Hls、暂停并清空视频源，避免后台继续播放；切换频道后标题与地址栏即时刷新
- 版本号更新至 1.2.2

---

## v1.2.1 (2026-02-18)

- TXT 导出支持分组：输出"分组名,#genre#"，其后为"频道名,地址"
- 导出弹窗文案更新：明确 TXT 为分组格式
- 接口弹窗布局优化：Token 固定第一行；第二行按"状态→范围→单播协议→回放格式"顺序展示
- 登录页图标更换为电视样式（更贴合 IPTV）
- CI 优化：Docker 构建仅在源码改动时触发（md 文档改动不触发）
- 版本号更新至 1.2.1

---

## v1.2.0 (2026-02-18)

- 新增接口弹窗下拉：单播协议（HTTP/RTSP）、回放格式预设
- 扩展导出：/api/export/m3u 支持 proto=http|rtsp 与多种 fmt（iso8601、npt、rtsp_range、playseek、startend14、beginend14、unix_s、unix_ms），保留酷9、mytv逻辑不变
- 调整布局：接口弹窗分两行，第一行 Token；第二行 状态→范围→单播协议→回放格式
- 版本号更新至 1.2.0

---

## v1.1.0 (2026-02-18)

- 🔐 新增登录鉴权系统：
  - 支持账号密码登录，默认 admin/admin
  - 增加图形验证码（svg-captcha）防止爆破
  - 登录状态持久化，未登录拦截关键页面

- 🔄 版本管理与更新：
  - 页面底部新增版本信息栏
  - 自动检测 GitHub 最新版本
  - 智能更新引导（Docker 环境提示拉取镜像，本地环境提示 git pull）

- 🐳 Docker 优化：
  - 升级镜像版本至 1.1.0
  - 优化构建流程（npm ci, tini, 非 root 用户）
  - 完善部署文档

- 💄 UI 优化：
  - 统一项目名称为 "IPTV Checker"
  - 优化登录页、结果页样式
  - 调整版本弹窗为居中卡片式设计

---

## v1.0.1 (2026-02-17)

- 🔐 外网导出支持 token 验证，未携带或错误 token 拒绝访问
- 🐛 修复导出接口异常（TXT ordered 未定义、M3U udpxyServers 未定义）
- 🖼️ 编辑频道弹窗新增台标预览；▶️ 增加 PotPlayer 播放按钮
- 📚 M3U 导出增强：tvg-*、group-title、catchup 与 catchup-source；支持 ?fcc 参数与质量后缀
- 🧠 同名频道排序按质量优先：组播 4K > HD > SD > 单播；帧率高者优先
- 🔁 检测逻辑优化：同地址只刷新状态，不改动名称、分组、Logo 等其他字段
- 🧭 组播范围界面布局优化：交换 CIDR/并发 与 起始/结束地址位置，操作更顺手
- 💾 新增版本持久化能力：支持保存、加载、删除版本及版本列表接口

---

## v1.0.0 (2025-05-25)

- 🎉 首次发布
- ✨ 支持批量检测 IPTV 组播流
- 🚀 实现 Docker 容器化部署
- 📦 提供 Docker Hub 镜像
- 🛠️ 基于 Alpine Linux 优化镜像体积
- 🔒 增加容器安全性配置
- 📝 完善部署文档

---
