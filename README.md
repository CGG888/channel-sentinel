# IPTV Checker

<p align="center">
  <img src="./iptv.png" alt="IPTV 图标" width="160">
</p>

![Iptv-Checker 检测空数据界面](./public/preview-empty.png)

🏷️ 版本号：
![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/cgg888/iptv-checker?sort=semver)
![Build Status](https://img.shields.io/github/actions/workflow/status/cgg888/iptv-checker/docker-image.yml?branch=main)
![GHCR](https://img.shields.io/badge/GHCR-iptv--checker-2ea44f?logo=github)
![Docker Pulls](https://img.shields.io/docker/pulls/cgg888/iptv-checker?logo=docker)
![GHCR Downloads](./ghcr-downloads.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

👉 [查看完整使用指南（Wiki）](./docs/WIKI.md)

---

## 许可证

本项目采用 MIT License 开源许可。你可以在保留版权与许可声明的前提下，自由使用、复制、修改、合并、发布、分发、再许可及/或出售本软件的副本。本软件按“现状”提供，不附带任何明示或默示的担保，作者与贡献者不对使用本软件产生的任何损失负责。

MIT License 原文：

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---
## 🌟 项目简介（当前版本：![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/cgg888/iptv-checker?sort=semver)）

Iptv-Checker 是一款基于 Node.js + Express + ffprobe 的 IPTV 组播/单播流检测与管理工具，提供现代化 Web 界面与丰富生态导出。支持单播、组播批量检测、EPG 与回看、单播组播独立播放器、内/外网模式、台标模板（内/外网区分）、多种导出（M3U/TXT/JSON、TVBox、Xtream）、安全登录与令牌保护等能力，适用于运营网与实验环境中的频道维护、线路切换与对接。（基于湖南常德电信 IPTV 场景测试；单播以中兴平台 HTTP 单播为主）

### 核心特性一览
- 批量检测：在线/离线、分辨率、帧率、编码，合并同源不覆写元数据
- 智能播放：组播直播走 mpegts.js，单播/回看走 hls.js；默认非静音；失败自动重试
- EPG/回看：节目单查询、状态联动、快捷切换；回看拼接严格遵循规范
- 内/外网模式：按访问场景切换地址拼接策略、台标模板与 EPG 源
- 台标模板：支持内/外网模板与占位回退，统一 /api/logo 加载
- 导出丰富：TXT/M3U/JSON 以及 TVBox/猫影视 JSON、Xtream Codes JSON
- 接口集合：一键生成“播放器直连接口链接”，支持状态/范围/协议/回看格式参数
- 安全鉴权：登录保护（含播放器页）、外网导出可加 Token，验证码防爆破
- 版本与数据：版本快照管理，data 目录集中配置（代理、UDPXY、FCC、模板、分组等）

### 支持的回看格式与规则
- 格式：iso8601、ku9、mytv、npt、rtsp_range、playseek、startend14、beginend14、unix_s、unix_ms
- 外网回看拼接规则：单播代理 + 回放源基础 URL + 酷9（等）时间参数
- 拦截策略：杜绝把组播 /rtp/ 路径拼入回看，确保外网可播通路

### 内/外网模式说明
- 内网
  - 组播：udpxy（或 rtp2httpd）基址 + /rtp/ + ip:port + ?fcc=...
  - 单播：保留原始 http(s) 地址
  - EPG/台标：使用“内网”源与模板
- 外网
  - 组播：使用“组播代理”基址拼接 /rtp/ip:port 并继承 httpParam
  - 单播与回看：使用“单播代理”基址 + 去协议路径；回看附加对应时间参数
  - EPG/台标：使用“外网”源与模板

### 典型使用场景
- 运营维护：批量体检频道质量，按组规则归类与导出，随时切换主备线路
- 对外对接：为 TVBox/猫影视或 Xtream 生态生成可用 JSON/链接，并可加 Token
- 内外网切换：同一套数据在内/外网环境下稳定可播，减少手工改地址成本

---

## ⚡ 软件功能说明

### 检测与列表
- 批量/单条检测：状态、分辨率、帧率、编码；同源合并不覆写元数据
- 筛选/搜索：在线/离线、组播/单播；名称/分组/地址/tvg/FCC/分辨率
- 排序与统计：同名按质量优先；展示总数、在线、离线

### 播放
- 组播直播→mpegts.js；单播/回看→hls.js；支持 ui=mini；默认非静音
- 新窗口播放与外部播放器（PotPlayer/VLC）；弹窗一键全屏
- 页面受登录保护，登录后自动回跳

### EPG 与回看
- 节目单查询与状态联动；节目单上下留白不贴边
- 外网回看拼接：单播代理 + 回放源基础 URL + 时间参数（详见上文“回看格式与规则”）
- 支持格式：iso8601、ku9、mytv、npt、rtsp_range、playseek、startend14、beginend14、unix_s、unix_ms

### 编辑与配置
- 频道：名称、tvg-id/name、Logo 预览、分组、时移（catchupFormat/Base/httpParam）
- 台标模板：内/外网模板区分，统一通过 /api/logo 加载
- 代理与 UDPXY：组播代理/单播代理配置；udpxy 列表与 currentId
- EPG 源：内/外网源维护与选择；应用设置支持内/外网模式切换

### 导出与接口
- TXT/M3U（含 tvg-*、group-title、catchup、catchup-source、?fcc 与质量后缀）
- JSON 导出：TVBox/猫影视（/api/export/tvbox）、Xtream Codes（/api/export/xtream）
- 接口弹窗：状态/范围/协议/回看格式参数；支持直连集合（复制/打开/播放）
- 外网导出可启用 Token；提供 /api/persist、/api/export、/api/config 等接口

### 版本、部署与安全
- 版本管理：保存/加载/删除，启动自动加载最新版本
- 部署：Docker（生产/开发映射）、本地 Node.js、Linux 一键脚本
- 登录鉴权：账号密码 + 验证码；页面与 API 路由保护（含 player.html）
- 数据持久化：data 目录集中配置（udpxy、fcc、分组、模板、代理、设置等）

### 稳定性与体验
- 内核切换时自动销毁实例；错误处理与重试更健壮
- UI 自适配 PC/移动端，现代卡片式界面

---

## 🛠️ 实现方式

- 🔧 **后端**：Node.js + Express，调用 ffprobe 命令行工具检测流媒体信息，缓存检测结果提升性能
- 🎯 **前端**：原生 HTML+CSS+JS，Bootstrap 5 美化界面，AJAX 与后端交互
- 💾 **数据存储**：检测结果存储于内存，重启服务后会清空

---

## 部署

### 方式一：Docker（推荐生产）
Docker 运行（GitHub 镜像，host 模式）：
```bash
docker pull ghcr.io/cgg888/iptv-checker:latest
docker run -d --network host --name iptv-checker -e TZ=Asia/Shanghai -e PORT=${IPTV_PORT:-3000} -v $(pwd)/data:/app/data ghcr.io/cgg888/iptv-checker:latest
```
Docker 运行（Docker Hub 镜像，host 模式）：
```bash
docker pull cgg888/iptv-checker:latest
docker run -d --network host --name iptv-checker -e TZ=Asia/Shanghai -e PORT=${IPTV_PORT:-3000} -v $(pwd)/data:/app/data cgg888/iptv-checker:latest
```
Compose（生产，host 模式）：

Github 镜像 Compose（生产，host 模式）：
```yaml
services:
  iptv-checker:
    image: ghcr.io/cgg888/iptv-checker:latest
    container_name: iptv-checker
    network_mode: "host"
    environment:
      - NODE_ENV=production
      - TZ=Asia/Shanghai
      - PORT=${IPTV_PORT:-3000}
    volumes:
      - ./data:/app/data
      - ./.git:/app/.git
    restart: unless-stopped
```

Docker Hub 镜像 Compose（生产，host 模式）：
```yaml
services:
  iptv-checker:
    image: cgg888/iptv-checker:latest
    container_name: iptv-checker
    network_mode: "host"
    environment:
      - NODE_ENV=production
      - TZ=Asia/Shanghai
      - PORT=${IPTV_PORT:-3000}
    volumes:
      - ./data:/app/data
      - ./.git:/app/.git
    restart: unless-stopped
```
提示：
- host 模式不需要端口映射，服务直接监听宿主机端口
- 部署时通过环境变量 `IPTV_PORT` 覆盖应用监听端口（默认 3000）
- 生产仅映射 data；不要映射 src/public 以免覆盖镜像内代码
- 宿主机数据目录需可写；必要时设置 user: "1000:1000"
- 镜像许可：MIT（与仓库 LICENSE 一致）

### 方式二：本地 Node.js（开发/轻量）
环境准备：
- Node.js 18+ 与 npm；ffmpeg（含 ffprobe）；git；curl/wget；现代浏览器

```bash
# Windows 示例
cd C:\Users\Administrator\Desktop
# Linux 示例
cd ~/your/path/
git clone https://github.com/cgg888/iptv-checker.git iptv-checker
cd iptv-checker
```

```bash
npm ci || npm install
npm start
```

#### 常见错误及解决办法：
- **npm install 报错**：
  - 请检查 Node.js 是否正确安装，可用 `node -v` 和 `npm -v` 检查版本。
  - 若提示权限问题，Windows 请用管理员身份运行 PowerShell，Linux 可尝试 `sudo npm install`。
- **ffprobe 未找到**：
  - Windows：请下载 [ffmpeg 官网](https://ffmpeg.org/download.html) 的 Windows 版本，解压后将 ffprobe.exe 所在目录加入系统环境变量 PATH。
  - Linux：可用 `sudo apt install ffmpeg` 或 `sudo yum install ffmpeg` 安装。
  - 安装后在命令行输入 `ffprobe -version` 能正常输出版本信息即可。

访问地址 http://localhost:3000（默认端口 3000，可在 src/index.js 修改）

#### 常见错误及解决办法：
- **端口被占用**：
  - 报错 `EADDRINUSE: address already in use`，请更换端口或关闭占用 3000 端口的程序。
- **ffprobe 相关错误**：
  - 检查 ffprobe 是否安装并在 PATH 中。
  - 检查防火墙或杀毒软件是否拦截 ffprobe。
- **UDPXY 无法访问**：
  - 请确保 UDPXY 服务已启动，且 Web 页面填写的 UDPXY 地址正确可访问。

### 5. 访问 Web 页面
- 启动后在浏览器访问：http://localhost:3000
- 局域网其他设备可通过本机 IP 访问（如 http://192.168.1.100:3000），需保证防火墙放行 3000 端口。

### 6. 配置 UDPXY
- 请确保本地或局域网内有可用的 UDPXY 服务，并在页面填写 UDPXY 地址（如：http://192.168.88.1:8333）。
- UDPXY 是 IPTV 组播转 HTTP 的服务，需自行搭建。

---

### 方式三：Docker 开发模式（源码映射）
```yaml
services:
  iptv-checker-dev:
    build: .
    container_name: iptv-checker-dev
    network_mode: "host"
    environment:
      - NODE_ENV=development
      - TZ=Asia/Shanghai
      - PORT=${IPTV_PORT:-3000}
    volumes:
      - ./data:/app/data
      - ./src:/app/src
      - ./public:/app/public
      - ./.git:/app/.git
    restart: unless-stopped
```
注意：Windows 中文路径可能导致卷挂载异常，建议使用英文路径（如 C:\Work\iptv-checker）

## Linux 服务器一键部署

Debian/Ubuntu（systemd 服务）：
```bash
#!/usr/bin/env bash
set -e
sudo apt update
sudo apt install -y curl git ffmpeg
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
sudo useradd -r -s /usr/sbin/nologin iptv || true
sudo mkdir -p /opt
sudo chown -R "$USER":"$USER" /opt
git clone https://github.com/cgg888/iptv-checker.git /opt/iptv-checker
cd /opt/iptv-checker
npm ci || npm install
sudo tee /etc/systemd/system/iptv-checker.service >/dev/null <<'EOF'
[Unit]
Description=IPTV Checker Service
After=network.target

[Service]
Type=simple
User=iptv
WorkingDirectory=/opt/iptv-checker
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/iptv-checker/src/index.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now iptv-checker
sudo systemctl status iptv-checker --no-pager
```

CentOS/RHEL（systemd 服务）：
```bash
#!/usr/bin/env bash
set -e
sudo yum install -y curl git ffmpeg
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo -E bash -
sudo yum install -y nodejs
sudo useradd -r -s /sbin/nologin iptv || true
sudo mkdir -p /opt
sudo chown -R "$USER":"$USER" /opt
git clone https://github.com/cgg888/iptv-checker.git /opt/iptv-checker
cd /opt/iptv-checker
npm ci || npm install
sudo tee /etc/systemd/system/iptv-checker.service >/dev/null <<'EOF'
[Unit]
Description=IPTV Checker Service
After=network.target

[Service]
Type=simple
User=iptv
WorkingDirectory=/opt/iptv-checker
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/iptv-checker/src/index.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now iptv-checker
sudo systemctl status iptv-checker --no-pager
```

## 版本管理

- 前端操作：首页与结果页均提供版本下拉与按钮
  - 保存：保存 streams.json 并生成带时间戳的版本文件（streams-YYYYMMDD-HHMMSS.json）
  - 加载：选择版本文件加载数据
  - 删除：删除指定版本文件
  - 列表：展示所有版本及数量
- 接口对应
  - /api/persist/save、/api/persist/list、/api/persist/load-version、/api/persist/delete-version、/api/persist/load、/api/persist/delete
 - 启动行为：若 /data/streams.json 不存在，将自动加载 /data 中最新的 streams-YYYYMMDD-HHMMSS.json 版本文件


## 数据文件说明（/data）

- streams.json 当前数据（含 settings.globalFcc）
- logo_templates.json 台标模板（对象列表与 currentId）
- fcc_servers.json FCC 列表与 currentId
- udpxy_servers.json rtp2httpd/udpxy 列表与 currentId
- group_titles.json 分组标题（存对象 name/color）
- group_rules.json 分组规则（name、matchers）
- epg_sources.json EPG 源（name、url、scope）
- proxy_servers.json 代理列表（type、url）
- app_settings.json 应用设置（内/外网、基址）
- streams-YYYYMMDD-HHMMSS.json 历史版本

## 安全与限制

- 外网导出需正确 token，错误或缺失将返回 403
- ffprobe 超时时间约 8 秒；检测结果缓存 5 分钟以提升性能
- 数据存储在内存，重启后清空；请使用版本管理或自行持久化


####  注意事项
- ✅ 确保系统已安装 Docker 和 Docker Compose
- 🔐 使用 GitHub 镜像源需要先登录 ghcr.io
- 🚀 国内用户建议使用阿里云镜像源，速度更快
- 🔌 容器默认监听 3000 端口
- 📦 镜像大小约 200MB，采用 Alpine Linux 基础镜像
- 🎥 内置 ffmpeg，无需额外安装
- 🔒 如果使用 GitHub Container Registry，首次拉取可能需要登录：
  ```bash
  echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
  ```
- 📁 容器内的 `/app/data` 和 `/app/logs` 目录已映射到宿主机，数据将被持久化
- 🕒 默认时区设置为 `Asia/Shanghai`，可通过环境变量 `TZ` 修改
- 🔄 容器配置了自动重启策略（unless-stopped）
- 🌐 应用默认监听 3000 端口，可根据需要修改映射端口


---

## 版本历史
### v1.3.4 (2026-02-23)
- WebDAV
  - 备份：严格校验 MKCOL/PUT 状态；若未上传任何文件则返回失败；新增开始/每步/完成日志，包含目录与文件数
  - 恢复：新增开始、扫描候选、逐文件成功/失败、兜底重试、完成/异常的详细日志
- 播放日志
  - 新增 /api/player/log 接口；播放器与代理在播放时记录频道、类型（直播/回放、组播/单播）、节目标题、范围、地址
  - 结果页“播放测试”弹窗也输出简化播放日志
- 界面与易用性
  - 为 FCC、台标模板、EPG、分组、代理、接口、设置、播放测试等弹窗标题新增语义化图标
  - 修复“播放测试”弹窗底部按钮布局类名错误，按钮正确居中显示
- 其他
  - 若 WebDAV 目录创建或文件上传失败，不再误报“备份成功”
  - 日志中心可筛选 Player/WebDAV 查看详细流水

### v1.3.3 (2026-02-22)
- 播放入口与直达播放
  - 首页“组播单播预览列表”、检测结果页面列表、编辑频道信息三处的“播放”按钮改为直达当前频道地址，后端加载与频道一致；非 mini 场景携带 url 也自动播放。
  - 直达播放不再展示“选择线路”按钮，且不会在频道列表加载后被自动匹配频道覆盖，确保始终播放传入地址。
  - 直达播放补齐 LIVE 徽标与节目进度，基于 tvgName/title 自动拉取 EPG 并展示当前节目信息。
- 性能与首屏优化
  - hls.js 与 mpegts.js 改为按需动态加载，移除页面静态引入，减少首屏无关脚本下载。
  - 频道列表台标懒加载、异步解码、低优先级；使用可见触发仅在列表项进入视口时请求“当前节目”。
  - 列表容器启用 content-visibility 优化首屏布局；预加载 Bootstrap Icons woff2 字体。
- 台标与缓存
  - /api/logo 支持 w/h/fit/fmt 参数；检测到系统安装 sharp 时进行尺寸限制、去 EXIF 与转码压缩（webp/avif/png/jpeg），未安装则安全回退直出原图。
  - /api/logo 增加 ETag 与 7 天强缓存（含 stale-while-revalidate），提升复用；/vendor 资源 30 天 immutable；/public 资源 7 天缓存且 HTML 强制 no-cache。
  - 条件启用文本资源压缩（compression 可用时自动启用）。
- 兼容性
  - 保持既有功能与接口不变；旧链接与模板参数继续可用。
### v1.3.2 (2026-02-21)
- 安全与认证
  - 将 player.html 纳入登录保护；未登录重定向至登录页并支持 redirect 回跳
  - login.html 增加 redirect 解析与同源校验
- 播放体验
  - 默认不静音；若浏览器拦截自动播放，首次点击后继续以未静音播放
  - EPG 节目单面板上下对称留白，避免贴近黑边与进度条
- 回看与地址规范
  - 外网回看拼接遵循“单播代理 + 回放源基础 URL + 酷9时间参数”，阻断 /rtp/ 组播路径误拼
  - EPG/回看在外网模式下统一走单播代理
- 台标与外观
  - 内/外网台标模板自动选择，统一通过 /api/logo 加载
- 导出与接口
  - 新增 TVBox/猫影视 JSON（/api/export/tvbox）与 Xtream Codes JSON（/api/export/xtream）
  - 接口弹窗新增上述直连接口项
- 文档与许可
  - 重构 README：简介与功能说明精简、美化，新增 GHCR/DockerHub 简介段
  - 新增 LICENSE（MIT）与 MIT 徽章；package.json 增加 license 字段
  
### v1.3.1 (2026-02-21)
- 播放与检测联动
  - 检测结果列表与“编辑频道信息”弹窗的“网页播放”按钮统一使用“频道地址 (只读)”作为基址：组播自动在只读地址后拼接 FCC 参数；单播直接使用只读地址，避免任何硬编码
  - 修复部分组播/RTP 频道在结果页、编辑弹窗中无法通过 mini 播放器正确播放的问题，使其与列表展示的地址行为保持一致
- 播放器与 UI
  - player.html 新增 ui=mini 简洁模式：隐藏频道列表与节目单，只保留视频区与基础控制条，适合检测/编辑弹窗的小窗播放
  - 修复 mini 模式下误加载频道表、误切换到其他频道的问题，确保始终播放传入的 url 源
- 登录与品牌样式
  - 登录页新增随机 Bing UHD 壁纸背景（https://bing.img.run/rand_uhd.php），自适应铺满屏幕
  - 登录卡片顶部及输入框左侧图标统一使用本地 PNG 图标（iptv.png），整体品牌风格与应用内其他页面保持一致
- 图标与视觉统一
  - 全站 favicon 统一使用 /iptv.png（登录页、检测页、结果页、播放器页）
  - 检测页与结果页标题前新增 IPTV PNG 图标，图标高度与标题文字字体大小一致，提升识别度
- 版本
  - 软件版本更新至 1.3.1
  
### v1.3.0 (2026-02-19)
- EPG 与回看
  - 组播直播：统一使用 HTTP 基址 + /rtp/ + 组播地址，并追加 FCC 参数；通过 mpegts.js 播放 TS，修复 400 Bad Request 问题；按需加载 mpegts.js，提升首开速度
  - 单播直播/回看：m3u8 通过 hls.js 播放，按需加载 hls.js；“新窗口打开”根据当前状态自适应选择 mpegts.js（组播直播）或 hls.js（单播/回看）
  - 切换直播⇄回看、关闭/停止/切换频道时，统一销毁 mpegts/hls 实例并清空 video 源，避免内核冲突与残留播放
- 播放入口与按钮
  - 结果页与“编辑频道信息”弹窗新增“外部播放器/网页播放”按钮：外部播放器桌面自动匹配 PotPlayer、移动端匹配 VLC；网页播放打开简洁模式 player 页面（隐藏频道列表与节目单）
  - 列表页播放按钮策略统一：组播走 mpegts.js，单播走 hls.js；打开 player.html 时附加 ui=mini
- 地址规范
  - 组播地址规范化为 udpxy /rtp/ + 纯地址，组播直播自动追加 FCC 参数且避免重复追加；与显示地址逻辑保持一致
- 搜索与界面
  - 结果页搜索框支持“分辨率”关键字
  - “EPG 与 回看”弹窗新增最大化按钮，可在全屏与居中卡片之间切换
- 稳定性
  - 增强错误处理与日志；优化切换流程的可靠性
- 版本号更新至 1.3.0
### v1.2.2 (2026-02-18)
- EPG/回看：LIVE 节目直接调用单播完整地址；复制栏显示原始地址，网页播放走代理（/api/proxy/hls 或 /api/proxy/stream）；组播频道在 LIVE 时自动匹配单播候选或基于回放基址拼接单播参数（zte_offset=30、ispcode=2、starttime=$单播），显著提升兼容性与成功率
- EPG 标题行新增“上一个频道/停止/下一个频道”按钮，支持在弹窗内切换频道与一键停止播放
- 状态联动优化：LIVE 点击显示“正在直播”，回看点击显示“正在回看”，二者互斥展示
- 稳定性：关闭/停止时销毁 Hls、暂停并清空视频源，避免后台继续播放；切换频道后标题与地址栏即时刷新
- 版本号更新至 1.2.2


### v1.2.1 (2026-02-18)
- TXT 导出支持分组：输出“分组名,#genre#”，其后为“频道名,地址”
- 导出弹窗文案更新：明确 TXT 为分组格式
- 接口弹窗布局优化：Token 固定第一行；第二行按“状态→范围→单播协议→回放格式”顺序展示
- 登录页图标更换为电视样式（更贴合 IPTV）
- CI 优化：Docker 构建仅在源码改动时触发（md 文档改动不触发）
- 版本号更新至 1.2.1

### v1.2.0 (2026-02-18)
- 新增接口弹窗下拉：单播协议（HTTP/RTSP）、回放格式预设
- 扩展导出：/api/export/m3u 支持 proto=http|rtsp 与多种 fmt（iso8601、npt、rtsp_range、playseek、startend14、beginend14、unix_s、unix_ms），保留酷9、mytv逻辑不变
- 调整布局：接口弹窗分两行，第一行 Token；第二行 状态→范围→单播协议→回放格式
- 版本号更新至 1.2.0

### v1.1.0 (2026-02-18)
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

### v1.3.2 (2026-02-21)
- 安全与认证
  - 将 player.html 纳入登录保护；未登录重定向至登录页并支持 redirect 回跳
  - login.html 增加 redirect 解析与同源校验
- 播放体验
  - 默认不静音；若浏览器拦截自动播放，首次点击后继续以未静音播放
  - EPG 节目单面板上下对称留白，避免贴近黑边与进度条
- 回看与地址规范
  - 外网回看拼接遵循“单播代理 + 回放源基础 URL + 酷9时间参数”，阻断 /rtp/ 组播路径误拼
  - EPG/回看在外网模式下统一走单播代理
- 台标与外观
  - 内/外网台标模板自动选择，统一通过 /api/logo 加载
- 导出与接口
  - 新增 TVBox/猫影视 JSON（/api/export/tvbox）与 Xtream Codes JSON（/api/export/xtream）
  - 接口弹窗新增上述直连接口项
- 文档与许可
  - 重构 README：简介与功能说明精简、美化，新增 GHCR/DockerHub 简介段
  - 新增 LICENSE（MIT）与 MIT 徽章；package.json 增加 license 字段

### v1.0.1 (2026-02-17)
- 🔐 外网导出支持 token 验证，未携带或错误 token 拒绝访问
- 🐛 修复导出接口异常（TXT ordered 未定义、M3U udpxyServers 未定义）
- 🖼️ 编辑频道弹窗新增台标预览；▶️ 增加 PotPlayer 播放按钮
- 📚 M3U 导出增强：tvg-*、group-title、catchup 与 catchup-source；支持 ?fcc 参数与质量后缀
- 🧠 同名频道排序按质量优先：组播 4K > HD > SD > 单播；帧率高者优先
- 🔁 检测逻辑优化：同地址只刷新状态，不改动名称、分组、Logo 等其他字段
- 🧭 组播范围界面布局优化：交换 CIDR/并发 与 起始/结束地址位置，操作更顺手
- 💾 新增版本持久化能力：支持保存、加载、删除版本及版本列表接口

### v1.0.0 (2025-05-25)
- 🎉 首次发布
- ✨ 支持批量检测 IPTV 组播流
- 🚀 实现 Docker 容器化部署
- 📦 提供 Docker Hub 镜像
- 🛠️ 基于 Alpine Linux 优化镜像体积
- 🔒 增加容器安全性配置
- 📝 完善部署文档

---

## 侵权说明
本项目仅供学习与交流，严禁用于任何商业用途或非法用途。若涉及版权或侵权问题，请联系作者及时删除相关内容。

## 免责说明
本软件为开源项目，作者不对因使用本软件造成的任何直接或间接损失承担责任。使用本软件即视为同意本声明。

---

🙏 感谢您的使用！如需了解完整许可内容，请查阅根目录的 [LICENSE](file:///c:/Users/%E8%B6%85%E5%93%A5%E5%93%A5/Downloads/Iptv-web-Checker/LICENSE) 文件。

---

## 容器镜像页面简介（GHCR / Docker Hub 可复制）

```
IPTV Checker —— IPTV 组播/单播流检测与管理工具

• 批量检测：在线/离线、分辨率、帧率、编码
• 播放内核：组播→mpegts.js，单播/回看→hls.js（默认非静音）
• EPG/回看：节目单联动，外网回看遵循“单播代理 + 基础URL + 时间参数”
• 内/外网：代理/UDPXY/FCC/台标模板/EPG 源按内外网区分
• 导出生态：TXT/M3U/JSON、TVBox/猫影视 JSON、Xtream Codes JSON
• 安全：登录保护，外网导出可加 Token

开源许可：MIT（详见仓库 LICENSE）

快速启动（host 模式）：
docker run -d --network host --name iptv-checker -e TZ=Asia/Shanghai -e PORT=${IPTV_PORT:-3000} -v $(pwd)/data:/app/data ghcr.io/cgg888/iptv-checker:latest
```
