# 频道哨兵 Channel Sentinel 使用指南（Wiki）

> 目标：让第一次接触频道哨兵的用户”看得懂、用得上、能排错”。本页涵盖快速上手、核心概念、页面导览、配置说明、播放与回看、导出与对接、版本与更新、安全管理、常见问题与排障。

---

## 目录
- 1. 快速上手
- 2. 核心概念速览
- 3. 页面导览与常用操作
- 4. 检测与列表管理
- 5. 播放、EPG 与回看
- 6. 配置与管理（代理、UDPXY、EPG、模板、分组）
- 7. 导出与生态对接（M3U/TXT/JSON、TVBox、Xtream）
- 8. 版本与数据持久化
  - 8.5 旧版数据导入 SQLite
- 9. 版本更新与”红点”提示
- 10. 安全与鉴权
- 11. 日志中心
- 12. 常见问题（FAQ）
- 13. 故障排查指南
- 14. 附录（接口速查、术语说明、许可）

---

## 1. 快速上手

1) Docker（推荐生产）  
- 拉取镜像并运行（host 网络）：  
  `docker run -d --network host --name channel-sentinel -e TZ=Asia/Shanghai -e PORT=${IPTV_PORT:-3000} -v $(pwd)/data:/app/data ghcr.io/cgg888/channel-sentinel:latest`
- docker-compose 示例：

  ```yaml
  services:
    channel-sentinel:
      image: ghcr.io/cgg888/channel-sentinel:latest
      container_name: channel-sentinel
      network_mode: host
      environment:
        - TZ=Asia/Shanghai
        - PORT=3000
      volumes:
        - ./data:/app/data
      restart: unless-stopped
  ```

- 访问地址：`http://localhost:3000`（本地开发地址）
- 数据持久化：容器内 /app/data 映射到宿主机 ./data，包含频道、模板、EPG 源等所有配置与快照。

2) 本地 Node.js（开发/轻量）  
- 准备：Node.js 18+、ffmpeg（含 ffprobe）、git、现代浏览器  
- 安装与启动：`npm ci || npm install`，然后 `npm start`
- Windows 注意：请将 ffprobe.exe 所在目录加入 PATH；首次启动若 3000 端口占用请更换 `PORT` 环境变量。

3) 首次登录  
- 默认账号/密码：`admin / admin`，登录需输入验证码（可点击刷新）
- 修改密码：右上角头像 → 修改密码；建议首次登录立即更改。

4) 系统要求与浏览器支持  
- 服务端：Linux/Windows/macOS；内存 ≥ 512MB；需要可执行 ffprobe。  
- 浏览器：Chrome/Edge 新版；移动端支持 HLS 播放，部分机型对 TS 流自动播放策略更严格。  
- 端口：默认 `3000`，可通过环境变量 `PORT` 指定。

---

## 2. 核心概念速览

- 组播与单播：运营网内常见 RTP 组播；单播多为 HTTP/HLS。  
- UDPXY/rtp2httpd：将组播转换为 HTTP 方便浏览器播放（前端用 mpegts.js）。  
- 代理（Proxy）：“组播代理/单播代理”用于外网模式下拼接对外可访问的地址。  
- FCC：快速信道切换参数（`?fcc=ip:port`），导出或播放时可附加。  
- EPG：电子节目单数据源（内/外网可分），用于节目单与回看。  
- 内/外网模式：决定地址拼接、EPG 源、台标模板的选择策略。  
- 台标模板：按 tvgId/tvgName 等匹配台标；内/外网模板可分别配置。  
- 数据目录（/data）：保存 streams.json、模板、代理、UDPXY、FCC、分组与规则等。
- 协议支持：RTP（经由 UDPXY/rtp2httpd 转 HTTP 播放）、HTTP/HLS、部分带回看参数的时间格式。

网络拓扑示例：  
- 纯内网：机顶盒/浏览器 → UDPXY/rtp2httpd → 频道哨兵（导出接口供第三方播放）。
- 外网访问：客户端 → 反向代理(Nginx) → 频道哨兵 → 外网代理/回看源（组播经”外网组播代理”）。  

---

## 3. 页面导览与常用操作

- 首页（检测页）：导入/输入地址进行批量检测；支持筛选、搜索、排序、统计。  
- 首页职责限定：仅检测与统计，不承担频道展示与频道编辑。  
- 结果页：集中管理频道元数据（名称、分组、Logo、catchup 参数等）并保存版本。  
- 播放器页：根据直播/回看/协议自动选用 mpegts.js 或 hls.js；支持外部播放器。  
- 登录页：账号密码 + 图形验证码；未登录将拦截核心页面与接口访问。  
- 页脚版本信息：点击可打开“关于/更新”弹窗；若有新版本会显示红点并闪烁。
- 常用入口：  
  - “接口”按钮：生成 TXT/M3U/JSON/TVBox/Xtream 导出链接；  
  - “保存版本”：对当前频道库快照；  
  - “加载版本”：回滚到任一历史快照（不影响快照文件本身）；  
  - “批量编辑”：分组、台标、catchup 字段批量写入。

---

## 4. 检测与列表管理

- 批量/单条检测：自动识别在线状态、分辨率、帧率、编码等。  
- 合并策略：同地址仅刷新状态，不覆盖名称/分组/Logo 等已有元数据。  
- 排序规则：同名优先级为 组播4K > 1080p > 720p > 单播，帧率更高优先。  
- 搜索与筛选：按名称/分组/地址/tvg/FCC/分辨率；筛选在线/离线、组播/单播。  
- 实时统计：展示总数、在线、离线。  
- 导入方式：  
  - 文本框粘贴：每行一个地址（可带名称，如 `CCTV-1,http://example/live.m3u8`）；  
  - 上传文件：支持 txt/m3u（标准 M3U 带 `#EXTINF` 元数据更佳）。
- 小技巧：  
  - 同名多源：按优先级排序；  
  - 已有列表二次检测：只会刷新在线状态与画质信息，避免重命名被覆盖。

UDPXY 快速部署（示例，非本项目组件）：  
- OpenWrt：通过软件包安装 `udpxy`，配置 `-m br-lan -p 4022`。  
- Linux：`udpxy -m eth0 -p 4022`；确认 `http://<host>:4022/status` 可访问。  

---

## 5. 播放、EPG 与回看

- 播放内核：  
  - 组播直播 → mpegts.js（经由 UDPXY/rtp2httpd）；  
  - 单播直播与回看 → hls.js。  
- 默认音频：默认“非静音”。若浏览器拦截自动播放，首次点击后继续。  
- EPG 面板：节目单查询、当前状态联动、上一频道/停止/下一频道；面板上下留白不贴边。  
- 回看规范（外网重点）：回放基址与时间参数均由后端规则中心统一生成，前端仅调用接口。  
- 频道编辑页支持自动展示“回放源基础 URL”，并新增“回放地址（完整）”编辑框用于维护 catchup-source 模板。  
- 支持的回看时间格式：`iso8601、ku9、mytv、npt、rtsp_range、playseek、startend14、beginend14、unix_s、unix_ms`。  
- 外部播放器：桌面 PotPlayer、移动端 VLC（设备自适应）。
- 示例：  
  - 直播（组播经 UDPXY）：`http://<udpxy-host>:<port>/rtp/<ip>:<port>`  
  - 回看：调用 `/api/catchup/play` 由后端返回最终可播 URL  
  - 规则预览：调用 `/api/catchup/profile` 返回规则推导基址与完整回放地址模板
- 常见问题：  
  - 无画面：确认 UDPXY 可直连访问；或 HLS 源跨域（CORS）未放行；  
  - 声音静音：浏览器策略导致，点击播放区域即可恢复；  
  - 回看报错：确认参数格式与时间范围正确、上游已开放回看接口。

回看时间格式示例（由规则中心渲染）：  
- iso8601：`...&start=2026-02-21T12:00:00Z&end=2026-02-21T13:00:00Z`  
- ku9：`...&starttime=20260221T120000&endtime=20260221T130000`  
- mytv：`...&starttime=20260221120000&endtime=20260221130000`  
- npt：`...&npt=12:00:00-13:00:00`  
- unix_s：`...&start=1771646400&end=1771650000`  
- unix_ms：`...&start=1771646400000&end=1771650000000`

### Windows 4K 播放说明（硬件加速）

在 Windows 上，4K 能否稳定播放取决于浏览器是否启用硬件加速、系统是否具备对应解码器（H.264/HEVC）以及播放链路是否通过 MSE（mpegts.js/hls.js）。按以下顺序配置与验证：

- 浏览器设置
  - 打开 `edge://settings/system`（或 Chrome 对应路径）
  - 启用“可用时使用硬件加速”
  - 点击“重新启动”使设置生效
- Windows 图形设置
  - 设置 → 系统 → 显示 → 图形设置
  - 打开“硬件加速 GPU 调度”（若设备支持）
  - 在“为应用设置图形性能首选项”里添加 Microsoft Edge/Chrome，选择“高性能”
- 显卡与编解码
  - 更新 GPU 驱动至厂商最新版本（NVIDIA/AMD/Intel 官方驱动）
  - 如需播放 HEVC/H.265：从 Microsoft Store 安装“HEVC 视频扩展”（或设备厂商版本）
- 避免被黑名单屏蔽（谨慎启用）
  - 打开 `edge://flags` / `chrome://flags`
  - 将“Override software rendering list（忽略软件渲染列表）”设为 Enabled
  - 将“Hardware-accelerated video decode（硬件加速视频解码）”设为 Enabled
  - “Choose ANGLE graphics backend”优先 D3D11（不稳定时可尝试 D3D11on12）
  - 重启浏览器
- 验证
  - 在地址栏输入 `edge://gpu`（或 `chrome://gpu`），关键项应显示“Hardware accelerated”（如 Video Decode、Rasterization、WebGL 等）
  - 播放 4K 时在 `edge://media-internals`/`chrome://media-internals` 检查是否走硬解（如 D3D11VideoDecoder）

提示：
- H.264/AVC 4K 在桌面浏览器上最通用；HEVC 需系统与硬件支持。  
- Chrome/Edge 对 AC3/E-AC3 音频支持有限，可能出现“有画无声”，建议优先 AAC 音轨。  
- 远程桌面（RDP）或虚拟机环境可能禁用 GPU，建议在本机直连下验证。  
- 本项目播放链路为 mpegts.js/hls.js → MSE → 硬件解码；仅当硬件加速开启且编解码匹配时，4K 才能稳定播放。

---

## 6. 配置与管理（代理、UDPXY、EPG、模板、分组）

- 代理/UDPXY：  
  - 组播代理/单播代理基址；  
  - UDPXY 列表与 currentId；  
  - 内外网切换时采用不同基址策略。  
- EPG 源：可维护“内网源/外网源”，并选择当前使用的源。  
- 台标模板：支持模板管理与一键匹配；内/外网模板分流；统一通过 `/api/logo` 加载。  
- 分组与规则：自定义分组名称与颜色，配置规则（按名称/关键字匹配）；支持批量操作。  
- 应用设置：内/外网模式与基址、外网使用开关等。
- 配置建议：  
  - 内网：优先 UDPXY；EPG 选内网数据源；台标模板走内网模板；  
  - 外网：组播经“外网组播代理”，单播走“单播代理”；EPG 改用外网源；Logo 使用外网模板。
- 分组规则示例：  
  - “包含 CCTV 关键字 → 分组 央视频道（红色）”；  
  - “包含 卫视 → 分组 省级卫视（蓝色）”。
- 台标模板示例（思路）：  
  - 按 tvg-id 精确匹配（优先），按 tvg-name 次之；  
  - 将常见频道名与台标 URL 放入模板库，提高导出兼容性。

Nginx 作为“单播代理/组播代理”的常见配置示例（仅思路）：  
- 组播代理通常由后端专用服务负责（如自建网关将组播转 HTTP），Nginx 负责域名层转发：  

```nginx
location /rtp/ {
  proxy_pass http://udpxy.lan:4022/rtp/;
}
location /hls/ {
  proxy_pass http://upstream-hls/;
}
```

---

## 7. 导出与生态对接（M3U/TXT/JSON、TVBox、Xtream）

- TXT/M3U：包含 tvg-*、group-title、catchup 与 catchup-source；支持 `?fcc` 与质量后缀（`$标清/高清/超高清`）。  
- JSON 导出：  
  - TVBox/猫影视 JSON：`/api/export/tvbox`；  
  - Xtream Codes 风格 JSON：`/api/export/xtream`。  
- 接口弹窗：状态/范围（内/外网）/协议（HTTP/RTSP）/回看格式选择；可生成“播放器直连接口链接”。  
- 安全：外网导出可启用 Token 校验（错误或缺失返回 403）。  

> 小贴士：  
> - 内网导出：组播使用当前 UDPXY 基址拼接；单播保留原始地址。  
> - 外网导出：组播使用“外网组播代理”基址拼接 `/rtp/ip:port`；单播使用“单播代理 + 去协议路径”。  

示例 M3U 片段：

```m3u
#EXTM3U
#EXTINF:-1 tvg-id="cctv1" tvg-name="CCTV-1 综合" tvg-logo="https://logo.example/cctv1.png" group-title="央视频道",CCTV-1 综合
http://proxy.example/rtp/239.1.1.1:1234?fcc=10.0.0.1:9999
```

示例 TVBox JSON 片段（简化）：

```json
{
  "lives": [
    {
      "name": "央视频道",
      "channels": [
        {
          "name": "CCTV-1 综合",
          "urls": ["http://proxy.example/rtp/239.1.1.1:1234"]
        }
      ]
    }
  ]
}
```
- 常见导出参数（以 M3U 为例，按页面生成为准）：  
- `scope=internal|external`：范围（内网/外网）  
- `status=online|offline|all`：在线状态筛选  
- `fmt=default|ku9|iso8601...`：回看时间格式  
- `proto=http|rtsp`：回看协议偏好  
- `token=xxxx`：外网启用 Token 时必须附带  

示例：  
`/api/export/m3u?scope=external&status=online&fmt=ku9&proto=http&token=YOUR_TOKEN`

---

## 8. 版本与数据持久化

- 主数据库：SQLite（`channel_sentinel.db`），存储所有配置与频道数据。
- 保存版本：生成 `channel_sentinel-YYYYMMDD-HHMMSS.db` 数据库备份（首页/结果页操作）。
- 启动行为：若 SQLite 为空，自动从 JSON 文件迁移（见 8.5 旧版数据导入）。
- SQLite 数据表：
  - `streams` — 频道数据（名称、URL、状态、分组、台标、回看参数等）
  - `app_settings` — 应用设置（内外网地址、Token、WebDAV 配置等）
  - `fcc_servers` — FCC 时移服务器
  - `udpxy_servers` — UDPXY / rtp2httpd 服务器
  - `group_titles` — 频道分组名称与颜色
  - `group_rules` — 自动分组匹配规则
  - `epg_sources` — EPG 节目单数据源
  - `logo_templates` — 台标 URL 模板
  - `proxy_servers` — 组播/单播代理服务器
  - `users` — 用户账号
  - `snapshots` — 版本快照记录
- 备份与恢复：
  - 本地备份：归档整个 `./data` 目录；
  - WebDAV 远程备份：通过”设置 → 应用设置”中的 WebDAV 功能备份；
  - 恢复：停止服务 → 覆盖 `./data` → 启动服务。

### WebDAV 远程备份/恢复

- 开启条件：在”应用设置”中配置 WebDAV（地址、用户名、密码、根目录、证书校验）。
- 备份接口：`POST /api/webdav/backup`
  - 行为：自动创建按年月日/时分的层级目录（MKCOL 容错 405 视为已存在），上传 SQLite 数据库备份文件。
  - 严格校验：若未成功上传任何文件，将返回失败并在”WebDAV”模块日志记录原因。
  - 响应：`{ success, folder, uploaded }`。
- 列表接口：`POST /api/webdav/list`
  - 行为：枚举根目录下的备份文件（使用 PROPFIND 扫描），用于恢复面板选择。
- 恢复接口：`POST /api/webdav/restore`（参数：`folder`）
  - 行为：从选定目录下载各配置文件写回 `/data`，逐文件记录成功/失败与异常。
  - 失败与兜底：网络或权限异常时会清晰记录，必要时保留旧文件不覆盖。
- 使用建议：
  - 优先在闲时执行备份；网络抖动时可重试。
  - 对外 WebDAV 建议启用 HTTPS 与专用账户；根目录保留只读/只写分区更安全。

---

### 8.5 旧版数据导入 SQLite

从 v2.0.0 起，频道哨兵以 SQLite 为主数据库。若你从旧版本（v1.x）升级，可通过以下方式将 JSON 数据迁移至 SQLite：

#### 迁移条件

- 旧版本的数据目录（包含 `streams.json` 等 JSON 文件）
- 新版本正常运行（SQLite 数据库已创建）

#### 操作步骤

1. **准备旧数据**：将旧版 `data/` 目录中的所有 JSON 文件复制到新版容器挂载的 `data/` 目录

2. **打开旧数据导入**：在任意页面顶部导航 → 设置 → 应用设置 → 旧数据导入

3. **指定目录（可选）**：若旧数据不在当前 `data/` 目录，可在输入框填写旧版 data 目录的完整路径

4. **确认导入**：点击”旧数据导入”按钮，弹出确认框后确认

5. **查看结果**：导入完成后弹窗显示各类型数据导入条数（频道、FCC、UDPXy、分组、EPG、台标、代理等）

#### 迁移范围

| 数据类型 | 说明 |
|---------|------|
| 频道（streams） | 全部频道及检测状态、台标、分组、回看参数等 |
| 应用设置 | 内外网地址、Token、WebDAV 配置（加密字段保留原值） |
| FCC 服务器 | 时移服务器列表 |
| UDPXY 服务器 | UDPXY/rtp2httpd 服务器列表 |
| 分组名称 | 频道分组及颜色 |
| 分组规则 | 自动分组匹配规则 |
| EPG 源 | 节目单数据源 |
| 台标模板 | 台标 URL 模板 |
| 代理服务器 | 组播/单播代理地址 |

#### 注意事项

- **幂等操作**：可多次执行，已有的数据不会丢失
- **raw 字段**：旧数据中 `streams[].raw` 字段（ffprobe 原始数据）不会被导入，SQLite 无此列
- **加密字段**：`app_settings.json` 中的 `securityToken` 和 `webdavPass` 加密值原样保留，不重新加密
- **建议**：迁移前备份当前 data 目录；迁移完成后重启服务确保所有配置生效

---

## 9. 版本更新与”红点”提示

- 页脚“当前版本”右侧在检测到新版本时出现红色闪烁圆点。  
- “关于/更新”弹窗：显示当前版本与最新发布的版本号及说明。  
- 本地源码安装（非 Docker）：  
  - 点击”立即更新”→ 自动设置远程为 `https://github.com/cgg888/channel-sentinel.git` → 拉取 tags；  
  - 自动切换到“最新发布”对应 tag（创建/更新本地 `release` 分支指向该 tag 提交）；  
  - 若本地存在未跟踪/未提交文件，会先自动 `git stash push -u` 备份再切换；  
  - 成功后提示“请手动重启服务生效”。  
- Docker 环境且未挂载 `.git`：页面会提示通过 `docker-compose pull && docker-compose up -d` 更新镜像。
- 回退版本（源码安装）：在服务器执行 `git fetch --tags`，然后 `git checkout -B release tags/vX.Y.Z`，重启服务生效。

---

## 10. 安全与鉴权

- 登录保护：主页、结果页、播放器与核心 API 受保护；未登录重定向到登录页；支持登录后 redirect 回跳。  
- 验证码：登录时需输入图形验证码，点击可刷新。  
- Token：外网导出可启用 Token 校验。  
- 建议：将容器或主机 3000 端口限制在内网访问；如需对外，务必开启 Token 并配置反向代理的访问控制。
- 反向代理（Nginx 示例）：

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

开启导出 Token 的一般流程（以外网为例）：  
- 在应用设置中启用“外网导出需要 Token”；  
- 生成或设置 Token；  
- 所有对外链接追加 `?token=YOUR_TOKEN`；  
- 未携带或错误 Token 将返回 403。

---

## 11. 日志中心

- 入口：导航“日志中心”或直接访问 `/logs.html`。  
- 功能：  
  - 实时日志流（SSE）：基于服务器端推送实时展示；支持按“级别（fatal/error/warn/info/debug）”“模块（HTTP/Auth/WebDAV/Persist/EPG/App）”“关键字”筛选。  
  - 历史下载：列出本地日志文件，支持在线筛选与下载。  
  - 控制：暂停/继续输出、清屏、自动滚动。  
- 接口速览：  
  - 实时流：`GET /api/logs/stream?tail=200&level=info&module=all&keyword=xxx`（SSE）  
  - 获取文件列表：`GET /api/logs/files`  
  - 下载指定文件：`GET /api/logs/download?file=app-YYYYMMDD.log`  
  - 获取/设置日志级别：`GET/POST /api/logs/level`（支持保留天数）  
- 反向代理提示：使用 SSE 时需关闭代理缓冲（如 Nginx `proxy_buffering off;`），并允许长连接。

---

## 12. 常见问题（FAQ）

1) “ffprobe 未找到”  
- Windows：安装官方 ffmpeg 并将 `ffprobe.exe` 所在目录加入 PATH。  
- Linux：安装 `ffmpeg`（如 `sudo apt install ffmpeg`），确认 `ffprobe -version` 可运行。

2) “端口被占用（EADDRINUSE）”  
- 调整应用端口或释放占用端口；Docker 采用 host 网络时注意主机服务冲突。

3) “播放器不出画/卡顿”  
- 组播：确认 UDPXY/rtp2httpd 可访问；网络对多播/UDP 是否放行。  
- 单播/HLS：检查上游地址可达性与 CORS 限制；必要时走 `/api/proxy/hls` 调试。  
- HLS/MPEGTS 内核已做错误重试，必要时查看浏览器控制台日志定位网络/跨域问题。

4) “外网回看失败”  
- 优先检查 `/api/catchup/play` 返回的错误信息与规则命中日志。  
- 通过 `/api/system/replay-rules/hits` 查看命中规则、错误码与降级情况。

5) “自动更新失败”  
- 非 Git 仓库或未安装 Git：请使用 `git clone` 的部署方式；安装 Git 后再试。  
- 切换 tag 提示将覆盖未跟踪文件：系统已自动 `git stash push -u` 备份，再次点击更新即可。  
- 网络问题：确认服务器可访问 GitHub 或配置代理。

6) “Logo 没显示/错位”  
- 检查 tvg-id/tvg-name 是否与模板匹配；确认 `/api/logo` 能访问到台标 URL。

7) “导出 TVBox 无法播放”  
- 确认外网/内网范围设置与代理基址是否正确；在浏览器直接打开链接测试可达性。

8) “WebDAV 备份/恢复不生效”  
- 查看“日志中心”中模块为 WebDAV 的日志：关注 MKCOL/PUT 状态码与上传计数；未上传任何文件会明确报错。  
- 确认 WebDAV 地址与根目录末尾斜杠、账号权限；必要时开启“忽略证书”用于内网自签证书。  
- 若 PROPFIND 受限，请在 WebDAV 端开启目录列表或降低 Depth 限制。

9) “日志中心没有输出/连接断开”  
- 确认反向代理已关闭缓冲并支持 SSE 长连接；浏览器网络面板查看 `/api/logs/stream` 事件流。  
- 适当降低日志级别（info）或关键字筛选，避免海量日志导致 UI 卡顿。

---

## 13. 故障排查指南

- 网络连通：  
  - `curl`/浏览器直连测试 UDPXY、代理与上游 HLS 资源；  
  - 若外网访问失败，检查防火墙、反代与证书配置。  
- 日志查看：  
  - 浏览器控制台（HLS/MPEGTS 错误、CORS 情况）；  
  - 日志中心 `/logs.html`（实时 SSE 流 + 历史文件）；  
  - 服务端日志（终端输出/容器日志）。  
- 数据校验：  
  - 在“接口弹窗”中预览导出链接，并抽样进行 HEAD/GET 校验。  
- 更新切换：  
  - 回退到旧版本：`git fetch --tags && git checkout -B release tags/vX.Y.Z && systemctl restart channel-sentinel`（或重启容器）。
 - 性能：  
  - 批量检测建议分批导入；  
  - 容器部署时尽量靠近 UDPXY/回看源，降低网络抖动；  
  - 浏览器卡顿时清理历史检测大列表或切换分页视图。

---

## 14. 附录

1) 常用接口（仅列举核心）  
- 系统信息：`GET /api/system/info`  
- 检测：`POST /api/check-stream`、`POST /api/check-http-stream`、`POST /api/check-streams-batch`  
- EPG：`GET /api/epg/programs`、`POST /api/epg/refresh`  
- 导出：`GET /api/export/txt`、`GET /api/export/m3u`、`GET /api/export/json`、`GET /api/export/tvbox`、`GET /api/export/xtream`  
- 版本：`POST /api/persist/save`、`GET /api/persist/list`、`POST /api/persist/load-version`、`POST /api/persist/delete-version`  
- 配置：`/api/config/*`（logo-templates、fcc-servers、udpxy-servers、group-titles、group-rules、proxies、app-settings、epg-sources）  
- 更新：`POST /api/system/update`（源码安装；Docker 请拉镜像）
- 回放规则观测与回滚：`GET /api/system/replay-rules/status`、`GET /api/system/replay-rules/hits`、`GET /api/system/replay-rules/snapshots`、`POST /api/system/replay-rules/snapshot`、`POST /api/system/replay-rules/rollback`

2) curl 示例  

```bash
# 获取系统信息
curl -s http://localhost:3000/api/system/info

# 导出 M3U（示例参数按页面”接口弹窗”生成为准）
curl -L “http://localhost:3000/api/export/m3u?scope=external&status=online&fmt=ku9&proto=http”

# 查看回放规则状态
curl -s http://localhost:3000/api/system/replay-rules/status
```
```

2) 术语对照  
- UDPXY/rtp2httpd：组播转 HTTP 服务  
- FCC：快速频道切换参数  
- TVG：节目/台标相关元数据字段（tvg-id/name/logo 等）

3) 许可  
- 开源协议：MIT（详见仓库 LICENSE）

---

恭喜完成入门！如需更深入的实践（地址拼接规则、台标模板编写、回看参数格式），建议结合“接口弹窗”进行可视化预览与自测，逐步配置内/外网环境，达成“同一套数据，内/外网皆可播”的目标。祝使用愉快。

