# 社区回放规则收集
## 目的
收集和记录社区共享的回放规则，以便更好地支持频道哨兵的回看功能。
## 规则格式
规则应以 JSON 格式提交，包括以下字段：
- `name`: 规则名称
- `format`: 回看格式（如 iso8601、ku9、mytv 等）
- `rule`: 具体的回放规则
## 提交规则
社区成员可以通过 Pull Request 的方式提交新的回放规则。请确保规则格式正确并且有明确的描述。
## 现有规则
请查看 `replay_base_rules.json` 和 `time_placeholder_rules.json` 文件中的现有规则。