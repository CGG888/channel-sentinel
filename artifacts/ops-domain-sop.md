## Ops Domain Dashboard

- GeneratedAt: 2026-03-18T06:20:58.042Z
- OpenIncidents: 0
- ClosedIncidents: 0

### Domain Metrics

| Domain | Requests | ErrorRate | AvgLatencyMs | P95LatencyMs |
|---|---:|---:|---:|---:|
| detect | 0 | 0 | 0 | 0 |
| export | 0 | 0 | 0 | 0 |
| replay | 0 | 0 | 0 | 0 |
| player | 0 | 0 | 0 | 0 |
| config | 0 | 0 | 0 | 0 |
| persist | 0 | 0 | 0 | 0 |
| logs | 0 | 0 | 0 | 0 |
| auth | 0 | 0 | 0 | 0 |
| proxy | 0 | 0 | 0 | 0 |
| storage | 0 | 0 | 0 | 0 |
| app | 0 | 0 | 0 | 0 |

### SOP

#### detect

- Owner: detect-owner
- SlaMinutes: 30
- 检查探测入口可达性
- 检查 ffprobe/网络时延
- 重放失败样本并确认恢复

#### export

- Owner: export-owner
- SlaMinutes: 30
- 检查导出参数与路由
- 检查响应格式与编码
- 回放导出请求样本

#### replay

- Owner: replay-owner
- SlaMinutes: 30
- 检查规则命中与快照状态
- 检查回看链路与代理
- 回放命中样本并确认恢复

#### player

- Owner: player-owner
- SlaMinutes: 20
- 检查播放内核状态
- 检查代理与流地址有效性
- 验证首帧与切台恢复

#### config

- Owner: config-owner
- SlaMinutes: 30
- 检查配置读写接口
- 检查持久化状态一致性
- 验证前端设置回读

#### persist

- Owner: persist-owner
- SlaMinutes: 45
- 检查备份与恢复任务
- 检查存储模式与同步状态
- 执行受控修复并复验

#### logs

- Owner: ops-owner
- SlaMinutes: 20
- 检查日志流与文件写入
- 检查采集筛选参数
- 恢复后确认实时流稳定

#### auth

- Owner: auth-owner
- SlaMinutes: 20
- 检查登录与鉴权接口
- 检查会话状态与cookie
- 回放登录契约并复验

#### proxy

- Owner: proxy-owner
- SlaMinutes: 30
- 检查代理健康状态
- 检查超时与重试策略
- 回放代理链路样本

#### storage

- Owner: storage-owner
- SlaMinutes: 45
- 检查读写模式与队列
- 检查同步与修复任务
- 核对数据一致性

#### app

- Owner: platform-owner
- SlaMinutes: 60
- 检查全局依赖与服务状态
- 检查异常分布与热点
- 执行分域恢复与回归

### Low Frequency Governance

- TotalRiskDomains: 0
- P1: 0, P2: 0, P3: 0
- LowRequestThreshold: 30
- LatencyThresholdMs: 3000

| Domain | Requests | ErrorRate | P95LatencyMs | OpenIncidents | RiskLevel | Action |
|---|---:|---:|---:|---:|---|---|
| none | 0 | 0 | 0 | 0 | P3 | 观察 |

