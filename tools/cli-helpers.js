import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXIT_FAILURE = 1;
export const EXIT_SUCCESS = 0;
export const JSON_INDENT = 2;

export async function writeOptionalJsonFile(options) {
    if (!options.filePath) {
        return;
    }
    await writeFile(options.filePath, `${jsonText(options.value)}\n`);
}

export function writeFormattedOutput(options) {
    if (options.json) {
        console.log(jsonText(options.value));
        return;
    }
    console.log(options.format(options.value));
}

export function jsonText(value) {
    return JSON.stringify(value, null, JSON_INDENT);
}

export function isCliEntry(metaUrl) {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(metaUrl);
}
