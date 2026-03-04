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

import { setOutput } from './utils/actions.js';
import { getLatestTag, getOctokit, parseRepo } from './utils/github.js';
import { getActiveExtensions } from './utils/registry.js';

export function formatResultsTable(results) {
    const lines = [];
    lines.push('Extension         Upstream Tag    Mirror Tag      Needs Sync');
    lines.push('─'.repeat(70));
    for (const r of results) {
        if (r.error) {
            lines.push(`${r.name.padEnd(18)} ERROR: ${r.error}`);
        } else {
            const flag = r.needsSync ? '⚠ YES' : '✓ no';
            lines.push(
                `${r.name.padEnd(18)} ${(r.upstreamTag ?? 'none').padEnd(16)} ${(r.mirrorTag ?? 'none').padEnd(16)} ${flag}`,
            );
        }
    }
    return lines.join('\n');
}

export async function main() {
    const dryRun = process.argv.includes('--dry-run');
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
        }),
    );

    console.log(formatResultsTable(results));

    console.log(`\n${stale.length} extension(s) need sync: ${stale.join(', ') || 'none'}`);

    if (dryRun) {
        console.log('\nDry run — not setting outputs.');
        return;
    }

    setOutput('stale', JSON.stringify(stale));
    setOutput('count', String(stale.length));
}

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
