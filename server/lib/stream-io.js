import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { badRequest, forbidden } from './http-error.js';

export async function writeRequestStreamAtomic(options) {
    await mkdir(path.dirname(options.filePath), { recursive: true });
    const tmpPath = `${options.filePath}.${process.pid}.${randomUUID()}.tmp`;
    const digest = createHash('sha256');
    const counter = countBytesTransform({
        digest,
        expectedBytes: options.expectedBytes,
        maxBytes: options.maxBytes,
        syncPath: options.syncPath,
    });
    try {
        await pipeline(options.stream, counter, createWriteStream(tmpPath));
        const actualSha256 = digest.digest('hex');
        validateCompletedStream({
            actualBytes: counter.bytesRead,
            actualSha256,
            expectedBytes: options.expectedBytes,
            expectedSha256: options.expectedSha256,
            syncPath: options.syncPath,
        });
        await rename(tmpPath, options.filePath);
        return { sha256: actualSha256, sizeBytes: counter.bytesRead };
    } catch (error) {
        await rm(tmpPath, { force: true });
        throw error;
    }
}

export async function pipeFileToResponse(options) {
    await pipeline(createReadStream(options.filePath), options.response);
}

function countBytesTransform(options) {
    const stream = new Transform({
        transform(chunk, _encoding, callback) {
            stream.bytesRead += chunk.length;
            if (stream.bytesRead > options.maxBytes) {
                callback(badRequest('Request body is too large'));
                return;
            }
            options.digest.update(chunk);
            callback(null, chunk);
        },
    });
    stream.bytesRead = 0;
    return stream;
}

function validateCompletedStream(options) {
    if (options.actualBytes !== Number(options.expectedBytes)) {
        throw forbidden(`Uploaded size does not match manifest for ${options.syncPath}`);
    }
    if (options.expectedSha256 && options.actualSha256 !== options.expectedSha256) {
        throw forbidden(`Uploaded sha256 does not match manifest for ${options.syncPath}`);
    }
}
