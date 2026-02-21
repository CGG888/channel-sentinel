# IPTV Checker 使用指南（Wiki）

> 目标：让第一次接触 IPTV Checker 的用户“看得懂、用得上、能排错”。本页涵盖快速上手、核心概念、页面导览、配置说明、播放与回看、导出与对接、版本与更新、安全管理、常见问题与排障。

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
- 9. 版本更新与“红点”提示
- 10. 安全与鉴权
- 11. 常见问题（FAQ）
- 12. 故障排查指南
- 13. 附录（接口速查、术语说明、许可）

---

## 1. 快速上手

1) Docker（推荐生产）  
- 拉取镜像并运行（host 网络）：  
  `docker run -d --network host --name iptv-checker -e TZ=Asia/Shanghai -e PORT=${IPTV_PORT:-3000} -v $(pwd)/data:/app/data ghcr.io/cgg888/iptv-checker:latest`
- docker-compose 示例：

  ```yaml
  services:
    iptv-checker:
      image: ghcr.io/cgg888/iptv-checker:latest
      container_name: iptv-checker
      network_mode: host
      environment:
        - TZ=Asia/Shanghai
        - PORT=3000
      volumes:
        - ./data:/app/data
      restart: unless-stopped
  ```

- 访问地址：http://localhost:3000
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
- 纯内网：机顶盒/浏览器 → UDPXY/rtp2httpd → IPTV Checker（导出接口供第三方播放）。  
- 外网访问：客户端 → 反向代理(Nginx) → IPTV Checker → 外网代理/回看源（组播经“外网组播代理”）。  

---

## 3. 页面导览与常用操作

- 首页（检测页）：导入/输入地址进行批量检测；支持筛选、搜索、排序、统计。  
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
- 回看规范（外网重点）：使用“单播代理 + 回放源基础 URL + 时间参数（ku9 等）”，严禁把 `/rtp/` 组播路径拼入回看。  
- 支持的回看时间格式：`iso8601、ku9、mytv、npt、rtsp_range、playseek、startend14、beginend14、unix_s、unix_ms`。  
- 外部播放器：桌面 PotPlayer、移动端 VLC（设备自适应）。
- 示例：  
  - 直播（组播经 UDPXY）：`http://<udpxy-host>:<port>/rtp/<ip>:<port>`  
  - 回看（ku9 格式）：`http://<unicast-proxy>/<base>.m3u8?ku9=20260101-120000-20260101-130000`
- 常见问题：  
  - 无画面：确认 UDPXY 可直连访问；或 HLS 源跨域（CORS）未放行；  
  - 声音静音：浏览器策略导致，点击播放区域即可恢复；  
  - 回看报错：确认参数格式与时间范围正确、上游已开放回看接口。

回看时间格式示例：  
- iso8601：`...&start=2026-02-21T12:00:00Z&end=2026-02-21T13:00:00Z`  
- ku9：`?ku9=20260221-120000-20260221-130000`  
- mytv：`?playback=20260221120000-20260221130000`  
- npt：`?npt=43200-46800`（单位秒，示例 12:00–13:00）  
- unix_s：`?start=1771646400&end=1771650000`  
- unix_ms：`?start=1771646400000&end=1771650000000`

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

常见导出参数（以 M3U 为例，按页面生成为准）：  
- `scope=lan|internet`：范围（内网/外网）  
- `status=online|all`：仅在线或全部  
- `protocol=http|rtsp`：优先协议  
- `token=xxxx`：外网启用 Token 时必须附带  
- `catchup=ku9|iso8601...`：回看参数格式（按需要）  

示例：  
`/api/export/m3u?scope=internet&status=online&protocol=http&catchup=ku9&token=YOUR_TOKEN`

---

## 8. 版本与数据持久化

- 保存版本：生成 `streams.json` 与 `streams-YYYYMMDD-HHMMSS.json` 快照。  
- 加载/删除/列表：在首页或结果页完成版本管理操作。  
- 启动行为：若无 `streams.json`，自动加载 `/data` 中最新的时间戳版本。  
- 数据文件（/data）简介：  
  - `streams.json` 当前数据；`streams-*.json` 历史版本；  
  - `logo_templates.json` 模板；`udpxy_servers.json`、`proxy_servers.json`、`fcc_servers.json`；  
  - `group_titles.json`、`group_rules.json`；`epg_sources.json`；`app_settings.json`。
- 备份与恢复：  
  - 备份：归档整个 `./data` 目录；  
  - 恢复：停止服务 → 覆盖 `./data` → 启动服务。

---

## 9. 版本更新与“红点”提示

- 页脚“当前版本”右侧在检测到新版本时出现红色闪烁圆点。  
- “关于/更新”弹窗：显示当前版本与最新发布的版本号及说明。  
- 本地源码安装（非 Docker）：  
  - 点击“立即更新”→ 自动设置远程为 `https://github.com/CGG888/Iptv-Checker.git` → 拉取 tags；  
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

## 11. 常见问题（FAQ）

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
- 请确保按规范生成：单播代理 + 回放源基础 URL + 时间参数（如 ku9）。  
- 禁止将 `/rtp/` 组播路径拼入回看。

5) “自动更新失败”  
- 非 Git 仓库或未安装 Git：请使用 `git clone` 的部署方式；安装 Git 后再试。  
- 切换 tag 提示将覆盖未跟踪文件：系统已自动 `git stash push -u` 备份，再次点击更新即可。  
- 网络问题：确认服务器可访问 GitHub 或配置代理。

6) “Logo 没显示/错位”  
- 检查 tvg-id/tvg-name 是否与模板匹配；确认 `/api/logo` 能访问到台标 URL。

7) “导出 TVBox 无法播放”  
- 确认外网/内网范围设置与代理基址是否正确；在浏览器直接打开链接测试可达性。

---

## 12. 故障排查指南

- 网络连通：  
  - `curl`/浏览器直连测试 UDPXY、代理与上游 HLS 资源；  
  - 若外网访问失败，检查防火墙、反代与证书配置。  
- 日志查看：  
  - 浏览器控制台（HLS/MPEGTS 错误、CORS 情况）；  
  - 服务端日志（终端输出/容器日志）。  
- 数据校验：  
  - 在“接口弹窗”中预览导出链接，并抽样进行 HEAD/GET 校验。  
- 更新切换：  
  - 回退到旧版本：`git fetch --tags && git checkout -B release tags/vX.Y.Z && systemctl restart iptv-checker`（或重启容器）。
 - 性能：  
  - 批量检测建议分批导入；  
  - 容器部署时尽量靠近 UDPXY/回看源，降低网络抖动；  
  - 浏览器卡顿时清理历史检测大列表或切换分页视图。

---

## 13. 附录

1) 常用接口（仅列举核心）  
- 系统信息：`GET /api/system/info`  
- 检测：`POST /api/check-stream`、`POST /api/check-http-stream`、`POST /api/check-streams-batch`  
- EPG：`GET /api/epg/programs`、`POST /api/epg/refresh`  
- 导出：`GET /api/export/txt`、`GET /api/export/m3u`、`GET /api/export/json`、`GET /api/export/tvbox`、`GET /api/export/xtream`  
- 版本：`POST /api/persist/save`、`GET /api/persist/list`、`POST /api/persist/load-version`、`POST /api/persist/delete-version`  
- 配置：`/api/config/*`（logo-templates、fcc-servers、udpxy-servers、group-titles、group-rules、proxies、app-settings、epg-sources）  
- 更新：`POST /api/system/update`（源码安装；Docker 请拉镜像）

2) curl 示例  

```bash
# 获取系统信息
curl -s http://localhost:3000/api/system/info

# 导出 M3U（示例参数按页面“接口弹窗”生成为准）
curl -L "http://localhost:3000/api/export/m3u?scope=internet&status=online&protocol=http"
```

2) 术语对照  
- UDPXY/rtp2httpd：组播转 HTTP 服务  
- FCC：快速频道切换参数  
- TVG：节目/台标相关元数据字段（tvg-id/name/logo 等）

3) 许可  
- 开源协议：MIT（详见仓库 LICENSE）

---

恭喜完成入门！如需更深入的实践（地址拼接规则、台标模板编写、回看参数格式），建议结合“接口弹窗”进行可视化预览与自测，逐步配置内/外网环境，达成“同一套数据，内/外网皆可播”的目标。祝使用愉快。

