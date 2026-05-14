import { decodeBase64Content } from './base64-content.js';
import { decodePath, safeName } from './encoding.js';
import {
    maxBodyBytes,
    readJsonBody,
    readJsonRequest,
    sendError,
    sendJson,
    sendOptions,
    startEventStream,
    writeServerSentEvent,
} from './http-helpers.js';
import { badRequest, HttpError, notFound } from './http-error.js';
import { planSummary, progressSummary } from './plan-response.js';
import { buildPullPlan, buildPushPlan } from './planner.js';
import { pipeFileToResponse } from './stream-io.js';
import {
    isTauriPlanRequest,
    isTauriPairingRequest,
    isTauriSessionRequest,
    normalizeTauriPlanInput,
    normalizeTauriPairingBody,
    normalizeTauriSessionBody,
    tauriNamespace,
    tauriPlanResponse,
    tauriPairingResponse,
    tauriSessionResponse,
    verifyTauriSessionRequest,
} from './tauri-contract.js';

const BINARY_TYPE = 'application/octet-stream';
const PROGRESS_EVENT_INTERVAL_MS = 1000;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const SPKI_SHA256_BYTES = 32;

const STATIC_ROUTE_HANDLERS = Object.freeze({
    'GET /v2/status': handleStatus,
    'POST /v2/pair/complete': handlePair,
    'POST /v2/account/login': handleAccountLogin,
    'POST /v2/account/pairing-uri': handleAccountPairingUri,
    'POST /v2/account/token/refresh': handleTokenRefresh,
    'POST /v2/session/open': handleSession,
    'GET /v2/devices': handleDevices,
    'GET /v2/history': handleHistory,
    'GET /v2/rollback-points': handleRollbackPoints,
    'POST /v2/sync/push-plan': context => handlePlan(context, 'push'),
    'POST /v2/sync/pull-plan': context => handlePlan(context, 'pull'),
});

export function createHandler(storage) {
    return async (request, response) => {
        try {
            await dispatch({ request, response, storage });
        } catch (error) {
            await sendError(response, error);
        }
    };
}

async function dispatch(context) {
    const url = new URL(context.request.url, 'http://127.0.0.1');
    if (context.request.method === 'OPTIONS') {
        return sendOptions(context.response);
    }
    const route = routeKey(context.request.method, url.pathname);
    const staticHandler = STATIC_ROUTE_HANDLERS[route];
    if (staticHandler) {
        return staticHandler(context, url);
    }
    return dispatchDynamicRoute(context, route, url);
}

async function dispatchDynamicRoute(context, route, url) {
    if (context.request.method === 'POST' && /^\/v2\/rollback-points\/[^/]+\/restore$/.test(url.pathname)) {
        return handleRollbackRestore(context, url);
    }
    if (isPlanFileRoute(context.request.method, url.pathname)) {
        return handlePlanFile(context, url.pathname);
    }
    if (isBundleRoute(context.request.method, url.pathname)) {
        return handleBundle(context, url.pathname);
    }
    if (context.request.method === 'GET' && /^\/v2\/plans\/[^/]+\/events$/.test(url.pathname)) {
        return handlePlanEvents(context, url);
    }
    if (context.request.method === 'POST' && /^\/v2\/plans\/[^/]+\/commit$/.test(url.pathname)) {
        return handleCommit(context, url.pathname);
    }
    throw notFound(`Route not found: ${route}`);
}

async function handleStatus(context) {
    return sendJson(context.response, await context.storage.status());
}

async function handlePair(context, url) {
    const body = await readJsonBody(context.request);
    if (isTauriPairingRequest(body, url)) {
        const record = await context.storage.completeTauriPairing(normalizeTauriPairingBody(body, url));
        return sendJson(context.response, tauriPairingResponse(record));
    }
    const normalizedBody = normalizePairingBody(body);
    return sendJson(context.response, await context.storage.completePairing(normalizedBody));
}

async function handleAccountLogin(context) {
    const body = await readJsonBody(context.request);
    return sendJson(context.response, await context.storage.loginAccount(body));
}

async function handleAccountPairingUri(context) {
    const body = await readJsonBody(context.request);
    return sendJson(context.response, await context.storage.createAccountPairing({
        authHeader: context.request.headers.authorization,
        endpoint: pairingEndpoint(body),
        namespace: body.namespace,
        spki: pairingSpki(body),
    }));
}

async function handleTokenRefresh(context) {
    const body = await readJsonBody(context.request);
    const namespace = safeName(body.namespace || 'default', 'namespace');
    return sendJson(context.response, await context.storage.refreshAccountToken(namespace, body.refreshToken));
}

async function handleSession(context) {
    const { body, buffer } = await readJsonRequest(context.request);
    if (isTauriSessionRequest(context.request)) {
        const sessionBody = normalizeTauriSessionBody(body);
        const namespace = tauriNamespace();
        const record = await context.storage.readNamespace(namespace);
        const device = pairedDevice(record, sessionBody.deviceId);
        verifyTauriSessionRequest({
            body: sessionBody,
            bodyBuffer: buffer,
            device,
            request: context.request,
        });
        return sendJson(context.response, tauriSessionResponse(await context.storage.openSession(namespace, sessionBody.deviceId)));
    }
    await authenticate(context, body.namespace);
    return sendJson(context.response, await context.storage.openSession(body.namespace, body.deviceId));
}

async function handleDevices(context, url) {
    const namespace = await authenticateQuery(context, url);
    return sendJson(context.response, { devices: await context.storage.listDevices(namespace) });
}

async function handleHistory(context, url) {
    const namespace = await authenticateQuery(context, url);
    return sendJson(context.response, { history: await context.storage.listHistory(namespace) });
}

async function handleRollbackPoints(context, url) {
    const namespace = await authenticateQuery(context, url);
    return sendJson(context.response, { rollbackPoints: await context.storage.listRollbackPoints(namespace) });
}

async function handleRollbackRestore(context, url) {
    const namespace = await authenticateQuery(context, url);
    const rollbackId = safeName(url.pathname.split('/')[3], 'rollback id');
    return sendJson(context.response, await context.storage.restoreRollbackPoint(namespace, rollbackId));
}

async function handlePlan(context, kind) {
    const body = await readJsonBody(context.request);
    if (isTauriPlanRequest(body, kind)) {
        const namespace = tauriNamespace();
        const { session } = await context.storage.requireAuthSession(namespace, context.request.headers.authorization);
        const remoteManifest = await context.storage.readManifest(namespace);
        const localInput = normalizeTauriPlanInput({
            body,
            deviceId: session.deviceId,
            manifestKey: kind === 'push' ? 'source_manifest' : 'target_manifest',
        });
        const plan = buildPlan({ ...localInput, kind, remoteManifest });
        await context.storage.savePlan(plan);
        return sendJson(context.response, tauriPlanResponse(plan));
    }
    await authenticate(context, body.namespace);
    const remoteManifest = await context.storage.readManifest(body.namespace);
    const plan = buildPlan({ ...body, kind, remoteManifest });
    await context.storage.savePlan(plan);
    return sendJson(context.response, planSummary(plan));
}

async function handlePlanFile(context, pathname) {
    const { pathB64, planId } = parsePlanFilePath(pathname);
    const plan = await loadAuthedPlan(context, planId);
    const syncPath = decodePath(pathB64);
    if (context.request.method === 'GET') {
        return downloadPlanFile(context, plan, syncPath);
    }
    return uploadPlanFile(context, plan, syncPath);
}

async function handleBundle(context, pathname) {
    const plan = await loadAuthedPlan(context, parsePlanBundlePath(pathname));
    if (context.request.method === 'GET') {
        return sendJson(context.response, await buildDownloadBundle(context, plan));
    }
    const stagedPlan = await stageUploadBundle(context, plan);
    return sendJson(context.response, { ok: true, staged: Object.keys(stagedPlan.staged).length });
}

async function handleCommit(context, pathname) {
    const planId = safeName(pathname.split('/')[3], 'plan id');
    const plan = await loadAuthedPlan(context, planId);
    const body = await readJsonBody(context.request, {});
    return sendJson(context.response, planSummary(await context.storage.commitPlan(plan, body)));
}

async function handlePlanEvents(context, url) {
    const planId = safeName(url.pathname.split('/')[3], 'plan id');
    const plan = await loadAuthedPlan(context, planId);
    startEventStream(context.response);
    const currentPlan = await writeProgressEventOrClose(context, plan.id);
    if (!currentPlan) {
        context.response.end();
        return;
    }
    if (url.searchParams.get('once') === '1') {
        context.response.end();
        return;
    }
    streamProgressEvents(context, plan.id);
}

async function downloadPlanFile(context, plan, syncPath) {
    const entry = findPlanEntry(plan.downloads, syncPath);
    const filePath = context.storage.remoteFilePath(plan.namespace, entry.path);
    const fileStat = await context.storage.remoteFileStat(plan.namespace, entry);
    context.response.writeHead(200, {
        'Content-Length': fileStat.size,
        'Content-Type': BINARY_TYPE,
        'Last-Modified': new Date(entry.modifiedMs).toUTCString(),
        'X-TT-Sync-Modified-Ms': String(entry.modifiedMs),
    });
    await pipeFileToResponse({ filePath, response: context.response });
}

async function uploadPlanFile(context, plan, syncPath) {
    const entry = findPlanEntry(plan.uploads, syncPath);
    await context.storage.stageFileStream(plan, entry, context.request, maxBodyBytes());
    sendJson(context.response, { ok: true, path: syncPath });
}

async function buildDownloadBundle(context, plan) {
    const files = [];
    for (const entry of plan.downloads) {
        const buffer = await context.storage.readRemoteFile(plan.namespace, entry);
        files.push({ contentBase64: buffer.toString('base64'), entry, path: entry.path });
    }
    return { files };
}

async function stageUploadBundle(context, plan) {
    const body = await readJsonBody(context.request);
    if (!Array.isArray(body.files)) {
        throw badRequest('Bundle files must be an array');
    }
    let stagedPlan = plan;
    for (const file of body.files) {
        const entry = findPlanEntry(stagedPlan.uploads, bundleFilePath(file));
        stagedPlan = await context.storage.stageFile(stagedPlan, entry, decodeBundleContent(file));
    }
    return stagedPlan;
}

async function loadAuthedPlan(context, planId) {
    const plan = await context.storage.readPlan(planId);
    await authenticate(context, plan.namespace);
    return plan;
}

async function authenticate(context, namespace) {
    await context.storage.requireAuth(
        safeName(namespace, 'namespace'),
        context.request.headers.authorization,
    );
}

async function authenticateQuery(context, url) {
    const namespace = safeName(url.searchParams.get('namespace') || 'default', 'namespace');
    await authenticate(context, namespace);
    return namespace;
}

function normalizePairingBody(body) {
    if (body.pairingUri) {
        return pairingBodyFromUri(body);
    }
    return {
        deviceName: body.deviceName,
        endpoint: body.endpoint,
        namespace: safeName(body.namespace || 'default', 'namespace'),
        token: body.token,
    };
}

function pairingEndpoint(body) {
    const value = String(body.endpoint || process.env.TT_SYNC_PUBLIC_URL || '').trim();
    if (!value) {
        throw badRequest('endpoint is required for account pairing URI');
    }
    const url = parseHttpUrl(value, 'endpoint');
    return url.toString().replace(/\/$/, '');
}

function pairingSpki(body) {
    const value = String(body.spki || '').trim();
    if (!value) {
        throw badRequest('spki is required for account pairing URI');
    }
    if (!BASE64URL_PATTERN.test(value)) {
        throw badRequest('spki must be base64url');
    }
    if (Buffer.from(value, 'base64url').length !== SPKI_SHA256_BYTES) {
        throw badRequest('spki must be a base64url SHA-256 pin');
    }
    return value;
}

function parseHttpUrl(value, label) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            throw badRequest(`${label} must use http or https`);
        }
        return url;
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        throw badRequest(`${label} must be a valid URL`);
    }
}

function pairingBodyFromUri(body) {
    const uri = parsePairingUri(body.pairingUri);
    if (uri.protocol !== 'tt-sync:') {
        throw badRequest('Pairing URI must use tt-sync://');
    }
    return {
        deviceName: body.deviceName,
        endpoint: uri.searchParams.get('endpoint') || '',
        namespace: safeName(uri.searchParams.get('namespace') || 'default', 'namespace'),
        token: uri.searchParams.get('token') || '',
    };
}

function parsePairingUri(value) {
    try {
        return new URL(String(value || ''));
    } catch {
        throw badRequest('Pairing URI must be a valid tt-sync:// URI');
    }
}

function decodeBundleContent(file) {
    return decodeBase64Content(file?.contentBase64, 'Bundle file contentBase64');
}

function bundleFilePath(file) {
    if (typeof file?.path !== 'string') {
        throw badRequest('Bundle file path must be a string');
    }
    return file.path;
}

function buildPlan(input) {
    return input.kind === 'push'
        ? buildPushPlan(input)
        : buildPullPlan(input);
}

function pairedDevice(record, deviceId) {
    const device = (record.devices || []).find(item => item.deviceId === deviceId);
    if (!device?.publicKey) {
        throw badRequest(`Paired Tauri device not found: ${deviceId}`);
    }
    return device;
}

function routeKey(method, pathname) {
    return `${method} ${pathname}`;
}

function isPlanFileRoute(method, pathname) {
    return (method === 'GET' || method === 'PUT') && /^\/v2\/plans\/[^/]+\/files\/[^/]+$/.test(pathname);
}

function isBundleRoute(method, pathname) {
    return (method === 'GET' || method === 'PUT') && /^\/v2\/plans\/[^/]+\/bundle$/.test(pathname);
}

function parsePlanFilePath(pathname) {
    const parts = pathname.split('/');
    return { pathB64: parts[5], planId: safeName(parts[3], 'plan id') };
}

function parsePlanBundlePath(pathname) {
    return safeName(pathname.split('/')[3], 'plan id');
}

function findPlanEntry(entries, syncPath) {
    const entry = entries.find(item => item.path === syncPath);
    if (!entry) {
        throw notFound(`Path is not part of this plan: ${syncPath}`);
    }
    return entry;
}

async function writeProgressEvent(context, planId) {
    const plan = await context.storage.readPlan(planId);
    writeServerSentEvent(context.response, 'progress', progressSummary(plan));
    return plan;
}

function streamProgressEvents(context, planId) {
    const timer = setInterval(async () => {
        const plan = await writeProgressEventOrClose(context, planId);
        if (!plan || plan.committedAt) {
            closeProgressStream(context.response, timer);
        }
    }, PROGRESS_EVENT_INTERVAL_MS);
    context.request.on('close', () => clearInterval(timer));
}

async function writeProgressEventOrClose(context, planId) {
    try {
        return await writeProgressEvent(context, planId);
    } catch (error) {
        writeProgressErrorEvent(context.response, error);
        return null;
    }
}

function closeProgressStream(response, timer) {
    clearInterval(timer);
    response.end();
}

function writeProgressErrorEvent(response, error) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    writeServerSentEvent(response, 'error', { error: message });
}
