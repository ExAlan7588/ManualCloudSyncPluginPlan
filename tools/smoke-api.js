import { encodePath } from '../server/lib/encoding.js';
import { parseJsonResponse, parseSseProgress, requestHeaders, responseErrorText } from './smoke-http.js';

export async function pushPlan(options) {
    return postJson({
        body: {
            baseManifest: options.baseManifest,
            deviceId: options.pair.deviceId,
            localManifest: options.localManifest,
            namespace: options.pair.namespace,
        },
        route: '/v2/sync/push-plan',
        runtime: options.runtime,
        token: options.pair.authToken,
    });
}

export async function pullPlan(options) {
    return postJson({
        body: {
            deviceId: options.pair.deviceId,
            localManifest: options.localManifest,
            namespace: options.pair.namespace,
        },
        route: '/v2/sync/pull-plan',
        runtime: options.runtime,
        token: options.pair.authToken,
    });
}

export async function putFile(options) {
    const response = await fetch(`${options.runtime.endpoint}/v2/plans/${options.planId}/files/${encodePath(options.syncPath)}`, {
        body: Buffer.from(options.content),
        headers: requestHeaders(options.pair.authToken, 'application/octet-stream'),
        method: 'PUT',
    });
    await parseJsonResponse(response);
}

export async function commitPlan(options) {
    return postJson({
        body: {},
        route: `/v2/plans/${options.planId}/commit`,
        runtime: options.runtime,
        token: options.pair.authToken,
    });
}

export async function getFile(options) {
    const response = await fetch(`${options.runtime.endpoint}/v2/plans/${options.planId}/files/${encodePath(options.syncPath)}`, {
        headers: requestHeaders(options.pair.authToken),
    });
    if (!response.ok) {
        throw new Error(await responseErrorText(response));
    }
    return {
        modifiedMs: response.headers.get('x-tt-sync-modified-ms'),
        text: await response.text(),
    };
}

export async function getProgress(options) {
    const response = await fetch(`${options.runtime.endpoint}/v2/plans/${options.planId}/events?once=1`, {
        headers: requestHeaders(options.pair.authToken),
    });
    if (!response.ok) {
        throw new Error(await responseErrorText(response));
    }
    return parseSseProgress(await response.text());
}

export async function getJson(options) {
    const response = await fetch(`${options.runtime.endpoint}${options.route}`, {
        headers: requestHeaders(options.token || ''),
    });
    return parseJsonResponse(response);
}

export async function postJson(options) {
    const response = await fetch(`${options.runtime.endpoint}${options.route}`, {
        body: JSON.stringify(options.body),
        headers: requestHeaders(options.token || ''),
        method: 'POST',
    });
    return parseJsonResponse(response);
}
