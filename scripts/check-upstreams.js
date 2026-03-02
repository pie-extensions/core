/**
 * check-upstreams.js
 *
 * Compares the latest release tag on each upstream repo against the
 * latest tag in its mirror repo. Outputs a JSON list of extension names
 * that need syncing, and sets GitHub Actions outputs.
 *
 * Usage:
 *   node scripts/check-upstreams.js
 *   node scripts/check-upstreams.js --dry-run
 */

import { getOctokit, getLatestTag, parseRepo } from './utils/github.js';
import { getActiveExtensions } from './utils/registry.js';
import { setOutput } from './utils/actions.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
    const extensions = getActiveExtensions();

    console.log(`Checking ${extensions.length} extension(s)...\n`);

    if (extensions.length === 0) {
        console.log('0 extension(s) need sync: none');
        if (dryRun) console.log('\nDry run — not setting outputs.');
        else {
            setOutput('stale', JSON.stringify([]));
            setOutput('count', '0');
        }
        return;
    }

    const octokit = getOctokit();

    const stale = [];
    const results = [];

    await Promise.allSettled(
        extensions.map(async (ext) => {
            try {
                const upstream = parseRepo(ext['upstream-repo']);
                const mirror = parseRepo(ext['mirror-repo']);

                const [upstreamTag, mirrorTag] = await Promise.all([
                    getLatestTag(octokit, upstream.owner, upstream.repo),
                    getLatestTag(octokit, mirror.owner, mirror.repo),
                ]);

                const needsSync = upstreamTag !== null && upstreamTag !== mirrorTag;

                results.push({
                    name: ext.name,
                    upstreamTag,
                    mirrorTag,
                    needsSync,
                });

                if (needsSync) {
                    stale.push(ext.name);
                }
            } catch (err) {
                console.error(`Error checking ${ext.name}: ${err.message}`);
                results.push({ name: ext.name, error: err.message, needsSync: false });
            }
        })
    );

    // Print table
    console.log('Extension         Upstream Tag    Mirror Tag      Needs Sync');
    console.log('─'.repeat(70));
    for (const r of results) {
        if (r.error) {
            console.log(`${r.name.padEnd(18)} ERROR: ${r.error}`);
        } else {
            const flag = r.needsSync ? '⚠ YES' : '✓ no';
            console.log(
                `${r.name.padEnd(18)} ${(r.upstreamTag ?? 'none').padEnd(16)} ${(r.mirrorTag ?? 'none').padEnd(16)} ${flag}`
            );
        }
    }

    console.log(`\n${stale.length} extension(s) need sync: ${stale.join(', ') || 'none'}`);

    if (dryRun) {
        console.log('\nDry run — not setting outputs.');
        return;
    }

    setOutput('stale', JSON.stringify(stale));
    setOutput('count', String(stale.length));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});