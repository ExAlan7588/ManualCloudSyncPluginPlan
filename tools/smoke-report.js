const REPORT_SCHEMA_VERSION = 1;
const REPORT_TOOL = 'smoke-tt-sync-server';

export function formatSmokeReport(report) {
    const lines = [
        `TT-Sync server smoke ${report.ok ? 'passed' : 'failed'}`,
        `mode: ${report.mode}`,
        `endpoint: ${report.endpoint}`,
        `namespace: ${report.namespace}`,
        `smoke path: ${report.smokePath}`,
        `fixture: ${report.fixture.fileCount} files / ${report.fixture.totalBytes} bytes`,
        'checks:',
    ];
    lines.push(...report.checks.map(check => `- ${check.name}: ${check.detail}`));
    return lines.join('\n');
}

export function smokeReport(options) {
    return {
        checks: options.checks,
        completedAt: new Date().toISOString(),
        deviceId: options.pair.deviceId,
        endpoint: options.runtime.endpoint,
        fixture: {
            fileCount: options.fixture.files.length,
            totalBytes: options.fixture.totalBytes,
        },
        mode: options.runtime.mode,
        namespace: options.pair.namespace,
        ok: true,
        planIds: {
            pull: options.pulled.plan.id,
            push: options.pushed.plan.id,
        },
        schemaVersion: REPORT_SCHEMA_VERSION,
        serverId: options.pair.serverId,
        smokePath: options.fixture.path,
        smokePaths: options.fixture.paths,
        startedAt: options.runtime.startedAt,
        status: options.status,
        tool: REPORT_TOOL,
    };
}

export function assertAllPaths(options) {
    const paths = new Set(options.entries.map(entry => entry.path));
    const missing = options.expectedPaths.filter(expectedPath => !paths.has(expectedPath));
    assertCondition(missing.length === 0, `${options.label} missing ${missing.join(', ')}`);
}

export function assertCondition(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

export function recordCheck(options) {
    options.checks.push({ detail: options.detail, name: options.name, ok: true });
}
