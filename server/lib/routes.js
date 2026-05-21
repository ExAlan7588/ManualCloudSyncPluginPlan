import { decodePath, safeName } from './encoding.js';
import {
    publicErrorMessage,
    readJsonBody,
    readJsonRequest,
    sendError,
    sendJson,
    sendOptions,
    startEventStream,
    writeServerSentEvent,
} from './http-helpers.js';
import { notFound } from './http-error.js';
import { planSummary, progressSummary } from './plan-response.js';
import { buildPullPlan, buildPushPlan } from './planner.js';
import { authenticate, authenticateQuery, loadAuthedPlan } from './route-auth.js';
import { isBundleRoute, isPlanFileRoute, parsePlanBundlePath, parsePlanFilePath, routeKey } from './route-matching.js';
import { buildDownloadBundle, downloadPlanFile, stageUploadBundle, uploadPlanFile } from './route-plan-transfer.js';
import { normalizePairingBody, pairedDevice, pairingEndpoint, pairingSpki, requestDeviceId } from './route-request.js';
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

const PROGRESS_EVENT_INTERVAL_MS = 1000;

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
    const namespace = safeName(body.namespace || 'default', 'namespace');
    await authenticate(context, namespace);
    return sendJson(context.response, await context.storage.openSession(namespace, requestDeviceId(body.deviceId)));
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
    const namespace = safeName(body.namespace || 'default', 'namespace');
    await authenticate(context, namespace);
    const remoteManifest = await context.storage.readManifest(namespace);
    const plan = buildPlan({ ...body, deviceId: requestDeviceId(body.deviceId), kind, namespace, remoteManifest });
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
    return sendJson(context.response, await uploadPlanFile(context, plan, syncPath));
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

function buildPlan(input) {
    return input.kind === 'push'
        ? buildPushPlan(input)
        : buildPullPlan(input);
}

async function writeProgressEvent(context, planId) {
    const plan = await context.storage.readPlan(planId);
    writeServerSentEvent(context.response, 'progress', progressSummary(plan));
    return plan;
}

function streamProgressEvents(context, planId) {
    let polling = false;
    const timer = setInterval(async () => {
        if (polling) {
            return;
        }
        polling = true;
        try {
            const plan = await writeProgressEventOrClose(context, planId);
            if (!plan || plan.committedAt) {
                closeProgressStream(context.response, timer);
            }
        } finally {
            polling = false;
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
    writeServerSentEvent(response, 'error', { error: publicErrorMessage(error) });
}
