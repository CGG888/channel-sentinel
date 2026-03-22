# 频道哨兵 Channel Sentinel

<p align="center">
  <img src="./Sentinel.png" alt="频道哨兵 图标" width="160">
</p>

![频道哨兵 检测空数据界面](./public/preview-empty.png)

🏷️ 版本号：
![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/cgg888/channel-sentinel?sort=semver)
![Build Status](https://img.shields.io/github/actions/workflow/status/cgg888/channel-sentinel/docker-image.yml?branch=main)
![GHCR](https://img.shields.io/badge/GHCR-channel--sentinel-2ea44f?logo=github)
![Docker Pulls](https://img.shields.io/docker/pulls/cgg888/channel-sentinel?logo=docker)
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
## 🌟 项目简介（当前版本：![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/cgg888/channel-sentinel?sort=semver)）

频道哨兵（Channel Sentinel）是一款基于 Node.js + Express + ffprobe 的 IPTV 组播/单播流检测与管理工具，提供现代化 Web 界面与丰富生态导出。支持单播、组播批量检测、EPG 与回看、单播组播独立播放器、内/外网模式、台标模板（内/外网区分）、多种导出（M3U/TXT/JSON、TVBox、Xtream）、安全登录与令牌保护等能力，适用于运营网与实验环境中的频道维护、线路切换与对接。（基于湖南常德电信 IPTV 场景测试；单播以中兴平台 HTTP 单播为主）

### 核心特性一览
- 批量检测：在线/离线、分辨率、帧率、编码，合并同源不覆写元数据
- 智能播放：组播直播走 mpegts.js，单播/回看走 hls.js；默认非静音；失败自动重试
- EPG/回看：节目单查询、状态联动、快捷切换；回放规则统一由后端规则中心执行
- 内/外网模式：按访问场景切换代理与数据源；前端仅调用后端接口
- 台标模板：支持内/外网模板与占位回退，统一 /api/logo 加载
- 导出丰富：TXT/M3U/JSON 以及 TVBox/猫影视 JSON、Xtream Codes JSON
- 接口集合：一键生成“播放器直连接口链接”，支持状态/范围/协议/回看格式参数
- 安全鉴权：登录保护（含播放器页）、外网导出可加 Token，验证码防爆破
- 版本与数据：SQLite 主数据库 + 版本快照管理，data 目录集中配置（代理、UDPXY、FCC、模板、分组等）

### 支持的回看格式与规则
- 格式：iso8601、ku9、mytv、npt、rtsp_range、playseek、startend14、beginend14、unix_s、unix_ms
- 规则来源：`replay_base_rules.json` + `time_placeholder_rules.json`
- 统一执行：回放基址提取、时间参数拼接、协议适配全部由后端规则中心完成
- 可观测与回滚：支持命中日志、规则状态、快照与回滚接口

### 内/外网模式说明
- 内网
  - 组播：udpxy（或 rtp2httpd）基址 + /rtp/ + ip:port + ?fcc=...
  - 单播：保留原始 http(s) 地址
  - EPG/台标：使用“内网”源与模板
- 外网
  - 组播：使用“组播代理”基址拼接 /rtp/ip:port 并继承 httpParam
  - 单播与回看：使用“单播代理”与后端统一规则中心生成地址
  - EPG/台标：使用“外网”源与模板

### 典型使用场景
- 运营维护：批量体检频道质量，按组规则归类与导出，随时切换主备线路
- 对外对接：为 TVBox/猫影视或 Xtream 生态生成可用 JSON/链接，并可加 Token
- 内外网切换：同一套数据在内/外网环境下稳定可播，减少手工改地址成本


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
- 回放地址生成：仅调用 `/api/catchup/play`，不在前端拼接回放参数
- 支持格式：iso8601、ku9、mytv、npt、rtsp_range、playseek、startend14、beginend14、unix_s、unix_ms

### 编辑与配置
- 频道管理统一在“频道页面（results.html）”进行
- 主页仅用于检测任务、进度与统计，不承担频道展示与频道编辑
- 频道编辑：名称、tvg-id/name、Logo 预览、分组、时移（catchupFormat/catchupBase/m3uCatchupSource/httpParam）
- 回放基址自动展示：按规则中心 + 当前内外网范围自动推导到“回放源基础 URL”
- 完整回放地址可编辑：编辑框支持直接维护 `catchup-source`（完整模板地址）
- 台标模板：内/外网模板区分，统一通过 /api/logo 加载
- 代理与 UDPXY：组播代理/单播代理配置；udpxy 列表与 currentId
- EPG 源：内/外网源维护与选择；应用设置支持内/外网模式切换

### 导出与接口
- TXT/M3U（含 tvg-*、group-title、catchup、catchup-source、?fcc 与质量后缀）
- JSON 导出：TVBox/猫影视（/api/export/tvbox）、Xtream Codes（/api/export/xtream）
- 接口弹窗：状态/范围/协议/回看格式参数；支持直连集合（复制/打开/播放）
- 外网导出可启用 Token；提供 /api/persist、/api/export、/api/config 等接口
- 规则运维接口：`/api/system/replay-rules/status|hits|snapshots|snapshot|rollback`
- 回放预览接口：`/api/catchup/profile`（用于频道编辑页展示“规则推导基址 + 完整回放地址模板”）

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

- 🔧 **后端**：Node.js + Express，调用 ffprobe 命令行工具检测流媒体信息，模块化服务层（检测流服务、EPG 服务、导出服务、回放规则引擎、录像服务、运维可观测）
- 🎯 **前端**：原生 HTML+CSS+JS，Bootstrap 5 + shadcn/ui 组件样式，模块化 JS（每个页面按域划分模块，模块优先 + 内联兜底）
- 💾 **数据存储**：SQLite 持久化（channel_sentinel.db），重启后自动恢复
- 🎨 **CSS 架构**：页面样式全提取为独立 CSS 文件（player.css / login.css / results.css / common-nav.css / custom.css / theme-tokens.css / shadcn-ui.css）

## 📂 项目结构

详细目录结构请查看：[项目结构 (PROJECT_STRUCTURE)](./docs/PROJECT_STRUCTURE.md)

---

## 部署

### 方式一：Docker（推荐生产）
Docker 运行（GitHub 镜像，host 模式）：
```bash
docker pull ghcr.io/cgg888/channel-sentinel:latest
docker run -d --network host --name channel-sentinel -e TZ=Asia/Shanghai -e PORT=${IPTV_PORT:-3000} -v $(pwd)/data:/app/data ghcr.io/cgg888/channel-sentinel:latest
```
Docker 运行（Docker Hub 镜像，host 模式）：
```bash
docker pull cgg888/channel-sentinel:latest
docker run -d --network host --name channel-sentinel -e TZ=Asia/Shanghai -e PORT=${IPTV_PORT:-3000} -v $(pwd)/data:/app/data cgg888/channel-sentinel:latest
```
Compose（生产，host 模式）：

Github 镜像 Compose（生产，host 模式）：
```yaml
services:
  channel-sentinel:
    image: ghcr.io/cgg888/channel-sentinel:latest
    container_name: channel-sentinel
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
  channel-sentinel:
    image: cgg888/channel-sentinel:latest
    container_name: channel-sentinel
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
git clone https://github.com/cgg888/channel-sentinel.git channel-sentinel
cd channel-sentinel
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
  channel-sentinel-dev:
    build: .
    container_name: channel-sentinel-dev
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
注意：Windows 中文路径可能导致卷挂载异常，建议使用英文路径（如 C:\Work\channel-sentinel）

## Linux 服务器一键部署

Debian/Ubuntu（systemd 服务）：
```bash
#!/usr/bin/env bash
set -e
sudo apt update
sudo apt install -y curl git ffmpeg
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
sudo useradd -r -s /usr/sbin/nologin sentinel || true
sudo mkdir -p /opt
sudo chown -R "$USER":"$USER" /opt
git clone https://github.com/cgg888/channel-sentinel.git /opt/channel-sentinel
cd /opt/channel-sentinel
npm ci || npm install
sudo tee /etc/systemd/system/channel-sentinel.service >/dev/null <<'EOF'
[Unit]
Description=Channel Sentinel Service
After=network.target

[Service]
Type=simple
User=sentinel
WorkingDirectory=/opt/channel-sentinel
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/channel-sentinel/src/index.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now channel-sentinel
sudo systemctl status channel-sentinel --no-pager
```

CentOS/RHEL（systemd 服务）：
```bash
#!/usr/bin/env bash
set -e
sudo yum install -y curl git ffmpeg
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo -E bash -
sudo yum install -y nodejs
sudo useradd -r -s /sbin/nologin sentinel || true
sudo mkdir -p /opt
sudo chown -R "$USER":"$USER" /opt
git clone https://github.com/cgg888/channel-sentinel.git /opt/channel-sentinel
cd /opt/channel-sentinel
npm ci || npm install
sudo tee /etc/systemd/system/channel-sentinel.service >/dev/null <<'EOF'
[Unit]
Description=Channel Sentinel Service
After=network.target

[Service]
Type=simple
User=sentinel
WorkingDirectory=/opt/channel-sentinel
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/channel-sentinel/src/index.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now channel-sentinel
sudo systemctl status channel-sentinel --no-pager
```

## 版本管理

- 当前为 SQLite 主模式（readMode=sqlite / writeMode=sqlite）
- 前端操作：首页与结果页均提供备份能力
  - 保存：落盘 SQLite 并生成带时间戳的数据库备份（channel_sentinel-YYYYMMDD-HHMMSS.db）
  - 加载：通过 SQLite 备份恢复数据
  - 列表：展示 SQLite 备份列表
- 建议接口
  - /api/persist/save、/api/persist/backups、/api/persist/load-backup（type=sqlite）、/api/persist/sqlite-backup


## 数据文件说明（/data）

### SQLite 数据库

| 表名 | 说明 |
|------|------|
| `streams` | 频道数据（名称、URL、状态、分组、台标、回看参数等） |
| `app_settings` | 应用设置（内外网地址、Token、WebDAV 配置等） |
| `fcc_servers` | FCC 时移服务器 |
| `udpxy_servers` | UDPXY / rtp2httpd 服务器 |
| `group_titles` | 频道分组名称与颜色 |
| `group_rules` | 自动分组匹配规则 |
| `epg_sources` | EPG 节目单数据源 |
| `logo_templates` | 台标 URL 模板 |
| `proxy_servers` | 组播/单播代理服务器 |
| `users` | 用户账号 |
| `snapshots` | 版本快照记录 |

### 版本快照文件

- `channel_sentinel.db` — SQLite 主数据库
- `channel_sentinel-YYYYMMDD-HHMMSS.db` — 带时间戳的数据库备份

## 安全与限制

- 外网导出需正确 token，错误或缺失将返回 403
- ffprobe 超时时间约 8 秒；检测结果缓存 5 分钟以提升性能
- 数据以 SQLite 持久化，重启后自动从数据库恢复


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

详细更新记录请查看：[版本历史 (CHANGELOG)](./docs/CHANGELOG.md)

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
Channel Sentinel —— 频道监测与状态守护平台

• 批量检测：在线/离线、分辨率、帧率、编码
• 播放内核：组播→mpegts.js，单播/回看→hls.js（默认非静音）
• EPG/回看：节目单联动，外网回看遵循“单播代理 + 基础URL + 时间参数”
• 内/外网：代理/UDPXY/FCC/台标模板/EPG 源按内外网区分
• 导出生态：TXT/M3U/JSON、TVBox/猫影视 JSON、Xtream Codes JSON
• 安全：登录保护，外网导出可加 Token

开源许可：MIT（详见仓库 LICENSE）

快速启动（host 模式）：
docker run -d --network host --name channel-sentinel -e TZ=Asia/Shanghai -e PORT=${IPTV_PORT:-3000} -v $(pwd)/data:/app/data ghcr.io/cgg888/channel-sentinel:latest
```
