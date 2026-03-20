const assert = require('assert');
const authManager = require('../core/auth');

function testHashAndVerifyPassword() {
    const pwd = 'abc123!@#';
    const hashed = authManager.hashPassword(pwd);
    assert.ok(String(hashed).startsWith('s2:'));
    assert.strictEqual(authManager.verifyPassword(pwd, hashed), true);
    assert.strictEqual(authManager.verifyPassword('wrong', hashed), false);
}

function testCaptchaLifecycle() {
    const captcha = authManager.generateCaptcha();
    assert.ok(captcha && captcha.id && captcha.svg);
    const store = authManager.CAPTCHA_STORE.get(captcha.id);
    assert.ok(store && store.text);
    const ok = authManager.verifyCaptcha(captcha.id, store.text);
    assert.strictEqual(ok, true);
    const reused = authManager.verifyCaptcha(captcha.id, store.text);
    assert.strictEqual(reused, false);
}

function testSessionLifecycle() {
    const token = authManager.createSession('tester');
    assert.ok(token);
    const session = authManager.verifySession(token);
    assert.ok(session && session.username === 'tester');
    const checked = authManager.checkAuth(token);
    assert.strictEqual(checked.success, true);
    authManager.logout(token);
    const after = authManager.verifySession(token);
    assert.strictEqual(after, null);
}

async function testUpdatePasswordWithoutSession() {
    const result = await authManager.updatePassword('bad-token', 'a', 'b', 'x');
    assert.strictEqual(result.success, false);
}

async function main() {
    testHashAndVerifyPassword();
    testCaptchaLifecycle();
    testSessionLifecycle();
    await testUpdatePasswordWithoutSession();
    console.log('auth-service-tests: ok');
}

main().catch((error) => {
    console.error('auth-service-tests: failed', error && error.stack ? error.stack : error);
    process.exit(1);
});
