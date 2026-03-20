let runtimeStorageMode = '';

function normalizeStorageMode(v) {
    const raw = String(v || '').trim().toLowerCase();
    if (raw === 'json' || raw === 'sqlite' || raw === 'dual') return raw;
    return '';
}

function setStorageMode(v) {
    const next = normalizeStorageMode(v);
    if (!next) return false;
    runtimeStorageMode = next;
    return true;
}

function getStorageMode() {
    const runtime = normalizeStorageMode(runtimeStorageMode);
    if (runtime) return runtime;
    const envMode = normalizeStorageMode(process.env.STORAGE_MODE || '');
    if (envMode) return envMode;
    return 'sqlite';
}

function shouldWriteJson() {
    const mode = getStorageMode();
    return mode === 'json' || mode === 'dual';
}

function shouldWriteSqlite() {
    const mode = getStorageMode();
    return mode === 'sqlite' || mode === 'dual';
}

module.exports = {
    normalizeStorageMode,
    setStorageMode,
    getStorageMode,
    shouldWriteJson,
    shouldWriteSqlite
};
