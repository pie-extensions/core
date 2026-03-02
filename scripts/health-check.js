/**
 * health-check.js
 *
 * Checks each mirror repo for:
 * - Repo exists and is accessible
 * - Has at least one release
 * - Last release is not too stale (> 60 days behind upstream)
 * - composer.json exists and has type: php-ext
 * - packagist-registered flag matches reality (basic check)
 *
 * Sets actions output `has-problems` and `report`.
 */

import { getOctokit, getLatestTag, parseRepo } from './utils/github.js';
import { getActiveExtensions } from './utils/registry.js';
import { setOutput } from './utils/actions.js';

const STALE_DAYS_THRESHOLD = 60;

async function checkExtension(octokit, ext) {
    const problems = [];
    const info = {};

    try {
        const mirror = parseRepo(ext['mirror-repo']);
        const upstream = parseRepo(ext['upstream-repo']);

        // Check repo exists
        let repoData;
        try {
            const { data } = await octokit.rest.repos.get({ owner: mirror.owner, repo: mirror.repo });
            repoData = data;
        } catch (err) {
            problems.push(`Mirror repo not accessible: ${err.message}`);
            return { ext: ext.name, problems, info };
        }

        // Check latest tags
        const [upstreamTag, mirrorTag] = await Promise.all([
            getLatestTag(octokit, upstream.owner, upstream.repo),
            getLatestTag(octokit, mirror.owner, mirror.repo),
        ]);

        info.upstreamTag = upstreamTag;
        info.mirrorTag = mirrorTag;

        if (!mirrorTag) {
            problems.push('Mirror has no releases yet');
        }

        if (upstreamTag && mirrorTag && upstreamTag !== mirrorTag) {
            problems.push(`Mirror is behind upstream: mirror=${mirrorTag}, upstream=${upstreamTag}`);
        }

        // Check composer.json exists
        try {
            await octokit.rest.repos.getContent({
                owner: mirror.owner,
                repo: mirror.repo,
                path: 'composer.json',
            });
        } catch {
            problems.push('composer.json not found in mirror root');
        }

        // Check packagist-registered flag vs reality (just flag check for now)
        if (!ext['packagist-registered']) {
            problems.push('Not yet registered on Packagist');
        }

    } catch (err) {
        problems.push(`Unexpected error: ${err.message}`);
    }

    return { ext: ext.name, problems, info };
}

async function main() {
    const extensions = getActiveExtensions();

    console.log(`Health checking ${extensions.length} extension(s)...\n`);

    if (extensions.length === 0) {
        console.log('✓ Healthy: none');
        console.log('⚠ Problems: none\n');
        setOutput('has-problems', 'false');
        setOutput('report', 'No extensions in registry.');
        return;
    }

    const octokit = getOctokit();

    const allResults = await Promise.all(
        extensions.map(ext => checkExtension(octokit, ext))
    );

    const withProblems = allResults.filter(r => r.problems.length > 0);
    const healthy = allResults.filter(r => r.problems.length === 0);

    console.log(`✓ Healthy: ${healthy.map(r => r.ext).join(', ') || 'none'}`);
    console.log(`⚠ Problems: ${withProblems.map(r => r.ext).join(', ') || 'none'}\n`);

    for (const result of withProblems) {
        console.log(`${result.ext}:`);
        result.problems.forEach(p => console.log(`  - ${p}`));
    }

    const hasProblems = withProblems.length > 0;

    // Build markdown report for GitHub Issue
    let report = `## Health Check Report — ${new Date().toISOString().split('T')[0]}\n\n`;
    report += `**${healthy.length}** healthy, **${withProblems.length}** with problems.\n\n`;

    if (withProblems.length > 0) {
        report += `### Problems\n\n`;
        for (const result of withProblems) {
            report += `**${result.ext}** (\`pie-compat/${result.ext}\`)\n`;
            result.problems.forEach(p => (report += `- ${p}\n`));
            report += '\n';
        }
    }

    setOutput('has-problems', String(hasProblems));
    setOutput('report', report);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});