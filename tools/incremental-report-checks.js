import path from 'node:path';
import {
    REQUIRED_DEPLOY_CHECKS,
    REQUIRED_SMOKE_CHECKS,
} from './incremental-evidence-schema.js';

const PLACEHOLDER_HOSTS = new Set(['example.com', 'example.net', 'example.org']);
const RESERVED_HOST_SUFFIXES = new Set(['invalid', 'local', 'localhost', 'test']);

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
        check('deploy report public URL is not placeholder', isNonPlaceholderUrl(report?.publicUrl), 'deploy publicUrl must not use placeholder or reserved domains'),
        check('deploy report public URL is clean', isCleanEvidenceUrl(report?.publicUrl), 'deploy publicUrl must not include credentials, query, or fragment'),
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
        check('smoke endpoint is not placeholder', isNonPlaceholderUrl(report?.endpoint), 'smoke endpoint must not use placeholder or reserved domains'),
        check('smoke endpoint is clean', isCleanEvidenceUrl(report?.endpoint), 'smoke endpoint must not include credentials, query, or fragment'),
        check('smoke status version', hasText(report?.status?.version), 'smoke report must include status.version'),
        check('smoke report checks passed', reportChecksPassed(report), 'smoke report checks must all be ok=true with name and detail'),
        ...REQUIRED_SMOKE_CHECKS.map(name => check(`smoke ${name}`, names.has(name), `${name} check is required`)),
    ];
}

export function isNonPlaceholderUrl(value) {
    const parsed = parseHttpUrl(value);
    if (!parsed) {
        return false;
    }
    const host = parsed.hostname.toLowerCase();
    return !matchesHostSet(host, PLACEHOLDER_HOSTS) && !matchesHostSet(host, RESERVED_HOST_SUFFIXES);
}

export function isCleanEvidenceUrl(value) {
    const parsed = parseHttpUrl(value);
    return Boolean(parsed && !parsed.username && !parsed.password && !parsed.search && !parsed.hash);
}

function matchesHostSet(host, suffixes) {
    for (const suffix of suffixes) {
        if (host === suffix || host.endsWith(`.${suffix}`)) {
            return true;
        }
    }
    return false;
}

function isFinalDeployPath(value) {
    if (!hasText(value) || !path.isAbsolute(value)) {
        return false;
    }
    const normalized = path.normalize(value);
    return !normalized.endsWith('.example') && !normalized.includes(`${path.sep}deploy${path.sep}systemd${path.sep}`);
}

function isNonLocalEndpoint(endpoint) {
    const parsed = parseHttpUrl(endpoint);
    return Boolean(parsed && !['127.0.0.1', '::1', 'localhost'].includes(parsed.hostname.toLowerCase()));
}

function parseHttpUrl(value) {
    try {
        const parsed = new URL(value);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed : null;
    } catch {
        return null;
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
