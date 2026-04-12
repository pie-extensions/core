/**
 * sync-template-github.js
 *
 * Syncs the .github/ directory and root-level template files from extension-template
 * to all active mirror repos.
 * For each mirror, creates a branch and opens a PR with the updated files.
 * Skips mirrors that already have identical contents.
 *
 * Usage (local):
 *   GITHUB_TOKEN=ghp_xxx node scripts/sync-template-github.js
 */

import { getOctokit, parseRepo } from './utils/github.js';
import { getActiveExtensions } from './utils/registry.js';

const ORG = 'pie-extensions';
const TEMPLATE_REPO = 'extension-template';
const GITHUB_DIR = '.github';
const BRANCH_NAME = 'chore/sync-template-github';
const PR_TITLE = 'chore: sync template files from extension-template';
const PR_BODY = `This PR updates template-managed files to match the latest version from \`pie-extensions/extension-template\`.

This is an automated PR created by the [sync-template-github](https://github.com/pie-extensions/core/actions/workflows/sync-template-github.yml) workflow.`;

// Root-level files from the template that should be synced to all mirrors
const ROOT_FILES = ['.pie-mirror.schema.json'];

// Files that exist only in the template and should not be synced to mirrors
const EXCLUDED_FILES = [];

/**
 * Recursively fetch all files under a directory from a GitHub repo.
 * Returns an array of { path, content } where content is base64-encoded.
 */
async function fetchTemplateFiles(octokit, dirPath) {
    const { data } = await octokit.rest.repos.getContent({
        owner: ORG,
        repo: TEMPLATE_REPO,
        path: dirPath,
    });

    const files = [];

    for (const item of Array.isArray(data) ? data : [data]) {
        if (item.type === 'dir') {
            const nested = await fetchTemplateFiles(octokit, item.path);
            files.push(...nested);
        } else if (item.type === 'file') {
            const basename = item.name;
            if (EXCLUDED_FILES.includes(basename)) {
                continue;
            }

            // Fetch full file content (getContent on a directory only returns metadata)
            const { data: fileData } = await octokit.rest.repos.getContent({
                owner: ORG,
                repo: TEMPLATE_REPO,
                path: item.path,
            });

            files.push({
                path: fileData.path,
                content: fileData.content,
                encoding: fileData.encoding,
            });
        }
    }

    return files;
}

/**
 * Fetch a single file from the template repo.
 * Returns { path, content, encoding } or null if the file doesn't exist.
 */
async function fetchTemplateFile(octokit, filePath) {
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner: ORG,
            repo: TEMPLATE_REPO,
            path: filePath,
        });
        return { path: data.path, content: data.content, encoding: data.encoding };
    } catch (err) {
        if (err.status === 404) {
            return null;
        }
        throw err;
    }
}

/**
 * Sync template files to a single mirror repo.
 * Creates a branch and PR if files differ from the template.
 */
async function syncMirror(octokit, ext, templateFiles) {
    const { owner, repo } = parseRepo(ext['mirror-repo']);

    // Get the default branch ref
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    const defaultBranch = repoData.default_branch;

    const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${defaultBranch}`,
    });
    const baseSha = refData.object.sha;

    const { data: baseCommit } = await octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: baseSha,
    });
    const baseTreeSha = baseCommit.tree.sha;

    // Create blobs for each template file
    const treeItems = await Promise.all(
        templateFiles.map(async (file) => {
            const { data: blob } = await octokit.rest.git.createBlob({
                owner,
                repo,
                content: file.content,
                encoding: file.encoding,
            });

            return {
                path: file.path,
                mode: '100644',
                type: 'blob',
                sha: blob.sha,
            };
        }),
    );

    // Create a new tree with the updated files
    const { data: newTree } = await octokit.rest.git.createTree({
        owner,
        repo,
        base_tree: baseTreeSha,
        tree: treeItems,
    });

    // If the tree hasn't changed, the mirror is already up to date
    if (newTree.sha === baseTreeSha) {
        console.log(`⊘ ${ext['mirror-repo']} — already up to date`);
        return { repo: ext['mirror-repo'], status: 'up-to-date' };
    }

    // Create a commit
    const { data: newCommit } = await octokit.rest.git.createCommit({
        owner,
        repo,
        message: PR_TITLE,
        tree: newTree.sha,
        parents: [baseSha],
    });

    // Create or force-update the branch
    try {
        await octokit.rest.git.createRef({
            owner,
            repo,
            ref: `refs/heads/${BRANCH_NAME}`,
            sha: newCommit.sha,
        });
    } catch (err) {
        if (err.status === 422) {
            // Branch already exists — force update
            await octokit.rest.git.updateRef({
                owner,
                repo,
                ref: `heads/${BRANCH_NAME}`,
                sha: newCommit.sha,
                force: true,
            });
        } else {
            throw err;
        }
    }

    // Check for an existing open PR from this branch
    const { data: existingPRs } = await octokit.rest.pulls.list({
        owner,
        repo,
        head: `${owner}:${BRANCH_NAME}`,
        state: 'open',
    });

    if (existingPRs.length > 0) {
        console.log(`✓ ${ext['mirror-repo']} — updated existing PR #${existingPRs[0].number}`);
        return { repo: ext['mirror-repo'], status: 'updated', pr: existingPRs[0].number };
    }

    // Create a new PR
    const { data: pr } = await octokit.rest.pulls.create({
        owner,
        repo,
        title: PR_TITLE,
        body: PR_BODY,
        head: BRANCH_NAME,
        base: defaultBranch,
    });

    console.log(`✓ ${ext['mirror-repo']} — created PR #${pr.number}`);
    return { repo: ext['mirror-repo'], status: 'created', pr: pr.number };
}

export async function main() {
    const octokit = getOctokit();
    const extensions = getActiveExtensions();

    if (extensions.length === 0) {
        console.log('No active extensions in registry — nothing to sync.');
        return;
    }

    console.log(`Fetching template files from ${ORG}/${TEMPLATE_REPO}...\n`);
    const githubFiles = await fetchTemplateFiles(octokit, GITHUB_DIR);
    const rootFiles = (await Promise.all(ROOT_FILES.map((f) => fetchTemplateFile(octokit, f)))).filter(Boolean);
    const templateFiles = [...githubFiles, ...rootFiles];
    console.log(
        `Found ${templateFiles.length} file(s) to sync:\n${templateFiles.map((f) => `  ${f.path}`).join('\n')}\n`,
    );

    console.log(`Syncing to ${extensions.length} active mirror(s)...\n`);

    const results = await Promise.allSettled(extensions.map((ext) => syncMirror(octokit, ext, templateFiles)));

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
        console.error(`\n${failed.length} sync(s) failed:`);
        for (const [i, r] of failed.entries()) {
            console.error(`  ${extensions[i]['mirror-repo']}: ${r.reason?.message}`);
        }
        process.exit(1);
    }

    console.log('\nAll syncs completed successfully.');
}

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
