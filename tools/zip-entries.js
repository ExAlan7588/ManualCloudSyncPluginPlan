import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

const COMMAND_ENCODING = 'utf8';
const ZIP_CENTRAL_COMMENT_LENGTH_OFFSET = 32;
const ZIP_CENTRAL_COMPRESSED_SIZE_OFFSET = 20;
const ZIP_CENTRAL_EXTRA_LENGTH_OFFSET = 30;
const ZIP_CENTRAL_FIXED_BYTES = 46;
const ZIP_CENTRAL_LOCAL_HEADER_OFFSET = 42;
const ZIP_CENTRAL_METHOD_OFFSET = 10;
const ZIP_CENTRAL_NAME_LENGTH_OFFSET = 28;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_DEFLATE_METHOD = 8;
const ZIP_EOCD_CENTRAL_OFFSET_OFFSET = 16;
const ZIP_EOCD_CENTRAL_SIZE_OFFSET = 12;
const ZIP_EOCD_FIXED_BYTES = 22;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_LOCAL_EXTRA_LENGTH_OFFSET = 28;
const ZIP_LOCAL_FIXED_BYTES = 30;
const ZIP_LOCAL_NAME_LENGTH_OFFSET = 26;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_MAX_COMMENT_BYTES = 0xffff;
const ZIP_STORE_METHOD = 0;
const ZIP_UINT32_MAX = 0xffffffff;

export const ZIP_LIKE_EXTENSIONS = new Set(['.aab', '.apk', '.jar', '.zip']);

export function zipEntriesFrom(options) {
    const eocdOffset = findEndOfCentralDirectory(options.buffer);
    if (eocdOffset < 0) {
        if (isZipLike(options.label)) {
            throw new Error(`ZIP end of central directory not found in ${options.label}`);
        }
        return [];
    }
    try {
        return readZipEntries({ eocdOffset, ...options });
    } catch (error) {
        if (isZipLike(options.label)) {
            throw error;
        }
        return [];
    }
}

export function isZipLike(label) {
    return ZIP_LIKE_EXTENSIONS.has(path.extname(label).toLowerCase());
}

function readZipEntries(options) {
    const centralDirectory = centralDirectoryFrom(options);
    const entries = [];
    let cursor = centralDirectory.offset;
    const endOffset = centralDirectory.offset + centralDirectory.size;
    while (cursor < endOffset) {
        const entry = centralEntryFrom({ cursor, ...options });
        entries.push(zipEntryContent({ entry, ...options }));
        cursor += entry.headerSize;
    }
    if (cursor !== endOffset) {
        throw new Error(`Invalid ZIP central directory size in ${options.label}`);
    }
    return entries;
}

function findEndOfCentralDirectory(buffer) {
    if (buffer.length < ZIP_EOCD_FIXED_BYTES) {
        return -1;
    }
    const searchStart = Math.max(0, buffer.length - ZIP_MAX_COMMENT_BYTES - ZIP_EOCD_FIXED_BYTES);
    for (let index = buffer.length - ZIP_EOCD_FIXED_BYTES; index >= searchStart; index -= 1) {
        if (buffer.readUInt32LE(index) === ZIP_EOCD_SIGNATURE) {
            return index;
        }
    }
    return -1;
}

function centralDirectoryFrom(options) {
    const size = options.buffer.readUInt32LE(options.eocdOffset + ZIP_EOCD_CENTRAL_SIZE_OFFSET);
    const offset = options.buffer.readUInt32LE(options.eocdOffset + ZIP_EOCD_CENTRAL_OFFSET_OFFSET);
    if (size === ZIP_UINT32_MAX || offset === ZIP_UINT32_MAX) {
        throw new Error(`ZIP64 archives are not supported by this verifier: ${options.label}`);
    }
    assertReadableRange({ buffer: options.buffer, label: options.label, length: size, offset });
    return { offset, size };
}

function centralEntryFrom(options) {
    assertReadableRange({
        buffer: options.buffer,
        label: options.label,
        length: ZIP_CENTRAL_FIXED_BYTES,
        offset: options.cursor,
    });
    if (options.buffer.readUInt32LE(options.cursor) !== ZIP_CENTRAL_SIGNATURE) {
        throw new Error(`Invalid ZIP central directory in ${options.label}`);
    }
    return centralEntryFields(options);
}

function centralEntryFields(options) {
    const nameLength = options.buffer.readUInt16LE(options.cursor + ZIP_CENTRAL_NAME_LENGTH_OFFSET);
    const extraLength = options.buffer.readUInt16LE(options.cursor + ZIP_CENTRAL_EXTRA_LENGTH_OFFSET);
    const commentLength = options.buffer.readUInt16LE(options.cursor + ZIP_CENTRAL_COMMENT_LENGTH_OFFSET);
    const headerSize = ZIP_CENTRAL_FIXED_BYTES + nameLength + extraLength + commentLength;
    const nameOffset = options.cursor + ZIP_CENTRAL_FIXED_BYTES;
    const compressedSize = options.buffer.readUInt32LE(options.cursor + ZIP_CENTRAL_COMPRESSED_SIZE_OFFSET);
    const localHeaderOffset = options.buffer.readUInt32LE(options.cursor + ZIP_CENTRAL_LOCAL_HEADER_OFFSET);
    assertReadableRange({ buffer: options.buffer, label: options.label, length: nameLength, offset: nameOffset });
    assertReadableRange({ buffer: options.buffer, label: options.label, length: headerSize, offset: options.cursor });
    assertZip32Entry({ compressedSize, label: options.label, localHeaderOffset });
    return {
        compressedSize,
        headerSize,
        localHeaderOffset,
        method: options.buffer.readUInt16LE(options.cursor + ZIP_CENTRAL_METHOD_OFFSET),
        name: options.buffer.toString(COMMAND_ENCODING, nameOffset, nameOffset + nameLength),
    };
}

function zipEntryContent(options) {
    const dataStart = zipEntryDataStart(options);
    assertReadableRange({
        buffer: options.buffer,
        label: `${options.label}!/${options.entry.name}`,
        length: options.entry.compressedSize,
        offset: dataStart,
    });
    const compressed = options.buffer.subarray(dataStart, dataStart + options.entry.compressedSize);
    return {
        content: inflateZipEntry({ compressed, entry: options.entry, label: options.label }),
        name: options.entry.name,
    };
}

function zipEntryDataStart(options) {
    assertReadableRange({
        buffer: options.buffer,
        label: options.label,
        length: ZIP_LOCAL_FIXED_BYTES,
        offset: options.entry.localHeaderOffset,
    });
    if (options.buffer.readUInt32LE(options.entry.localHeaderOffset) !== ZIP_LOCAL_SIGNATURE) {
        throw new Error(`Invalid ZIP local header in ${options.label}!/${options.entry.name}`);
    }
    const nameLength = options.buffer.readUInt16LE(options.entry.localHeaderOffset + ZIP_LOCAL_NAME_LENGTH_OFFSET);
    const extraLength = options.buffer.readUInt16LE(options.entry.localHeaderOffset + ZIP_LOCAL_EXTRA_LENGTH_OFFSET);
    return options.entry.localHeaderOffset + ZIP_LOCAL_FIXED_BYTES + nameLength + extraLength;
}

function inflateZipEntry(options) {
    if (options.entry.method === ZIP_STORE_METHOD) {
        return options.compressed;
    }
    if (options.entry.method === ZIP_DEFLATE_METHOD) {
        return inflateRawSync(options.compressed);
    }
    throw new Error(`Unsupported ZIP compression method ${options.entry.method} in ${options.label}!/${options.entry.name}`);
}

function assertReadableRange(options) {
    const endOffset = options.offset + options.length;
    if (options.offset < 0 || options.length < 0 || endOffset > options.buffer.length) {
        throw new Error(`Invalid ZIP range in ${options.label}`);
    }
}

function assertZip32Entry(options) {
    if (options.compressedSize === ZIP_UINT32_MAX || options.localHeaderOffset === ZIP_UINT32_MAX) {
        throw new Error(`ZIP64 entries are not supported by this verifier: ${options.label}`);
    }
}
