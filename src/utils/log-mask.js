function maskUrlHost(raw) {
    const s = String(raw || '');
    return s.replace(/(https?:\/\/)([^\/\s?&#]+)/ig, '$1***');
}

function maskEncodedUrlHost(raw) {
    const s = String(raw || '');
    return s
        .replace(/https%3A%2F%2F[^%\/\s&#]+/ig, 'https%3A%2F%2F***')
        .replace(/http%3A%2F%2F[^%\/\s&#]+/ig, 'http%3A%2F%2F***');
}

function maskText(raw) {
    return maskEncodedUrlHost(maskUrlHost(String(raw || '')));
}

module.exports = {
    maskText,
    maskUrlHost
};
