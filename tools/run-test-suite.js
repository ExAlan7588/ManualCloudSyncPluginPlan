#!/usr/bin/env node
import {
    assertExistingFiles,
    projectRoot,
    runNodeCommand,
} from './validation-runner.js';

const TEST_FILES = Object.freeze([
    'server/test/base64-content-run-tests.js',
    'server/test/encoding-run-tests.js',
    'server/test/http-helpers-run-tests.js',
    'server/test/manifest-run-tests.js',
    'server/test/progress-events-run-tests.js',
    'server/test/plan-response-run-tests.js',
    'server/test/routes-unit-run-tests.js',
    'server/test/storage-io-run-tests.js',
    'server/test/storage-records-run-tests.js',
    'server/test/storage-run-tests.js',
    'server/test/tauri-contract-unit-run-tests.js',
    'server/test/account-unit-run-tests.js',
    'server/test/tt-sync-server-run-tests.js',
    'server/test/run-tests.js',
    'server/test/tauri-contract-run-tests.js',
    'server/test/account-run-tests.js',
    'server/test/concurrent-upload-run-tests.js',
    'tools/test/config-run-tests.js',
    'tools/test/tt-sync-view-run-tests.js',
    'tools/test/tt-sync-progress-run-tests.js',
    'tools/test/tt-sync-events-run-tests.js',
    'tools/test/queue-renderer-run-tests.js',
    'tools/test/webdav-compat-run-tests.js',
    'tools/test/webdav-url-run-tests.js',
    'tools/test/data-migration-run-tests.js',
    'tools/test/tt-sync-account-run-tests.js',
    'tools/test/frontend-tt-sync-run-tests.js',
    'tools/test/webdav-transfer-run-tests.js',
    'tools/test/verify-tauritavern-run-tests.js',
    'tools/test/verify-tauritavern-events-run-tests.js',
    'tools/test/deploy-run-tests.js',
    'tools/test/smoke-http-run-tests.js',
    'tools/test/smoke-deploy-run-tests.js',
    'tools/test/docs-coverage-run-tests.js',
    'tools/test/validation-runner-run-tests.js',
    'tools/test/code-metrics-run-tests.js',
    'tools/test/device-evidence-run-tests.js',
    'tools/test/evidence-url-run-tests.js',
    'tools/test/run-tests.js',
]);

const root = projectRoot();

assertExistingFiles(root, TEST_FILES);

for (const file of TEST_FILES) {
    runNodeCommand(root, [file]);
}
