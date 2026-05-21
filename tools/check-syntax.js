#!/usr/bin/env node
import {
    assertExistingFiles,
    projectRoot,
    runNodeCommand,
    sortedJsFiles,
} from './validation-runner.js';

const ROOT_FILES = Object.freeze(['index.js']);
const CHECK_DIRECTORIES = Object.freeze([
    'modules',
    'server/lib',
    'server',
    'server/test',
    'tools',
    'tools/test',
]);

const root = projectRoot();
const files = [...ROOT_FILES, ...sortedJsFiles(root, CHECK_DIRECTORIES)];

assertExistingFiles(root, files);

for (const file of files) {
    runNodeCommand(root, ['--check', file]);
}
