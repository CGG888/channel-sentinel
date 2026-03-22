# 规则格式

## 基础地址规则

### 文件结构

```json
{
  "meta": {
    "rules_version": "2026.03.17-base-contract-v2",
    "engine_min_version": "1.0.0",
    "engine_max_version": "2.x",
    "updated_at": "2026-03-17T00:00:00+08:00",
    "schema_version": "1.0.0",
    "description": "回放基础地址规则"
  },
  "defaults": {
    "fallback_policy": "use_live_url",
    "query_mode": "keep_all",
    "priority_order": ["manual_override", "default_baseline", "region_rule"],
    "on_no_match": "use_live_url"
  },
  "rules": [
    {
      "id": "hn-ct-http-unicast-v1",
      "enabled": true,
      "priority": 100,
      "region": {
        "province": "湖南",
        "city": "*",
        "operator": "电信http"
      },
      "match": {
        "stream_type": "unicast",
        "protocols": ["http", "https"],
        "host_regex": ".*",
        "path_regex": "^/000000002000/.+/.+\\.m3u8$"
      },
      "transform": {
        "base_from": "live_url",
        "query_mode": "drop_all",
        "output_template": "{live_base}"
      },
      "examples": [
        {
          "input": "http://124.232.231.172:8089/000000002000/201500000219/index.m3u8?zte_offset=30",
          "output": "http://124.232.231.172:8089/000000002000/201500000219/index.m3u8"
        }
      ]
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 规则唯一标识 |
| `enabled` | boolean | 是否启用 |
| `priority` | number | 优先级（数字越大优先级越高）|
| `region.province` | string | 省份（`*` 表示全部）|
| `region.city` | string | 城市（`*` 表示全部）|
| `region.operator` | string | 运营商 |
| `match.stream_type` | string | 流类型：`unicast` / `multicast` |
| `match.protocols` | array | 支持的协议列表 |
| `match.path_regex` | string | 路径正则匹配 |
| `transform.output_template` | string | 输出模板 |

### 输出模板变量

| 变量 | 说明 |
|------|------|
| `{live_url}` | 原始直播地址 |
| `{live_base}` | 直播地址基础部分（无查询参数）|
| `{live_host}` | 直播地址主机部分 |
| `{live_path}` | 直播地址路径部分 |

## 时间规则

### 文件结构

```json
{
  "meta": {
    "rules_version": "2026.03.17-time-format",
    "updated_at": "2026-03-17T00:00:00+08:00"
  },
  "placeholders": {
    "description": "时间占位符映射表",
    "mapping": {
      "{starttime}": "20260322120000",
      "{endtime}": "20260322130000"
    }
  },
  "formats": [
    {
      "id": "ct-yyyymmddhhmmss",
      "enabled": true,
      "pattern": "^(\\d{14})$",
      "example": "20260322120000",
      "description": "电信格式：年月日时分秒"
    }
  ]
}
```

## 规则贡献元数据

提交规则时，系统会自动关联贡献者信息：

```json
{
  "id": "gd-ct-rtsp-unicast-v1",
  "contributor": {
    "github_username": "贡献者",
    "issue_comment_id": "123456789",
    "issue_url": "https://github.com/CGG888/channel-sentinel/issues/10#issuecomment-123456789",
    "submitted_at": "2026-03-22"
  }
}
```
