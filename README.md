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
👉 [社区回放规则收集](./docs/COMMUNITY_REPLAY_RULES.md)
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
## 🌟 项目简介（当前版本：![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/cgg888/channel-sentinel?sort=semver))

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
  - 组播：udpxy（或 rtp2httpd）基址 + /rtp