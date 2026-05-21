import { safeName } from './encoding.js';

export function createPlanLockStore() {
    const locks = new Map();
    return Object.freeze({
        run: (planId, operation) => runLocked(locks, planId, operation),
    });
}

async function runLocked(locks, planId, operation) {
    const key = safeName(planId, 'plan id');
    const previous = locks.get(key) || Promise.resolve();
    let release;
    const next = new Promise(resolve => {
        release = resolve;
    });
    const chained = previous.catch(() => {}).then(() => next);
    locks.set(key, chained);
    await previous.catch(() => {});
    try {
        return await operation();
    } finally {
        release();
        if (locks.get(key) === chained) {
            locks.delete(key);
        }
    }
}
