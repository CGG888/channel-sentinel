# IPTV Checker

![IPTV 图标](./iptv.png)

![Iptv-Checker 检测空数据界面](./public/preview-empty.png)

🏷️ 版本号：
![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/cgg888/iptv-checker?sort=semver)
![GitHub Downloads (all releases)](https://img.shields.io/github/downloads/cgg888/iptv-checker/total)
![Build Status](https://img.shields.io/github/actions/workflow/status/cgg888/iptv-checker/docker-image.yml?branch=main)
![GHCR](https://img.shields.io/badge/GHCR-iptv--checker-2ea44f?logo=github)
<!-- GHCR-DOWNLOADS-START -->
![GHCR Downloads](https://img.shields.io/badge/GHCR%20Downloads-0-2ea44f?logo=github)
<!-- GHCR-DOWNLOADS-END -->
<!-- GHCR-DOWNLOADS-END -->

---

## 🌟 项目简介（当前版本：![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/cgg888/iptv-checker?sort=semver)）

Iptv-Checker 是一款基于 Node.js + Express + ffprobe 的 IPTV 组播流检测与管理工具，提供现代化 Web 界面，支持批量检测、状态筛选、导出等功能，适用于 IPTV 网络环境下的组播流批量检测、维护和导出。（软件基于湖南常德电信IPTV测试，单播为中兴平台http单播，请知悉）

---

## ⚡ 软件功能说明
- 🔍 检测与列表
  - 批量/单条检测：自动获取在线状态、分辨率、帧率、编码等
  - 筛选：全部/在线/离线、组播/单播
  - 搜索：支持 名称/分组/地址/tvg/FCC/分辨率
  - 排序：同名按质量优先（组播 4K > 1080p > 720p > 单播），考虑帧率
  - 合并策略：同地址仅刷新状态，不覆盖名称/分组/Logo 等元数据
  - 实时统计：总数、在线、离线
- 🎬 播放与 EPG/回看
  - 网页播放器：组播直播用 mpegts.js；单播直播与回看用 hls.js；支持简洁模式（ui=mini）
  - 组播地址规范：udpxy 基址 + /rtp/ + 纯地址，自动追加 FCC，避免重复
  - EPG 与回看弹窗：节目单查询、当前直播/回看状态联动、上一频道/停止/下一频道
  - 新窗口播放：根据状态自适应选择 mpegts.js（组播直播）或 hls.js（单播/回看）
  - 弹窗最大化：一键在全屏与卡片式之间切换
  - 外部播放器：桌面调用 PotPlayer、移动端调用 VLC（设备自适应）
- �️ 编辑与配置
  - 频道编辑：名称、tvg-id/name、Logo 预览、分组、时移（catchupFormat/catchupBase/httpParam）
  - 台标模板：支持模板管理与一键匹配
  - 代理/UDProxy：配置组播代理、单播代理；udpxy 列表与 currentId
  - EPG 源管理：内/外网 EPG 源增删改与选择
  - 应用设置：内/外网模式与基址、外网使用开关
- � 导出与接口
  - 导出 TXT/M3U：包含 tvg-*、group-title、catchup 与 catchup-source，支持 ?fcc 与质量后缀（$标清/高清/超高清）
  - 接口弹窗：状态/范围/单播协议（HTTP/RTSP）/回放格式（iso8601、ku9、mytv、npt、rtsp_range、playseek、startend14、beginend14、unix_s、unix_ms）
  - 安全：外网导出需 Token；支持生成直连接口链接
  - API：提供 /api/persist、/api/export、/api/config 等读写接口
- 💾 版本与更新
  - 版本管理：保存/加载/删除版本，自动加载最新版本
  - 版本显示与更新检查：页面展示当前版本，检查 GitHub 最新版本；Docker 提示拉镜像，本地支持 git pull 引导
- 🔐 安全与部署
  - 登录鉴权：账号密码登录（默认 admin/admin），图形验证码防爆破
  - 部署方式：Docker 运行/开发映射、本地 Node.js、Linux 一键部署脚本
  - 数据持久化：data 目录映射与多配置文件（udpxy、fcc、分组、模板、代理、设置等）
- ⚙️ 稳定性与体验
  - 内核切换：切换直播/回看自动销毁 mpegts/hls 实例，避免冲突与泄露
  - 错误处理：增强日志与异常捕获
  - UI：自适配 PC/移动端，现代化卡片式界面

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

## 使用指南（简要）

- 批量检测
  - 文本粘贴：在页面输入框粘贴 “频道名,rtp://ip:端口” 列表，点击开始检测
  - 网络加载：填入远程 txt/m3u 链接（http/https），点击“网络加载”抓取并解析，内部使用接口解析文本
  - 本地上传：上传本地 txt/m3u 文件，自动解析并填充列表
- 内/外网模式
  - 内网：组播导出使用当前 rtp2httpd（udpxy）服务器的 currentId 指向的地址作为基址
  - 外网：导出走外网代理或外网 UDPXY；若启用 token，则必须携带正确 token
- 频道编辑弹窗
  - 字段：名称、tvgId/tvgName、Logo、分组、时移（catchupFormat/catchupBase/httpParam）
  - 台标预览：Logo 输入后自动显示预览
  - 播放按钮：可调用 PotPlayer（potplayer://play?url=...）；需本机已安装 PotPlayer
- 时移（Catchup）
  - 全局参数：在设置页配置 globalFcc；生成 httpParam（fcc=...）并应用到新检测记录
  - 导出格式：fmt=default/ku9/mytv，不同格式生成不同 catchup-source
  - 单播基址：内网保留原始地址；外网通过“代理”类型的基址拼接

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

## 常见操作

- 同名排序：组播 4K > HD > SD > 单播，帧率高者优先
- 检测合并：同地址仅刷新状态字段，不覆盖名称、分组、Logo 等
- 跨域播放：调试 HLS 可使用 /api/proxy/stream
- PotPlayer 播放：点击编辑弹窗按钮或使用 potplayer://play?url=... schema


#### 💡 常见问题
1. 🔄 如果端口被占用，修改端口映射（例如："8080:3000"）
2. 🔒 如果拉取失败，检查 Docker 登录状态
3. 🌐 国内用户如果 GitHub 镜像拉取较慢，建议切换到阿里云镜像
4. 📋 查看实时日志：`docker-compose logs -f`
5. 🔄 重启容器：`docker-compose restart`
6. ⬆️ 更新镜像：`docker-compose pull && docker-compose up -d`



#### 6 注意事项
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

#### 7 常见问题解决
- 📡 **无法拉取镜像**：
  - GitHub 镜像拉取慢：尝试使用阿里云镜像
  - 网络问题：检查网络连接和防火墙设置
- 🚫 **容器无法启动**：
  - 检查端口是否被占用：`netstat -nltp | grep 3000`
  - 查看容器日志：`docker logs iptv-checker`
- 💾 **数据持久化问题**：
  - 确保挂载目录存在且有正确的权限
  - 可执行 `docker exec -it iptv-checker ls -la /app/data` 检查容器内权限

---

## 版本历史
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

## 📌 其他说明
- 💻 支持 Windows、Linux、Docker 部署
- ⚙️ 如需自定义端口，请修改 `src/index.js` 中的 `port` 变量
- 💾 如需持久化存储，可自行扩展存储逻辑
- 💡 建议定期备份检测结果（如有需求可自行开发导出/导入功能）
- 🔄 如遇到页面功能异常，请尝试刷新页面或更换浏览器

---

---

🙏 感谢您的使用！

---

## 页面预览

![Iptv-Checker 界面截图](./public/preview.png)
![Iptv-Checker 界面截图](./public/preview1.png)
![Iptv-Checker 界面截图](./public/preview2.png)
![Iptv-Checker 界面截图](./public/preview3.png)
