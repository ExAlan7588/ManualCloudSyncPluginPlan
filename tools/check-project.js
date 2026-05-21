#!/usr/bin/env node
import { projectRoot, runNodeCommand } from './validation-runner.js';

const CHECK_COMMANDS = Object.freeze([
    ['tools/check-syntax.js'],
    ['tools/check-code-metrics.js'],
]);

const root = projectRoot();

for (const command of CHECK_COMMANDS) {
    runNodeCommand(root, command);
}
