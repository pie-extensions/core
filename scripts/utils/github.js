import { Octokit } from '@octokit/rest';

/**
 * Returns an authenticated Octokit instance.
 * Reads GITHUB_TOKEN from env — always provided in GH Actions,
 * or set manually for local dev.
 */
export function getOctokit() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN env var is required');
    }
    return new Octokit({ auth: token });
}

/**
 * Get the latest release tag for a GitHub repo.
 * Returns null if the repo has no releases.
 */
export async function getLatestReleaseTag(octokit, owner, repo) {
    try {
        const { data } = await octokit.rest.repos.getLatestRelease({ owner, repo });
        return data.tag_name;
    } catch (err) {
        if (err.status === 404) return null;
        throw err;
    }
}

/**
 * Get the latest tag (release or otherwise) for a GitHub repo.
 * Falls back to getLatestReleaseTag.
 */
export async function getLatestTag(octokit, owner, repo) {
    const release = await getLatestReleaseTag(octokit, owner, repo);
    if (release) return release;

    // Fall back to listing tags
    const { data: tags } = await octokit.rest.repos.listTags({
        owner,
        repo,
        per_page: 1,
    });
    return tags.length > 0 ? tags[0].name : null;
}

/**
 * Trigger a workflow_dispatch event on a repo.
 */
export async function dispatchWorkflow(octokit, owner, repo, workflowId, ref = 'main', inputs = {}) {
    await octokit.rest.actions.createWorkflowDispatch({
        owner,
        repo,
        workflow_id: workflowId,
        ref,
        inputs,
    });
}

/**
 * Parse "owner/repo" string into { owner, repo }.
 */
export function parseRepo(fullName) {
    const [owner, repo] = fullName.split('/');
    if (!owner || !repo) throw new Error(`Invalid repo format: ${fullName}`);
    return { owner, repo };
}
