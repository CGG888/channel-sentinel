# 项目结构 (Project Structure)

> Channel Sentinel 项目目录结构与文件说明

---

## 目录总览

```
channel-sentinel/
├── src/                    # 后端源码
├── public/                 # 前端静态资源
├── data/                   # 数据目录（运行时读写）
├── rules/                  # 回放规则（社区版）
├── docs/                   # 文档
├── md/                     # 设计文档
├── Dockerfile              # Docker 镜像构建
├── docker-compose.yml      # Docker Compose
├── package.json
└── README.md
```

---

## src/ 后端源码

```
src/
├── index.js                  # Express 应用入口
├── config/                   # 配置管理（统一封装）
│   └── index.js              # 配置读写统一封装
├── core/                     # 核心业务模块
│   ├── auth/                 # 认证（会话、验证码）
│   └── logger/               # 日志（按模块隔离）
├── middleware/               # Express 中间件
│   └── governance.js         # 运维治理中间件
├── routes/                   # 路由层（每张页面或功能域一个文件）
│   ├── auth.js              # 登录/登出/验证码
│   ├── catchup.js           # 回看播放路由
│   ├── config.js            # 配置读写
│   ├── epg.js               # EPG 代理
│   ├── export.js            # 导出（M3U/TXT/JSON/TVBox/Xtream）
│   ├── logs.js              # 日志查询
│   ├── persist.js           # 版本/备份（SQLite）
│   ├── player.js            # 播放器路由
│   ├── proxy.js             # HLS/UDPXY 代理
│   ├── stream.js            # 组播/单播检测
│   ├── system.js            # 系统运维（规则状态/快照/回滚）
│   ├── contributions.js     # GitHub OAuth 和规则提交
│   └── webdav.js           # WebDAV 备份/恢复
├── services/                 # 服务层（纯业务逻辑，路由层调用）
│   ├── stream.js            # 流检测核心（ffprobe 封装、超时、缓存）
│   ├── epg.js               # EPG XML 解析与查询
│   ├── export.js            # 多格式导出生成器
│   ├── catchup.js           # 回放地址拼接与时间参数处理
│   ├── replay-rules.js      # 回放规则引擎（基址提取/参数拼接/协议适配）
│   ├── replay-rules-state.js # 规则命中状态追踪
│   ├── replay-rules-remote.js # 远程规则服务
│   ├── module-health.js     # 模块健康度
│   └── ops-observability.js # 运维可观测性
├── storage/                 # 存储层（SQLite 为主）
│   ├── index.js             # SQLite 连接与初始化
│   ├── config-reader.js     # SQLite 配置表读写
│   ├── mode.js              # 读写模式（sqlite / json）封装
│   └── streams-reader.js    # SQLite 频道数据读写
└── utils/                   # 工具（门禁测试、运维脚本）
    ├── service-quality-gate.js
    ├── run-service-gate-with-server.js
    ├── service-gate-trend.js
    ├── final-acceptance-report.js
    └── *.js                 # 各类合同测试 / 烟雾测试
```

---

## public/ 前端静态资源

```
public/
├── index.html                # 检测首页
├── results.html             # 检测结果页
├── player.html              # 播放器页
├── logs.html                # 日志页
├── login.html               # 登录页
├── Sentinel.png             # 网站图标
├── iptv.png                 # 旧版图标
│
├── css/                     # 样式文件
│   ├── theme-tokens.css     # CSS 设计 token（亮/暗主题变量）
│   ├── shadcn-ui.css        # shadcn/ui 组件样式覆盖
│   ├── custom.css           # 遗留自定义样式（stat-card、表单等）
│   ├── common-nav.css       # index/results/logs 公共导航样式
│   ├── player.css           # 播放器全组件样式
│   ├── login.css            # 登录页样式
│   └── results.css          # 结果页表格+EPG弹窗样式
│
└── js/                      # 前端 JS 模块
    ├── core/                 # 核心模块（各页面共享）
    │   ├── api-client.js     # 后端 API 调用封装
    │   ├── auth-gate.js     # 认证拦截
    │   ├── dialog.js         # 弹窗管理
    │   ├── nav-bridge.js     # 导航桥接
    │   └── storage-keys.js   # localStorage Key 常量
    │
    ├── index/               # 首页 JS
    │   ├── bootstrap.js      # 首页初始化引导
    │   ├── detect-runner.js  # 检测任务执行器
    │   ├── input-parser.js  # 输入解析（地址/范围/CIDR）
    │   ├── range-detect.js   # 范围检测逻辑
    │   ├── result-renderer.js# 检测结果渲染
    │   └── version-manager.js# 版本快照管理
    │
    ├── results/             # 结果页 JS
    │   ├── catchup-service.js# 回看服务
    │   ├── persist-manager.js# 持久化管理
    │   ├── replay-rules-center.js  # 回放规则中心
    │   ├── replay-rules-community.js # 社区规则（GitHub OAuth/贡献）
    │   └── webdav-manager.js # WebDAV 备份管理
    │
    ├── player/              # 播放器 JS
    │   ├── core-controller.js# 播放核心控制器
    │   ├── catchup-service.js# 回看服务
    │   ├── epg-orchestrator.js # EPG 协调器
    │   ├── epg-renderer.js   # EPG 渲染
    │   ├── epg-fallback-renderer.js # EPG 降级渲染
    │   ├── epg-service.js    # EPG 数据服务
    │   ├── epg-wiring.js     # EPG 事件绑定
    │   ├── play-url-resolver.js # 播放地址解析（内/外网）
    │   ├── retry-controller.js  # 重试控制器
    │   ├── source-wiring.js  # 播放源切换绑定
    │   ├── start-kernel.js   # 播放内核启动（mpegts/hls/native TS）
    │   ├── ui-overlay.js     # UI 显隐控制（EPG/频道列表）
    │   └── ui-wiring.js      # UI 事件绑定（鼠标/触摸/主题）
    │
    ├── logs/                # 日志页 JS
    │   └── module-health.js  # 模块健康度展示
    │
    ├── shared/              # 跨页面共享模块
    │   ├── proxy-utils.js    # 代理工具
    │   └── version-manager.js# 版本管理
    │
    ├── theme-manager.js     # 主题管理（亮/暗切换）
    ├── top-nav-loader.js    # 公共顶部导航加载器
    ├── iptv-qier-player.bundle.js   # Qier 播放器打包
    └── iptv-qier-player.bundle.css  # Qier 播放器样式打包
```

---

## data/ 数据目录

> **注意**：数据目录中的 JSON 文件已逐步迁移至 SQLite，JSON 格式仅作为应急备份保留。

```
data/
├── channel_sentinel.db       # SQLite 主数据库
├── channel_sentinel-*.db    # SQLite 历史备份
├── backups/                 # 手动备份目录
├── epg/                     # EPG 缓存目录
├── logs/                    # 日志文件目录
├── rules_backups/           # 规则快照目录
└── replay_rules_state.json  # ⚠️ 已废弃，仅作兼容保留
```

### SQLite 数据库表结构

| 表名 | 说明 |
|------|------|
| `channels` | 频道数据 |
| `config` | 配置数据 |
| `contributions` | 规则贡献记录 |
| `rule_versions` | 规则版本记录 |
| `snapshots` | 快照记录 |

---

## rules/ 回放规则目录

```
rules/
├── rules.json                # 规则版本索引
├── 1.0.0/
│   ├── replay_base_rules.json    # 回放基础地址规则
│   └── time_placeholder_rules.json # 时间占位符规则
└── 1.0.1/
    └── ...
```

详见：[回放规则系统设计文档](../md/回放规则系统设计文档.md)

---

## docs/ 文档目录

```
docs/
├── WIKI.md               # 完整使用指南
├── USER_GUIDE.md        # 用户指南
└── CHANGELOG.md         # 版本历史
```

---

## md/ 设计文档目录

```
md/
└── 回放规则系统设计文档.md  # 回放规则社区功能设计
```

---

## 配置文件

| 文件 | 说明 |
|------|------|
| `package.json` | Node.js 项目配置 |
| `Dockerfile` | Docker 镜像构建 |
| `docker-compose.yml` | Docker Compose 配置 |
| `.env` | 环境变量配置 |

---

## 相关链接

- [使用指南](./docs/WIKI.md)
- [用户指南](./docs/USER_GUIDE.md)
- [版本历史](./docs/CHANGELOG.md)
- [回放规则设计文档](../md/回放规则系统设计文档.md)
