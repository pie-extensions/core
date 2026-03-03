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

import { getExtension, removeExtension, readRegistry, writeRegistry } from './utils/registry.js';
import { setOutput } from './utils/actions.js';

const extName = process.env.EXT_NAME;
const registryAction = process.env.REGISTRY_ACTION;
const reason = process.env.REASON || '';

if (!extName || !registryAction) {
    console.error('EXT_NAME and REGISTRY_ACTION are required');
    process.exit(1);
}

if (!['remove', 'deprecate', 'skip'].includes(registryAction)) {
    console.error(`Invalid REGISTRY_ACTION: ${registryAction}. Must be remove, deprecate, or skip`);
    process.exit(1);
}

if (registryAction === 'skip') {
    console.log(`Skipping registry action for ${extName}`);
    setOutput('registry-result', 'skipped');
    process.exit(0);
}

// Validate extension exists
const ext = getExtension(extName);
if (!ext) {
    console.error(`Extension "${extName}" not found in registry — nothing to ${registryAction}`);
    process.exit(1);
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
        const entry = registry.extensions.find(e => e.name === extName);
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
