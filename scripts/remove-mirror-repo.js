/**
 * remove-mirror-repo.js
 *
 * Handles the repo-level action for offboarding an extension.
 * Can delete, archive, or skip the mirror repo.
 *
 * Required env vars:
 *   GITHUB_TOKEN   - PAT with admin scope on the org
 *   EXT_NAME       - e.g. redis
 *   REPO_ACTION    - delete | archive | skip
 */

import { setOutput } from './utils/actions.js';
import { getOctokit } from './utils/github.js';
import { getExtension } from './utils/registry.js';

const ORG = 'pie-extensions';

export async function main() {
    const extName = process.env.EXT_NAME;
    const repoAction = process.env.REPO_ACTION;

    if (!extName || !repoAction) {
        throw new Error('EXT_NAME and REPO_ACTION are required');
    }

    if (!['delete', 'archive', 'skip'].includes(repoAction)) {
        throw new Error(`Invalid REPO_ACTION: ${repoAction}. Must be delete, archive, or skip`);
    }

    if (repoAction === 'skip') {
        console.log(`Skipping repo action for ${extName}`);
        setOutput('repo-result', 'skipped');
        return;
    }

    const octokit = getOctokit();

    // Look up mirror repo name from registry, fall back to convention
    const ext = getExtension(extName);
    const repoName = ext ? ext['mirror-repo'].split('/')[1] : extName;

    // Verify repo exists
    let repoData;
    try {
        const { data } = await octokit.rest.repos.get({ owner: ORG, repo: repoName });
        repoData = data;
    } catch (err) {
        if (err.status === 404) {
            console.log(`Repo ${ORG}/${repoName} does not exist — nothing to ${repoAction}`);
            setOutput('repo-result', 'not-found');
            return;
        }
        throw err;
    }

    if (repoAction === 'archive') {
        if (repoData.archived) {
            console.log(`Repo ${ORG}/${repoName} is already archived`);
            setOutput('repo-result', 'already-archived');
            return;
        }
        await octokit.rest.repos.update({ owner: ORG, repo: repoName, archived: true });
        console.log(`✓ Archived ${ORG}/${repoName}`);
        setOutput('repo-result', 'archived');
    }

    if (repoAction === 'delete') {
        await octokit.rest.repos.delete({ owner: ORG, repo: repoName });
        console.log(`✓ Deleted ${ORG}/${repoName}`);
        setOutput('repo-result', 'deleted');
    }
}

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
