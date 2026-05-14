import { badRequest, HttpError } from './http-error.js';

const JSON_TYPE = 'application/json; charset=utf-8';
const SSE_TYPE = 'text/event-stream; charset=utf-8';
const DEFAULT_MAX_BODY_BYTES = 512 * 1024 * 1024;
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
        return { body: JSON.parse(buffer.toString('utf8')), buffer };
    } catch (error) {
        throw badRequest(`Request body must be valid JSON: ${error.message}`);
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
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    sendJson(response, { error: message }, status);
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
    const configured = Number(process.env.TT_SYNC_MAX_BODY_BYTES);
    return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_BODY_BYTES;
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
