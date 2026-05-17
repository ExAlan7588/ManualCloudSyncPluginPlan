import { badRequest, HttpError } from './http-error.js';

const JSON_TYPE = 'application/json; charset=utf-8';
const SSE_TYPE = 'text/event-stream; charset=utf-8';
const DEFAULT_MAX_BODY_BYTES = 512 * 1024 * 1024;
const CONTROL_WHITESPACE_PATTERN = /[\t\n\r]+/g;
const CORS_HEADERS = Object.freeze({
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Origin': '*',
});

export async function readJsonBody(request, fallback) {
    const { body } = await readJsonRequest(request, fallback);
    return body;
}

export async function readJsonRequest(request, fallback) {
    const buffer = await readRawBody(request);
    if (buffer.length === 0 && fallback !== undefined) {
        return { body: fallback, buffer };
    }
    try {
        const body = JSON.parse(buffer.toString('utf8'));
        assertJsonObject(body);
        return { body, buffer };
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        throw badRequest(`Request body must be valid JSON: ${publicErrorMessage(error)}`);
    }
}

export function sendJson(response, body, status = 200) {
    const payload = Buffer.from(`${JSON.stringify(body)}\n`);
    response.writeHead(status, {
        ...CORS_HEADERS,
        'Content-Length': payload.length,
        'Content-Type': JSON_TYPE,
    });
    response.end(payload);
}

export function sendOptions(response) {
    response.writeHead(204, CORS_HEADERS);
    response.end();
}

export function sendError(response, error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = publicErrorMessage(error);
    sendJson(response, { error: message }, status);
}

export function publicErrorMessage(error) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    return message.replace(CONTROL_WHITESPACE_PATTERN, ' ').trim();
}

export function startEventStream(response) {
    response.writeHead(200, {
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        ...CORS_HEADERS,
        'Content-Type': SSE_TYPE,
    });
}

export function writeServerSentEvent(response, event, payload) {
    response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

export function maxBodyBytes() {
    const rawValue = process.env.TT_SYNC_MAX_BODY_BYTES;
    if (rawValue === undefined || rawValue === '') {
        return DEFAULT_MAX_BODY_BYTES;
    }
    if (!/^\d+$/.test(rawValue.trim())) {
        throw new Error('TT_SYNC_MAX_BODY_BYTES must be a positive integer');
    }
    const configured = Number(rawValue);
    if (!Number.isSafeInteger(configured) || configured <= 0) {
        throw new Error('TT_SYNC_MAX_BODY_BYTES must be a positive integer');
    }
    return configured;
}

function readRawBody(request) {
    const limitBytes = maxBodyBytes();
    return new Promise((resolve, reject) => {
        const chunks = [];
        let settled = false;
        let size = 0;
        request.on('data', chunk => {
            if (settled) {
                return;
            }
            size += chunk.length;
            if (size > limitBytes) {
                settled = true;
                reject(badRequest('Request body is too large'));
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(Buffer.concat(chunks));
        });
        request.on('error', error => {
            if (settled) {
                return;
            }
            settled = true;
            reject(error);
        });
    });
}

function assertJsonObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw badRequest('Request body must be a JSON object');
    }
}
