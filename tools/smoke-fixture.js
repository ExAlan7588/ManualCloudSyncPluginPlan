import { sha256 } from '../server/lib/manifest.js';

const DEFAULT_FIXTURE_FILE_BYTES = null;
const DEFAULT_FIXTURE_FILE_COUNT = 1;
const FIXTURE_INDEX_PAD = 4;
const SMOKE_CONTENT_PREFIX = 'tt-sync-smoke';
const SMOKE_PATH_PREFIX = 'default-user/chats/tt-sync-smoke';

export function smokeFixture(runtime) {
    const files = Array.from({ length: runtime.bulkFiles }, (_value, index) => smokeFixtureFile({ index, runtime }));
    const entries = files.map(file => file.entry);
    const paths = files.map(file => file.path);
    const totalBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
    return {
        content: files[0].content,
        entries,
        entry: files[0].entry,
        files,
        path: files[0].path,
        paths,
        totalBytes,
    };
}

function smokeFixtureFile(options) {
    const content = fixtureContent({
        bytes: options.runtime.bulkFileBytes,
        index: options.index,
        runId: options.runtime.runId,
    });
    const buffer = Buffer.from(content);
    const smokePath = `${SMOKE_PATH_PREFIX}-${fixturePathSuffix(options)}.jsonl`;
    return {
        content,
        entry: {
            modifiedMs: Date.now(),
            path: smokePath,
            sha256: sha256(buffer),
            sizeBytes: buffer.length,
        },
        path: smokePath,
    };
}

function fixtureContent(options) {
    const seed = `${SMOKE_CONTENT_PREFIX}:${options.runId}:${options.index}\n`;
    if (options.bytes === DEFAULT_FIXTURE_FILE_BYTES) {
        return seed;
    }
    return repeatedAscii({ bytes: options.bytes, seed });
}

function repeatedAscii(options) {
    let output = options.seed;
    while (output.length < options.bytes) {
        output += output;
    }
    return output.slice(0, options.bytes);
}

function fixturePathSuffix(options) {
    if (options.runtime.bulkFiles === DEFAULT_FIXTURE_FILE_COUNT) {
        return options.runtime.runId;
    }
    return `${options.runtime.runId}-${String(options.index + 1).padStart(FIXTURE_INDEX_PAD, '0')}`;
}
