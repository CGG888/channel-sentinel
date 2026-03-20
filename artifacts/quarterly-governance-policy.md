## Quarterly Governance Policy

- GeneratedAt: 2026-03-18T06:20:58.145Z
- ReviewWindow: 2026-Q1

### Owners

- Release: release-manager
- QualityGate: qa-owner
- ApiContract: api-owner
- OpsGovernance: ops-owner

### Cadence

- GateReview: weekly
- TrendCalibrationReview: weekly
- LowFrequencyGovernanceReview: weekly
- FullAcceptanceReview: quarterly

### SLA

- P1: 1h, P2: 4h, P3: 24h

### Actions

- 每周复盘 gate/trend/notify/ops 四类产物稳定性
- 每周复审低频异常白名单与阈值
- 每季度执行全量收官验收并归档报告
- 触发 P1 时冻结发布并重跑 full gate 链路

### Release Criteria

- service-gate-summary passedRate >= 0.99
- contract 失败数 = 0
- service-gate-notify severity != critical/high
- ops-domain-sop 与 low-frequency-governance 产物均可生成

