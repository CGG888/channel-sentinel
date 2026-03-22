# 快速开始

## 启动服务

服务启动后，访问 `http://localhost:3000`

```
┌─────────────────────────────────────────────────────────┐
│  Channel Sentinel                                       │
│                                                         │
│  🌐 http://localhost:3000                               │
│                                                         │
│  API 文档: http://localhost:3000/api                    │
└─────────────────────────────────────────────────────────┘
```

## 基本使用

### 1. 导入 M3U 源

在首页的 **M3U 源地址** 输入框中输入 M3U URL 或本地文件路径，点击 **开始检测**。

```
M3U 源地址: https://example.com/live.m3u8
```

### 2. 查看检测结果

检测完成后，在 **结果页面** 可以看到：

| 字段 | 说明 |
|------|------|
| 状态 | ✅ 可用 / ❌ 不可用 |
| 延迟 | 响应时间（毫秒） |
| 协议 | HTTP / RTSP / RTMP 等 |
| 类型 | 单播 / 组播 |
| 分辨率 | 视频分辨率（如 1920x1080）|

### 3. 回放规则

点击 **回放规则** 按钮，打开规则配置面板：

- **基础地址规则**：控制回放地址的生成方式
- **时间规则**：控制时间参数的格式和拼接
- **社区功能**：关联 GitHub、查看规则库、提交规则

## API 使用

### 检测频道

```bash
curl -X POST http://localhost:3000/api/check \
  -H "Content-Type: application/json" \
  -d '{"url": "http://example.com/stream.m3u8"}'
```

### 获取规则

```bash
curl http://localhost:3000/api/replay-rules/library
```

## 下一步

- [详细使用教程](./usage)
- [回放规则配置](../replay-rules/)
- [API 文档参考](../api/)
