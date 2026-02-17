# IPTV Checker

![Iptv-Checker 检测空数据界面](./public/preview-empty.png)

🏷️ 版本号：![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/cgg888/iptv-checker?sort=semver)  

---

## 🌟 项目简介

Iptv-Checker 是一款基于 Node.js + Express + ffprobe 的 IPTV 组播流检测与管理工具，提供现代化 Web 界面，支持批量检测、状态筛选、导出等功能，适用于 IPTV 网络环境下的组播流批量检测、维护和导出。

---

## ⚡ 软件功能说明

- 🔍 **批量检测**：支持批量导入 IPTV 组播流地址，自动检测每路流的在线状态、分辨率、编码、帧率等信息
- 🎯 **单条检测**：可单独检测某一路组播流
- 🔄 **状态筛选**：可按"全部/在线/离线"筛选显示检测结果
- 🔎 **搜索功能**：支持按频道名或地址模糊搜索
- 📤 **导出功能**：
  - 📝 TXT 格式：频道名称,rtp://ip:端口，每行一条
  - 📋 M3U 格式：标准 M3U，地址为 UDPXY服务器/rtp/ip:端口
  - 💡 导出前弹窗说明格式，M3U分组请用EPG软件
- 🗑️ **删除/清空**：支持单条删除和一键清空所有检测结果
- 📊 **统计信息**：实时显示总数、在线、离线数量
- 🎨 **美观UI**：响应式设计，适配 PC 和移动端
- 🖼️ **频道编辑**：支持编辑名称、tvgId/tvgName、Logo、分组、时移；弹窗内含台标预览与 PotPlayer 播放按钮
- 📚 **M3U 导出增强**：包含 tvg-*、group-title、catchup="default" 与 catchup-source；支持 ?fcc 参数与质量后缀（$标清/高清/超高清）
- 🔐 **内/外网导出与安全**：外网导出需携带正确 token；内网导出对组播流使用当前 rtp2httpd 服务器地址
- 🧠 **同名排序优化**：同名频道按质量优先排序（组播 4K > HD > SD > 单播），同时考虑帧率
- 💾 **版本管理**：支持保存当前数据为版本、版本列表展示、按版本加载/删除（streams.json 与按时间戳生成的版本文件）
- ⚙️ **配置接口**：提供 FCC 服务器、台标模板、分组标题与分组规则、代理列表、应用设置等读写接口
- 🔁 **检测合并策略**：同地址检测结果只刷新状态字段，不覆盖名称、分组、Logo 等元数据

---

## 🛠️ 实现方式

- 🔧 **后端**：Node.js + Express，调用 ffprobe 命令行工具检测流媒体信息，缓存检测结果提升性能
- 🎯 **前端**：原生 HTML+CSS+JS，Bootstrap 5 美化界面，AJAX 与后端交互
- 💾 **数据存储**：检测结果存储于内存，重启服务后会清空

---

## 部署

### 方式一：Docker（推荐生产）
Docker 运行（GitHub 镜像）：
```bash
docker pull ghcr.io/cgg888/iptv-checker:latest
docker run -d -p 3000:3000 --name iptv-checker ghcr.io/cgg888/iptv-checker:latest
```
Docker 运行（阿里云镜像）：
```bash
docker pull registry.cn-hongkong.aliyuncs.com/cgg888/iptv-checker:latest
docker run -d -p 3000:3000 --name iptv-checker registry.cn-hongkong.aliyuncs.com/cgg888/iptv-checker:latest
```
Compose（生产）：
```yaml
services:
  iptv-checker:
    user: "1000:1000"
    image: ghcr.io/cgg888/iptv-checker:latest
    container_name: iptv-checker
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - TZ=Asia/Shanghai
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    networks:
      - iptv-network

networks:
  iptv-network:
    driver: bridge
```
提示：
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
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - TZ=Asia/Shanghai
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
