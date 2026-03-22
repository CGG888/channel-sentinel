---
title: 项目结构
---

# 项目结构

## 整体目录

```
channel-sentinel/
├── .github/
│   └── workflows/          # GitHub Actions 工作流
├── .vitepress/            # VitePress 文档配置
├── docs/                   # 文档源文件
├── md/                     # 其他文档
├── public/                 # 前端静态资源
├── rules/                  # 回放规则库
├── src/                    # 后端源码
│   ├── routes/             # API 路由
│   ├── services/          # 业务服务
│   └── utils/              # 工具函数
├── data/                   # 数据存储
├── cloudflare-worker/      # Cloudflare Worker
├── package.json
└── README.md
```

## 后端源码结构

```
src/
├── index.js                # 应用入口
├── config.js               # 配置管理
├── app.js                  # Express 应用
├── routes/
│   ├── index.js            # 路由汇总
│   ├── system.js           # 系统 API（规则库）
│   ├── contributions.js    # GitHub OAuth 和贡献
│   └── index.html          # 页面路由
├── services/
│   ├── replay-rules-remote.js    # 远程规则服务
│   ├── replay-rules-engine.js    # 规则引擎
│   ├── replay-rules.js           # 规则管理
│   ├── checker.js                # 频道检测
│   └── storage.js                # 数据存储
├── middleware/
│   └── auth.js             # 认证中间件
└── utils/
    ├── logger.js           # 日志工具
    └── helpers.js         # 辅助函数
```

## 前端结构

```
public/
├── index.html              # 首页
├── results.html            # 结果页
├── favicon.ico
├── logo.svg
└── js/
    ├── results.js          # 结果页主逻辑
    └── results/
        ├── replay-rules-center.js     # 回放规则中心
        ├── replay-rules-community.js  # 社区功能
        └── replay-rules-time.js       # 时间规则
```

## 数据存储

```
data/
├── channel-sentinel.db      # SQLite 数据库
│                          # 表: contributions, rule_versions, snapshots
├── replay_base_rules.json  # 本地基础规则
├── time_placeholder_rules.json  # 时间规则
├── replay_rules_state.json # 规则状态
└── snapshots/              # 规则快照（用于回滚）
    └── snapshot_xxx/
        ├── replay_base_rules.json.bak
        └── time_placeholder_rules.json.bak
```

### SQLite 数据库表

#### contributions 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| github_username | TEXT | GitHub 用户名 |
| province | TEXT | 省份 |
| operator | TEXT | 运营商 |
| city | TEXT | 城市 |
| m3u_line | TEXT | M3U 行 |
| description | TEXT | 说明 |
| issue_comment_id | TEXT | Issue 评论 ID |
| status | TEXT | 状态 |
| created_at | DATETIME | 创建时间 |

#### rule_versions 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| version | TEXT | 版本号 |
| published_at | DATETIME | 发布时间 |
| changelog | TEXT | 变更日志 |
| total_rules | INTEGER | 规则总数 |
| github_pr_url | TEXT | GitHub PR URL |

#### snapshots 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| version | TEXT | 快照版本 |
| file_path | TEXT | 快照文件路径 |
| created_at | DATETIME | 创建时间 |

## 规则文件结构

```
rules/
├── rules.json              # 规则版本索引
│
└── 1.0.0/                  # 版本目录
    ├── replay_base_rules.json    # 基础规则
    └── time_placeholder_rules.json # 时间规则
```

## 文档结构

```
docs/                      # VitePress 文档源
├── index.md              # 首页
├── guide/                # 指南
│   ├── intro.md          # 介绍
│   ├── installation.md   # 安装
│   ├── quickstart.md     # 快速开始
│   └── usage.md          # 使用教程
├── replay-rules/         # 回放规则
│   ├── index.md          # 概述
│   ├── format.md         # 规则格式
│   ├── community.md      # 社区贡献
│   └── rules.md          # 规则详情
├── api/                  # API 文档
│   └── index.md
└── project-structure.md  # 项目结构

md/                        # 其他文档
├── 回放规则系统设计文档.md
└── changelog.md           # 变更日志
```

## 相关链接

- [GitHub 仓库](https://github.com/CGG888/channel-sentinel)
- [Issue #10 - 规则提交](https://github.com/CGG888/channel-sentinel/issues/10)
- [规则目录](https://github.com/CGG888/channel-sentinel/tree/main/rules)
