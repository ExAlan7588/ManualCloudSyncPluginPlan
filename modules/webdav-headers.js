export function webDavHeaderMap(headers) {
    if (headers === undefined || headers === null) {
        return {};
    }
    if (Array.isArray(headers) || typeof headers !== 'object') {
        throw new Error('WebDAV headers must be an object');
    }
    return headers;
}

export function webDavHeaders(baseHeaders, extraHeaders) {
    const headers = new Headers(webDavHeaderMap(baseHeaders));
    for (const [name, value] of Object.entries(webDavHeaderMap(extraHeaders))) {
        headers.set(name, value);
    }
    return headers;
}
