import path from 'node:path';
import {
    REQUIRED_DEPLOY_CHECKS,
    REQUIRED_SMOKE_CHECKS,
} from './incremental-evidence-schema.js';

export function deployChecks(report) {
    const names = passedCheckNames(report);
    return [
        check('deploy report ok', report?.ok === true, 'deploy report must have ok=true'),
        check('deploy report verifiedAt', isTimestamp(report?.verifiedAt), 'deploy report must include a parseable verifiedAt timestamp'),
        check('deploy report service path', hasText(report?.servicePath), 'deploy report must include servicePath'),
        check('deploy report env path', hasText(report?.envPath), 'deploy report must include envPath'),
        check('deploy report real service path', isFinalDeployPath(report?.servicePath), 'final deploy servicePath must be an absolute non-template path'),
        check('deploy report real env path', isFinalDeployPath(report?.envPath), 'final deploy envPath must be an absolute non-template path'),
        check('deploy report public URL', hasText(report?.publicUrl), 'deploy report must include publicUrl'),
        check('deploy report real env mode', report?.allowPlaceholders === false, 'final evidence deploy report must not allow placeholders'),
        check('deploy report checks passed', reportChecksPassed(report), 'deploy report checks must all be ok=true with name and detail'),
        ...REQUIRED_DEPLOY_CHECKS.map(name => check(`deploy ${name}`, names.has(name), `${name} check is required`)),
    ];
}

export function smokeChecks(report) {
    const names = passedCheckNames(report);
    return [
        check('smoke report ok', report?.ok === true, 'smoke report must have ok=true'),
        check('smoke report completedAt', isTimestamp(report?.completedAt), 'smoke report must include a parseable completedAt timestamp'),
        check('smoke report deviceId', hasText(report?.deviceId), 'smoke report must include paired deviceId'),
        check('smoke report serverId', hasText(report?.serverId), 'smoke report must include paired serverId'),
        check('smoke report path', hasText(report?.smokePath), 'smoke report must include smokePath'),
        check('smoke report plan ids', hasText(report?.planIds?.push) && hasText(report?.planIds?.pull), 'smoke report must include push and pull plan ids'),
        check('smoke report fixture files', hasPositiveInteger(report?.fixture?.fileCount), 'smoke report must include fixture.fileCount > 0'),
        check('smoke report fixture bytes', hasPositiveInteger(report?.fixture?.totalBytes), 'smoke report must include fixture.totalBytes > 0'),
        check('smoke report fixture paths', fixturePathsIncludePrimary(report), 'smoke report must include smokePaths containing smokePath'),
        check('smoke report is remote', report?.mode === 'remote', 'final evidence requires a remote deployed server smoke report'),
        check('smoke endpoint is non-local', isNonLocalEndpoint(report?.endpoint), 'smoke endpoint must not be localhost or loopback'),
        check('smoke status version', hasText(report?.status?.version), 'smoke report must include status.version'),
        check('smoke report checks passed', reportChecksPassed(report), 'smoke report checks must all be ok=true with name and detail'),
        ...REQUIRED_SMOKE_CHECKS.map(name => check(`smoke ${name}`, names.has(name), `${name} check is required`)),
    ];
}

function isFinalDeployPath(value) {
    if (!hasText(value) || !path.isAbsolute(value)) {
        return false;
    }
    const normalized = path.normalize(value);
    return !normalized.endsWith('.example') && !normalized.includes(`${path.sep}deploy${path.sep}systemd${path.sep}`);
}

function isNonLocalEndpoint(endpoint) {
    try {
        const host = new URL(endpoint).hostname.toLowerCase();
        return !['127.0.0.1', '::1', 'localhost'].includes(host);
    } catch {
        return false;
    }
}

function fixturePathsIncludePrimary(report) {
    return Array.isArray(report?.smokePaths) && report.smokePaths.includes(report.smokePath);
}

function passedCheckNames(report) {
    return new Set(reportChecks(report).filter(isPassedReportCheck).map(item => item.name));
}

function reportChecksPassed(report) {
    const checks = reportChecks(report);
    return checks.length > 0 && checks.every(isPassedReportCheck);
}

function reportChecks(report) {
    return Array.isArray(report?.checks) ? report.checks : [];
}

function isPassedReportCheck(item) {
    return item?.ok === true && hasText(item.name) && hasText(item.detail);
}

function check(name, ok, detail) {
    return { detail, name, ok: Boolean(ok) };
}

function hasText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function isTimestamp(value) {
    return hasText(value) && Number.isFinite(Date.parse(value));
}

function hasPositiveInteger(value) {
    return Number.isInteger(value) && value > 0;
}
