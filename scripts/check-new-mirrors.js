/**
 * check-new-mirrors.js
 *
 * Finds active extensions whose mirror repo has no tags (never synced).
 * Designed to run after registry.json is updated on main (e.g. when an
 * onboarding PR is merged) so the initial sync is dispatched automatically.
 *
 * Usage:
 *   node scripts/check-new-mirrors.js
 *   node scripts/check-new-mirrors.js --dry-run
 */

import { getOctokit, getLatestTag, parseRepo } from './utils/github.js';
import { getActiveExtensions } from './utils/registry.js';
import { setOutput } from './utils/actions.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
    const extensions = getActiveExtensions();

    console.log(`Checking ${extensions.length} active extension(s) for unsynced mirrors...\n`);

    if (extensions.length === 0) {
        console.log('No active extensions found.');
        if (dryRun) console.log('\nDry run — not setting outputs.');
        else {
            setOutput('new', JSON.stringify([]));
            setOutput('count', '0');
        }
        return;
    }

    const octokit = getOctokit();

    const newExtensions = [];
    const results = [];

    await Promise.allSettled(
        extensions.map(async (ext) => {
            try {
                const mirror = parseRepo(ext['mirror-repo']);
                const mirrorTag = await getLatestTag(octokit, mirror.owner, mirror.repo);
                const isNew = mirrorTag === null;

                results.push({ name: ext.name, mirrorTag, isNew });

                if (isNew) {
                    newExtensions.push(ext.name);
                }
            } catch (err) {
                console.error(`Error checking ${ext.name}: ${err.message}`);
                results.push({ name: ext.name, error: err.message, isNew: false });
            }
        })
    );

    // Print table
    console.log('Extension         Mirror Tag      New');
    console.log('─'.repeat(50));
    for (const r of results) {
        if (r.error) {
            console.log(`${r.name.padEnd(18)} ERROR: ${r.error}`);
        } else {
            const flag = r.isNew ? '⚠ YES' : '✓ no';
            console.log(
                `${r.name.padEnd(18)} ${(r.mirrorTag ?? 'none').padEnd(16)} ${flag}`
            );
        }
    }

    console.log(`\n${newExtensions.length} new mirror(s) need initial sync: ${newExtensions.join(', ') || 'none'}`);

    if (dryRun) {
        console.log('\nDry run — not setting outputs.');
        return;
    }

    setOutput('new', JSON.stringify(newExtensions));
    setOutput('count', String(newExtensions.length));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
