import { decodeBase64Content } from './base64-content.js';
import { maxBodyBytes, readJsonBody } from './http-helpers.js';
import { badRequest } from './http-error.js';
import { bundleFilePath, findPlanEntry, planEntries } from './route-plan-entries.js';
import { pipeFileToResponse } from './stream-io.js';

const BINARY_TYPE = 'application/octet-stream';

export async function downloadPlanFile(context, plan, syncPath) {
    const entry = findPlanEntry(plan.downloads, syncPath, 'downloads');
    const filePath = context.storage.remoteFilePath(plan.namespace, entry.path);
    const fileStat = await context.storage.remoteFileStat(plan.namespace, entry);
    context.response.writeHead(200, {
        'Content-Length': fileStat.size,
        'Content-Type': BINARY_TYPE,
        'Last-Modified': new Date(entry.modifiedMs).toUTCString(),
        'X-TT-Sync-Modified-Ms': String(entry.modifiedMs),
    });
    await pipeFileToResponse({ filePath, response: context.response });
}

export async function uploadPlanFile(context, plan, syncPath) {
    const entry = findPlanEntry(plan.uploads, syncPath, 'uploads');
    await context.storage.stageFileStream(plan, entry, context.request, maxBodyBytes());
    return { ok: true, path: syncPath };
}

export async function buildDownloadBundle(context, plan) {
    const files = [];
    for (const entry of planEntries(plan.downloads, 'downloads')) {
        const buffer = await context.storage.readRemoteFile(plan.namespace, entry);
        files.push({ contentBase64: buffer.toString('base64'), entry, path: entry.path });
    }
    return { files };
}

export async function stageUploadBundle(context, plan) {
    const body = await readJsonBody(context.request);
    if (!Array.isArray(body.files)) {
        throw badRequest('Bundle files must be an array');
    }
    let stagedPlan = plan;
    for (const file of body.files) {
        const entry = findPlanEntry(stagedPlan.uploads, bundleFilePath(file), 'uploads');
        stagedPlan = await context.storage.stageFile(stagedPlan, entry, decodeBundleContent(file));
    }
    return stagedPlan;
}

function decodeBundleContent(file) {
    return decodeBase64Content(file?.contentBase64, 'Bundle file contentBase64');
}
