import { safeName } from './encoding.js';

export function routeKey(method, pathname) {
    return `${method} ${pathname}`;
}

export function isPlanFileRoute(method, pathname) {
    return (method === 'GET' || method === 'PUT') && /^\/v2\/plans\/[^/]+\/files\/[^/]+$/.test(pathname);
}

export function isBundleRoute(method, pathname) {
    return (method === 'GET' || method === 'PUT') && /^\/v2\/plans\/[^/]+\/bundle$/.test(pathname);
}

export function parsePlanFilePath(pathname) {
    const parts = pathname.split('/');
    return { pathB64: parts[5], planId: safeName(parts[3], 'plan id') };
}

export function parsePlanBundlePath(pathname) {
    return safeName(pathname.split('/')[3], 'plan id');
}
