/**
 * dispatch-syncs.js
 *
 * Fires workflow_dispatch on each stale mirror repo's sync.yml workflow.
 * Reads the list of stale extension names from STALE_EXTENSIONS env var
 * (JSON array string, as output by check-upstreams.js).
 *
 * Usage (local):
 *   STALE_EXTENSIONS='["redis","imagick"]' node scripts/dispatch-syncs.js
 */

import { dispatchWorkflow, getOctokit } from './utils/github.js';
import { getExtensions } from './utils/registry.js';

export async function main() {
    const raw = process.env.STALE_EXTENSIONS;
    if (!raw) {
        console.log('STALE_EXTENSIONS is empty — nothing to dispatch.');
        return;
    }

    const staleNames = JSON.parse(raw);
    if (staleNames.length === 0) {
        console.log('No stale extensions — nothing to dispatch.');
        return;
    }

    const octokit = getOctokit();
    const allExtensions = getExtensions();
    const extMap = Object.fromEntries(allExtensions.map((e) => [e.name, e]));

    console.log(`Dispatching sync for: ${staleNames.join(', ')}\n`);

    const results = await Promise.allSettled(
        staleNames.map(async (name) => {
            const ext = extMap[name];
            if (!ext) throw new Error(`Extension "${name}" not found in registry`);

            const [mirrorOwner, mirrorRepo] = ext['mirror-repo'].split('/');

            await dispatchWorkflow(octokit, mirrorOwner, mirrorRepo, 'sync.yml');
            console.log(`✓ Dispatched sync for ${ext['mirror-repo']}`);
        }),
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
        console.error(`\n${failed.length} dispatch(es) failed:`);
        for (const [i, r] of failed.entries()) {
            console.error(`  ${staleNames[i]}: ${r.reason?.message}`);
        }
        process.exit(1);
    }

    console.log('\nAll dispatches successful.');
}

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
