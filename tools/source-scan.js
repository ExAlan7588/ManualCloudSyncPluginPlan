import { opendir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export async function sourceInfoFor(options) {
    if (!options.source) {
        throw new Error(options.usageText());
    }
    const resolved = await realpath(path.resolve(options.source));
    const sourceStats = await stat(resolved);
    return {
        isSingleFile: sourceStats.isFile(),
        rootDir: sourceStats.isDirectory() ? resolved : path.dirname(resolved),
        source: resolved,
        sourceKind: options.sourceKindFor({ sourcePath: resolved, sourceStats }),
        startPath: resolved,
    };
}

export async function scanSourceEntry(options) {
    const resolved = await realpath(options.entryPath);
    if (options.state.visited.has(resolved)) {
        return;
    }
    options.state.visited.add(resolved);

    const entryStats = await stat(resolved);
    if (entryStats.isDirectory()) {
        await scanSourceDirectory({ ...options, dirPath: resolved });
        return;
    }
    if (entryStats.isFile()) {
        await options.visitFile({ filePath: resolved, state: options.state });
        return;
    }
    options.visitSpecial?.({ entryPath: resolved, state: options.state });
}

export function displayPath(state, filePath) {
    return path.relative(state.rootDir, filePath) || path.basename(filePath);
}

export function compareText(left, right) {
    return left.localeCompare(right);
}

export function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function scanSourceDirectory(options) {
    const directory = await opendir(options.dirPath);
    const names = [];
    for await (const entry of directory) {
        names.push(entry.name);
    }
    names.sort(compareText);
    for (const name of names) {
        await scanSourceEntry({
            entryPath: path.join(options.dirPath, name),
            state: options.state,
            visitFile: options.visitFile,
            visitSpecial: options.visitSpecial,
        });
    }
}
