import { decodePath, safeName } from './encoding.js';
import { badRequest, HttpError, notFound } from './http-error.js';
import { buildPullPlan, buildPushPlan } from './planner.js';

const JSON_TYPE = 'application/json; charset=utf-8';
const BINARY_TYPE = 'application/octet-stream';
const SSE_TYPE = 'text/event-stream; charset=utf-8';
const DEFAULT_MAX_BODY_BYTES = 512 * 1024 * 1024;
const PROGRESS_EVENT_INTERVAL_MS = 1000;

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
    const route = routeKey(context.request.method, url.pathname);
    if (route === 'GET /v2/status') {
        return sendJson(context.response, await context.storage.status());
    }
    if (route === 'POST /v2/pair/complete') {
        return handlePair(context);
    }
    if (route === 'POST /v2/session/open') {
        return handleSession(context);
    }
    if (route === 'POST /v2/sync/push-plan') {
        return handlePlan(context, 'push');
    }
    if (route === 'POST /v2/sync/pull-plan') {
        return handlePlan(context, 'pull');
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

async function handlePair(context) {
    const body = normalizePairingBody(await readJsonBody(context.request));
    return sendJson(context.response, await context.storage.completePairing(body));
}

async function handleSession(context) {
    const body = await readJsonBody(context.request);
    await authenticate(context, body.namespace);
    return sendJson(context.response, await context.storage.openSession(body.namespace, body.deviceId));
}

async function handlePlan(context, kind) {
    const body = await readJsonBody(context.request);
    await authenticate(context, body.namespace);
    const remoteManifest = await context.storage.readManifest(body.namespace);
    const plan = kind === 'push'
        ? buildPushPlan({ ...body, remoteManifest })
        : buildPullPlan({ ...body, remoteManifest });
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
    await stageUploadBundle(context, plan);
    return sendJson(context.response, { ok: true, staged: Object.keys(plan.staged).length });
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
    await writeProgressEvent(context, plan.id);
    if (url.searchParams.get('once') === '1') {
        context.response.end();
        return;
    }
    streamProgressEvents(context, plan.id);
}

async function downloadPlanFile(context, plan, syncPath) {
    const entry = findPlanEntry(plan.downloads, syncPath);
    const buffer = await context.storage.readRemoteFile(plan.namespace, entry);
    context.response.writeHead(200, {
        'Content-Length': buffer.length,
        'Content-Type': BINARY_TYPE,
    });
    context.response.end(buffer);
}

async function uploadPlanFile(context, plan, syncPath) {
    const entry = findPlanEntry(plan.uploads, syncPath);
    await context.storage.stageFile(plan, entry, await readRawBody(context.request));
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
    for (const file of body.files) {
        const entry = findPlanEntry(plan.uploads, file.path);
        await context.storage.stageFile(plan, entry, Buffer.from(String(file.contentBase64 || ''), 'base64'));
    }
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

function pairingBodyFromUri(body) {
    const uri = new URL(body.pairingUri);
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

function planSummary(plan) {
    return {
        id: plan.id,
        kind: plan.kind,
        namespace: plan.namespace,
        uploads: plan.uploads,
        downloads: plan.downloads,
        remoteDeletes: plan.remoteDeletes,
        localDeletes: plan.localDeletes,
        conflicts: plan.conflicts,
        committedAt: plan.committedAt,
        progress: progressSummary(plan),
        summary: {
            conflictFiles: plan.conflicts.length,
            deleteFiles: plan.kind === 'push' ? plan.remoteDeletes.length : plan.localDeletes.length,
            downloadBytes: sumBytes(plan.downloads),
            downloadFiles: plan.downloads.length,
            uploadBytes: sumBytes(plan.uploads.filter(entry => !entry.conflict)),
            uploadFiles: plan.uploads.filter(entry => !entry.conflict).length,
        },
    };
}

function progressSummary(plan) {
    const totalFiles = plan.uploads.length + plan.downloads.length;
    const totalBytes = sumBytes([...plan.uploads, ...plan.downloads]);
    const staged = Object.values(plan.staged || {});
    const committed = Boolean(plan.committedAt);
    return {
        bytesTransferred: committed ? totalBytes : sumBytes(staged),
        currentPath: currentProgressPath(plan),
        phase: progressPhase(plan, staged),
        totalBytes,
        totalFiles,
        filesTransferred: committed ? totalFiles : staged.length,
    };
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

function sumBytes(entries) {
    return entries.reduce((total, entry) => total + Number(entry.sizeBytes || 0), 0);
}

function currentProgressPath(plan) {
    const staged = new Set(Object.keys(plan.staged || {}));
    const pending = [...plan.uploads, ...plan.downloads].find(entry => !staged.has(entry.path));
    return pending?.path || '';
}

function progressPhase(plan, staged) {
    if (plan.committedAt) {
        return 'committed';
    }
    return staged.length > 0 ? 'transferring' : 'planned';
}

function startEventStream(response) {
    response.writeHead(200, {
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'Content-Type': SSE_TYPE,
    });
}

async function writeProgressEvent(context, planId) {
    const plan = await context.storage.readPlan(planId);
    context.response.write(`event: progress\ndata: ${JSON.stringify(progressSummary(plan))}\n\n`);
    return plan;
}

function streamProgressEvents(context, planId) {
    const timer = setInterval(async () => {
        const plan = await writeProgressEvent(context, planId);
        if (plan.committedAt) {
            clearInterval(timer);
            context.response.end();
        }
    }, PROGRESS_EVENT_INTERVAL_MS);
    context.request.on('close', () => clearInterval(timer));
}

async function readJsonBody(request, fallback) {
    const buffer = await readRawBody(request);
    if (buffer.length === 0 && fallback !== undefined) {
        return fallback;
    }
    try {
        return JSON.parse(buffer.toString('utf8'));
    } catch {
        throw badRequest('Request body must be valid JSON');
    }
}

function readRawBody(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        request.on('data', chunk => {
            size += chunk.length;
            if (size > maxBodyBytes()) {
                reject(badRequest('Request body is too large'));
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => resolve(Buffer.concat(chunks)));
        request.on('error', reject);
    });
}

function sendJson(response, body, status = 200) {
    const payload = Buffer.from(`${JSON.stringify(body)}\n`);
    response.writeHead(status, {
        'Content-Length': payload.length,
        'Content-Type': JSON_TYPE,
    });
    response.end(payload);
}

async function sendError(response, error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    sendJson(response, { error: message }, status);
}

function maxBodyBytes() {
    const configured = Number(process.env.TT_SYNC_MAX_BODY_BYTES);
    return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_BODY_BYTES;
}
