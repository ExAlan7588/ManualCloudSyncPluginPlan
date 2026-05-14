import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHandler } from '../lib/routes.js';

const VALID_SPKI_PIN = Buffer.alloc(32, 1).toString('base64url');

await testAccountPairingUriRejectsUnsupportedEndpointScheme();
await testAccountPairingUriRejectsMalformedSpkiPin();
console.log('ok - routes validate account pairing URI inputs');

async function testAccountPairingUriRejectsUnsupportedEndpointScheme() {
    const response = await dispatch({
        body: {
            endpoint: 'ftp://sync.example.test',
            namespace: 'default',
            spki: VALID_SPKI_PIN,
        },
        headers: { authorization: 'Bearer token' },
        method: 'POST',
        storage: {
            async createAccountPairing() {
                throw new Error('createAccountPairing must not be called for invalid endpoint');
            },
        },
        url: '/v2/account/pairing-uri',
    });
    assert.equal(response.statusCode, 400);
    assert.match(JSON.parse(response.body).error, /endpoint must use http or https/);
}

async function testAccountPairingUriRejectsMalformedSpkiPin() {
    const response = await dispatch({
        body: {
            endpoint: 'https://sync.example.test',
            namespace: 'default',
            spki: 'abcDEF_123',
        },
        headers: { authorization: 'Bearer token' },
        method: 'POST',
        storage: {
            async createAccountPairing() {
                throw new Error('createAccountPairing must not be called for malformed spki');
            },
        },
        url: '/v2/account/pairing-uri',
    });
    assert.equal(response.statusCode, 400);
    assert.match(JSON.parse(response.body).error, /spki must be a base64url SHA-256 pin/);
}

async function dispatch(options) {
    const request = Readable.from([Buffer.from(JSON.stringify(options.body))]);
    request.method = options.method;
    request.url = options.url;
    request.headers = options.headers || {};
    const response = recordingResponse();
    await createHandler(options.storage)(request, response);
    return response;
}

function recordingResponse() {
    return {
        body: '',
        ended: false,
        headers: {},
        statusCode: 200,
        end(chunk = '') {
            this.body += chunk;
            this.ended = true;
        },
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
        },
        write(chunk = '') {
            this.body += chunk;
        },
        writeHead(statusCode, headers = {}) {
            this.statusCode = statusCode;
            for (const [name, value] of Object.entries(headers)) {
                this.setHeader(name, value);
            }
        },
    };
}
