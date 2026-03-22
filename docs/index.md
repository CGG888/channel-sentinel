---
layout: home

hero:
  name: Channel Sentinel
  text: 智能 IPTV 检测工具
  tagline: 智能检测 IPTV 频道状态，自动获取回放地址，支持自定义回放规则
  image:
    src: /logo.svg
    alt: Channel Sentinel
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/quickstart
    - theme: alt
      text: GitHub
      link: https://github.com/CGG888/channel-sentinel

features:
  - icon: 📺
    title: 智能频道检测
    details: 支持 HTTP/RTSP/UDP 多协议频道检测，实时显示频道状态
  - icon: 🔄
    title: 自动回放获取
    details: 自动识别并获取频道回放地址，支持多种回放规则
  - icon: 🛠️
    title: 自定义回放规则
    details: 灵活的回放规则系统，支持省份、运营商、城市等多维度匹配
  - icon: 🌐
    title: 社区规则库
    details: 开放的社区规则贡献系统，用户可以提交和分享回放规则
  - icon: 📊
    title: 批量处理
    details: 支持批量检测和处理，轻松管理大量频道
  - icon: 💾
    title: 数据持久化
    details: SQLite 本地存储，规则版本管理，支持快照和回滚
---

<style>
.demo-section {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 24px;
}
.demo-section h2 {
  font-size: 28px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 48px;
  letter-spacing: -0.02em;
}
.demo-section h3 {
  font-size: 20px;
  font-weight: 600;
  margin-top: 48px;
  margin-bottom: 16px;
}
.demo-section img {
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
}
</style>

<div class="demo-section">

## 功能演示

### 频道检测

![频道检测](./images/channel-detection.svg)

### 回放规则配置

![回放规则](./images/replay-rules.svg)

### 社区规则库

![社区规则](./images/community-rules.svg)

</div>
