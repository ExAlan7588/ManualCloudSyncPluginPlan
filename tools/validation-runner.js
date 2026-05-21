import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const JAVASCRIPT_EXTENSION = '.js';
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function projectRoot() {
    return PROJECT_ROOT;
}

export function sortedJsFiles(root, directories) {
    return directories.flatMap(directory => directoryJsFiles(root, directory));
}

export function assertExistingFiles(root, files) {
    const missing = files.filter(file => !existsSync(resolve(root, file)));
    if (missing.length > 0) {
        throw new Error(`Validation files are missing: ${missing.join(', ')}`);
    }
}

export function runNodeCommand(root, args) {
    const result = spawnSync(process.execPath, args, {
        cwd: root,
        stdio: 'inherit',
    });
    if (result.error) {
        throw result.error;
    }
    if (result.signal) {
        throw new Error(`node ${args.join(' ')} terminated by ${result.signal}`);
    }
    if (result.status !== 0) {
        process.exit(result.status);
    }
}

function directoryJsFiles(root, directory) {
    const absoluteDirectory = resolve(root, directory);
    if (!existsSync(absoluteDirectory) || !statSync(absoluteDirectory).isDirectory()) {
        throw new Error(`Validation directory is missing: ${directory}`);
    }
    return readdirSync(absoluteDirectory, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith(JAVASCRIPT_EXTENSION))
        .map(entry => join(directory, entry.name))
        .sort();
}
