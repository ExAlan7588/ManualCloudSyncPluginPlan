import { safeName } from './encoding.js';

export async function authenticate(context, namespace) {
    await context.storage.requireAuth(
        safeName(namespace, 'namespace'),
        context.request.headers.authorization,
    );
}

export async function authenticateQuery(context, url) {
    const namespace = safeName(url.searchParams.get('namespace') || 'default', 'namespace');
    await authenticate(context, namespace);
    return namespace;
}

export async function loadAuthedPlan(context, planId) {
    const plan = await context.storage.readPlan(planId);
    const namespace = safeName(plan.namespace, 'namespace');
    await authenticate(context, namespace);
    return { ...plan, namespace };
}
