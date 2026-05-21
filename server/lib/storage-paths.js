import path from 'node:path';
import { encodePath, safeName } from './encoding.js';

export function createStoragePaths(rootDir) {
    const resolvedRootDir = path.resolve(rootDir);
    return Object.freeze({
        rootDir: resolvedRootDir,
        manifestPath: namespace => path.join(namespaceDir(resolvedRootDir, namespace), 'manifest.json'),
        namespaceDir: namespace => namespaceDir(resolvedRootDir, namespace),
        namespacePath: namespace => path.join(namespaceDir(resolvedRootDir, namespace), 'namespace.json'),
        planDir: planId => planDir(resolvedRootDir, planId),
        planPath: planId => path.join(planDir(resolvedRootDir, planId), 'plan.json'),
        remoteFilePath: (namespace, syncPath) => path.join(namespaceDir(resolvedRootDir, namespace), 'files', encodePath(syncPath)),
        rollbackPointPath: (namespace, rollbackId) => path.join(
            namespaceDir(resolvedRootDir, namespace),
            'rollback',
            `${safeName(rollbackId, 'rollback id')}.json`,
        ),
        stagedFilePath: (planId, syncPath) => path.join(planDir(resolvedRootDir, planId), 'staged', encodePath(syncPath)),
    });
}

function namespaceDir(rootDir, namespace) {
    return path.join(rootDir, 'namespaces', safeName(namespace, 'namespace'));
}

function planDir(rootDir, planId) {
    return path.join(rootDir, 'plans', safeName(planId, 'plan id'));
}
