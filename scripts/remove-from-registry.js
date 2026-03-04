/**
 * remove-from-registry.js
 *
 * Handles the registry change for offboarding an extension.
 * Can remove the entry entirely, set status to deprecated, or skip.
 *
 * Required env vars:
 *   EXT_NAME         - e.g. redis
 *   REGISTRY_ACTION  - remove | deprecate | skip
 *
 * Optional env vars:
 *   REASON           - reason for offboarding (stored in notes if deprecating)
 */

import { setOutput } from './utils/actions.js';
import { getExtension, readRegistry, removeExtension, writeRegistry } from './utils/registry.js';

export function main() {
    const extName = process.env.EXT_NAME;
    const registryAction = process.env.REGISTRY_ACTION;
    const reason = process.env.REASON || '';

    if (!extName || !registryAction) {
        throw new Error('EXT_NAME and REGISTRY_ACTION are required');
    }

    if (!['remove', 'deprecate', 'skip'].includes(registryAction)) {
        throw new Error(`Invalid REGISTRY_ACTION: ${registryAction}. Must be remove, deprecate, or skip`);
    }

    if (registryAction === 'skip') {
        console.log(`Skipping registry action for ${extName}`);
        setOutput('registry-result', 'skipped');
        return;
    }

    // Validate extension exists
    const ext = getExtension(extName);
    if (!ext) {
        throw new Error(`Extension "${extName}" not found in registry — nothing to ${registryAction}`);
    }

    if (registryAction === 'remove') {
        const removed = removeExtension(extName);
        console.log(`✓ Removed ${extName} from registry.json`);
        console.log(`  (was mirroring ${removed['upstream-repo']})`);
        setOutput('registry-result', 'removed');
    }

    if (registryAction === 'deprecate') {
        if (ext.status === 'deprecated') {
            console.log(`Extension ${extName} is already deprecated`);
            setOutput('registry-result', 'already-deprecated');
        } else {
            const registry = readRegistry();
            const entry = registry.extensions.find((e) => e.name === extName);
            entry.status = 'deprecated';
            if (reason) {
                entry.notes = reason;
            }
            writeRegistry(registry);
            console.log(`✓ Set ${extName} status to deprecated in registry.json`);
            if (reason) console.log(`  Reason: ${reason}`);
            setOutput('registry-result', 'deprecated');
        }
    }
}

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
    try {
        main();
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}
