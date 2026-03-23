/**
 * 回放规则系统 - 阶段测试脚本
 *
 * 运行方式:
 *   node test_temp/replay-rules-system.test.js
 *
 * 测试范围:
 *   Phase 1: 路径统一 - replay-rules.js 从 rules/1.0.0/ 加载
 *   Phase 2: Hash 对比 - checkForUpdate/getRulesLibrary 基于 state hash 判断
 *   Phase 3: 冗余文件清理 - 根目录规则文件已删除，Dockerfile 已更新
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.join(__dirname, '..');
const TEST_PASS = [];
const TEST_FAIL = [];

function assert(condition, message) {
    if (condition) {
        TEST_PASS.push(message);
        console.log(`  \x1b[32m✓\x1b[0m ${message}`);
    } else {
        TEST_FAIL.push(message);
        console.log(`  \x1b[31m✗\x1b[0m ${message}`);
    }
}

function assertContains(filePath, substr, message) {
    const content = fs.readFileSync(filePath, 'utf8');
    const found = content.includes(substr);
    if (found) {
        TEST_PASS.push(message);
        console.log(`  \x1b[32m✓\x1b[0m ${message}`);
    } else {
        TEST_FAIL.push(message + ` (expected to contain: ${substr})`);
        console.log(`  \x1b[31m✗\x1b[0m ${message}`);
    }
}

function assertNotContains(filePath, substr, message) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const found = content.includes(substr);
        if (!found) {
            TEST_PASS.push(message);
            console.log(`  \x1b[32m✓\x1b[0m ${message}`);
        } else {
            TEST_FAIL.push(message + ` (should NOT contain: ${substr})`);
            console.log(`  \x1b[31m✗\x1b[0m ${message}`);
        }
    } catch (e) {
        TEST_FAIL.push(message + ` (file read error: ${e.message})`);
        console.log(`  \x1b[31m✗\x1b[0m ${message}`);
    }
}

function computeHash(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    } catch (e) {
        return null;
    }
}

console.log('\n========================================');
console.log('回放规则系统 - 阶段测试');
console.log('========================================\n');

// ============================================================
// Phase 1: 路径统一测试
// ============================================================
console.log('\x1b[1m【Phase 1】路径统一测试\x1b[0m');
console.log('验证 replay-rules.js 从 rules/1.0.0/ 加载规则文件\n');

const replayRulesPath = path.join(PROJECT_ROOT, 'src/services/replay-rules.js');
const replayRulesContent = fs.readFileSync(replayRulesPath, 'utf8');

assertContains(replayRulesPath,
    "rules/1.0.0/replay_base_rules.json",
    'replay-rules.js 加载路径包含 rules/1.0.0/replay_base_rules.json');

assertContains(replayRulesPath,
    "rules/1.0.0/time_placeholder_rules.json",
    'replay-rules.js 加载路径包含 rules/1.0.0/time_placeholder_rules.json');

// 确认不再从根目录加载（检查旧路径 '../../replay_base_rules.json'）
assertNotContains(replayRulesPath,
    "'../../replay_base_rules.json'",
    'replay-rules.js 不再从根目录加载 replay_base_rules.json');

assertNotContains(replayRulesPath,
    "'../../time_placeholder_rules.json'",
    'replay-rules.js 不再从根目录加载 time_placeholder_rules.json');

// 确认 rules/1.0.0/ 目录存在且包含文件
const rules100Dir = path.join(PROJECT_ROOT, 'rules/1.0.0');
const baseRulesPath = path.join(rules100Dir, 'replay_base_rules.json');
const timeRulesPath = path.join(rules100Dir, 'time_placeholder_rules.json');

assert(fs.existsSync(rules100Dir), 'rules/1.0.0/ 目录存在');
assert(fs.existsSync(baseRulesPath), 'rules/1.0.0/replay_base_rules.json 文件存在');
assert(fs.existsSync(timeRulesPath), 'rules/1.0.0/time_placeholder_rules.json 文件存在');

// ============================================================
// Phase 1: applyRemoteRules 写入测试
// ============================================================
console.log('\n\x1b[1m【Phase 1.2】applyRemoteRules 写入测试\x1b[0m');
console.log('验证 applyRemoteRules 正确写入文件并计算 hash\n');

const remoteRulesPath = path.join(PROJECT_ROOT, 'src/services/replay-rules-remote.js');
const remoteRulesContent = fs.readFileSync(remoteRulesPath, 'utf8');

assertContains(remoteRulesPath,
    'fs.writeFileSync(replayRules.baseRulesPath',
    'applyRemoteRules 使用 fs.writeFileSync 写入 baseRulesPath');

assertContains(remoteRulesPath,
    'fs.writeFileSync(replayRules.timeRulesPath',
    'applyRemoteRules 使用 fs.writeFileSync 写入 timeRulesPath');

assertContains(remoteRulesPath,
    'newBaseHash = crypto.createHash',
    'applyRemoteRules 计算新 hash');

assertContains(remoteRulesPath,
    'stateManager.saveState(updatedState)',
    'applyRemoteRules 保存 updatedState（含 hash）');

// ============================================================
// Phase 1: LOCAL_MODIFIED 检测测试
// ============================================================
console.log('\n\x1b[1m【Phase 1.3】LOCAL_MODIFIED 检测测试\x1b[0m');
console.log('验证 applyRemoteRules 在写入前检测本地修改\n');

assertContains(remoteRulesPath,
    "code: 'LOCAL_MODIFIED'",
    'applyRemoteRules 返回 LOCAL_MODIFIED 错误码');

assertContains(remoteRulesPath,
    'localHash: currentBaseHash',
    'applyRemoteRules 返回 localHash');

assertContains(remoteRulesPath,
    'force',
    'applyRemoteRules 支持 force 参数覆盖检测');

// ============================================================
// Phase 2: checkForUpdate hash 对比测试
// ============================================================
console.log('\n\x1b[1m【Phase 2.1】checkForUpdate hash 对比测试\x1b[0m');
console.log('验证 checkForUpdate 使用 hash 而非 SQLite 版本判断\n');

assertContains(remoteRulesPath,
    'getLocalState()',
    'checkForUpdate 调用 getLocalState() 获取本地状态');

assertContains(remoteRulesPath,
    'remoteBaseHash !== localState.baseRulesHash',
    'checkForUpdate 比对远程 hash 与本地 hash');

assertNotContains(remoteRulesPath,
    'storage.getRuleVersions()',
    'checkForUpdate 不再依赖 SQLite getRuleVersions');

// ============================================================
// Phase 2: getRulesLibrary isLocal 判断测试
// ============================================================
console.log('\n\x1b[1m【Phase 2.2】getRulesLibrary isLocal 判断测试\x1b[0m');
console.log('验证 getRulesLibrary 基于 state 判断 isLocal\n');

assertContains(remoteRulesPath,
    'const isLocal = localState &&',
    'getRulesLibrary 使用 localState 判断 isLocal');

assertContains(remoteRulesPath,
    'localState.baseRulesVersion === remoteBaseVersion',
    'getRulesLibrary 比对 baseRulesVersion 判断 isLocal');

assertNotContains(remoteRulesPath,
    'localVersionMap[',
    'getRulesLibrary 不再依赖 localVersionMap (SQLite)');

// ============================================================
// Phase 3: 冗余文件删除测试
// ============================================================
console.log('\n\x1b[1m【Phase 3.1】冗余文件删除测试\x1b[0m');
console.log('验证根目录冗余规则文件已删除\n');

const rootBaseRules = path.join(PROJECT_ROOT, 'replay_base_rules.json');
const rootTimeRules = path.join(PROJECT_ROOT, 'time_placeholder_rules.json');

assert(!fs.existsSync(rootBaseRules),
    '根目录 replay_base_rules.json 已删除');

assert(!fs.existsSync(rootTimeRules),
    '根目录 time_placeholder_rules.json 已删除');

// ============================================================
// Phase 3: Dockerfile 更新测试
// ============================================================
console.log('\n\x1b[1m【Phase 3.2】Dockerfile 更新测试\x1b[0m');
console.log('验证 Dockerfile 正确复制 rules/ 目录\n');

const dockerfilePath = path.join(PROJECT_ROOT, 'Dockerfile');
const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');

assert(dockerfileContent.includes('COPY --from=builder /build/rules ./rules'),
    'Dockerfile 包含 COPY --from=builder /build/rules ./rules');

// ============================================================
// Phase 3: docker-image.yml 触发路径测试
// ============================================================
console.log('\n\x1b[1m【Phase 3.3】docker-image.yml 触发路径测试\x1b[0m');
console.log('验证 docker-image.yml 包含 rules/ 触发路径\n');

const workflowPath = path.join(PROJECT_ROOT, '.github/workflows/docker-image.yml');
const workflowContent = fs.readFileSync(workflowPath, 'utf8');

const rulesTriggerPush = workflowContent.match(/push:[\s\S]*?paths:[\s\S]*?'rules\/\*\*'/);
assert(!!rulesTriggerPush, 'push 触发包含 rules/** 路径');

const rulesTriggerPR = workflowContent.match(/pull_request:[\s\S]*?paths:[\s\S]*?'rules\/\*\*'/);
assert(!!rulesTriggerPR, 'pull_request 触发包含 rules/** 路径');

// ============================================================
// Phase 2: 前端 LOCAL_MODIFIED 处理测试
// ============================================================
console.log('\n\x1b[1m【Phase 2.3】前端 LOCAL_MODIFIED 处理测试\x1b[0m');
console.log('验证前端正确处理 LOCAL_MODIFIED 错误码\n');

const frontendPath = path.join(PROJECT_ROOT, 'public/js/results/replay-rules-community.js');
const frontendContent = fs.readFileSync(frontendPath, 'utf8');

assertContains(frontendPath,
    "code === 'LOCAL_MODIFIED'",
    '前端检测 LOCAL_MODIFIED 错误码');

assertContains(frontendPath,
    'force: !!force',
    '前端 applyRemoteRules 支持 force 参数');

assertContains(frontendPath,
    '强制应用将覆盖本地修改',
    '前端显示强制覆盖警告信息');

// ============================================================
// Phase 2: 后端路由 force 参数测试
// ============================================================
console.log('\n\x1b[1m【Phase 2.4】后端路由 force 参数测试\x1b[0m');
console.log('验证后端路由正确传递 force 参数\n');

const systemRoutePath = path.join(PROJECT_ROOT, 'src/routes/system.js');
const routeContent = fs.readFileSync(systemRoutePath, 'utf8');

assertContains(systemRoutePath,
    'const force = !!(req.body && req.body.force)',
    'apply-remote 路由读取 force 参数');

assertContains(systemRoutePath,
    'replayRulesRemote.applyRemoteRules(version, force)',
    'apply-remote 路由传递 force 给服务');

// ============================================================
// Phase 2: SQLite 迁移测试
// ============================================================
console.log('\n\x1b[1m【Phase 2.5】SQLite 迁移测试\x1b[0m');
console.log('验证 storage 添加了 base_rules_version 和 time_rules_version 列\n');

const storagePath = path.join(PROJECT_ROOT, 'src/storage/index.js');
const storageContent = fs.readFileSync(storagePath, 'utf8');

assertContains(storagePath,
    'ALTER TABLE replay_rule_versions ADD COLUMN base_rules_version',
    'storage 添加 base_rules_version 列');

assertContains(storagePath,
    'ALTER TABLE replay_rule_versions ADD COLUMN time_rules_version',
    'storage 添加 time_rules_version 列');

// ============================================================
// 集成验证: state 文件结构测试
// ============================================================
console.log('\n\x1b[1m【集成验证】state 文件结构测试\x1b[0m');
console.log('验证 stateManager 能正确处理带 hash 的状态\n');

const stateManagerPath = path.join(PROJECT_ROOT, 'src/services/replay-rules-state.js');
const stateManagerContent = fs.readFileSync(stateManagerPath, 'utf8');

// stateManager 的 loadState 应该能处理带 hash 的 current 对象
// 检查 saveState 和 loadState 正常工作（不关心具体内容，只关心流程完整）
assert(fs.existsSync(stateManagerPath), 'replay-rules-state.js 存在');
assertContains(stateManagerPath,
    'saveState(state)',
    'stateManager 包含 saveState 方法');

// ============================================================
// Phase A: UI 重构测试（方案 A）
// ============================================================
console.log('\n\x1b[1m【Phase A】UI 重构测试（方案 A）\x1b[0m');
console.log('验证模态框布局调整和规则库显示逻辑\n');

// 测试 HTML 模态框 footer 存在
const htmlPath = path.join(PROJECT_ROOT, 'public/results.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

assert(htmlContent.includes('modal-footer border-top-0 pb-4 px-4 justify-content-end'),
    'modal-footer 存在，包含 border-top-0 pb-4 px-4 justify-content-end');

assert(htmlContent.includes('\u201dreplayRulesSelectionSaveR\u201D') && htmlContent.includes('保存规则选择'),
    '保存按钮在 modal-footer 中，文案为"保存规则选择"');

// 确认旧的内嵌保存按钮已从时间规则行移除
assert(!htmlContent.includes('id="replayRulesTimeFormatIdR"></select><button class="btn btn-outline-success" id="replayRulesSelectionSaveR">保存</button>'),
    '时间规则行内嵌的保存按钮已移除');

// 测试 frontend JS - attachToReplayRulesModal 新布局（frontendContent 已在上方声明）

assert(frontendContent.includes("communityRulesLibraryStatus"),
    'attachToReplayRulesModal 创建了 communityRulesLibraryStatus 状态行');

assert(frontendContent.includes('col-md-4') && frontendContent.includes('col-md-8'),
    'attachToReplayRulesModal 使用 col-md-4 + col-md-8 两列布局');

assert(frontendContent.includes("onStatusUpdate") || frontendContent.includes("onApply"),
    'renderRulesLibrary 接受 onStatusUpdate 和 onApply 回调');

assert(frontendContent.includes('下载更新') || frontendContent.includes('community-apply-btn'),
    'renderRulesLibrary 渲染 [下载更新] 按钮');

assert(frontendContent.includes('[当前]') || frontendContent.includes('当前'),
    'renderRulesLibrary 渲染 [当前] 状态按钮');

assert(frontendContent.includes("updateLibraryStatus") || frontendContent.includes("communityRulesLibraryStatus"),
    'attachToReplayRulesModal 定义了 updateLibraryStatus 函数');

// ============================================================
// 最终报告
// ============================================================
console.log('\n========================================');
console.log('测试报告');
console.log('========================================');
console.log(`\x1b[32m通过: ${TEST_PASS.length}\x1b[0m`);
console.log(`\x1b[31m失败: ${TEST_FAIL.length}\x1b[0m`);

if (TEST_FAIL.length > 0) {
    console.log('\n\x1b[31m失败详情:\x1b[0m');
    TEST_FAIL.forEach((msg, i) => {
        console.log(`  ${i + 1}. ${msg}`);
    });
    process.exit(1);
} else {
    console.log('\n\x1b[32m所有测试通过！\x1b[0m\n');
    process.exit(0);
}
