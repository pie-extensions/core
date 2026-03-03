/**
 * create-mirror-repo.js
 *
 * Creates a new mirror repo under pie-extensions org from the extension-template,
 * then populates .pie-mirror.yml with the upstream config.
 *
 * Required env vars:
 *   GITHUB_TOKEN        - PAT with repo + workflow scope
 *   UPSTREAM_REPO       - e.g. phpredis/phpredis
 *   EXT_NAME            - e.g. redis
 *   PHP_EXT_NAME        - e.g. redis
 *
 * Optional env vars:
 *   BUILD_PATH          - build-path for php-ext in composer.json (default: "src")
 *   DOWNLOAD_URL_METHOD - "pre-packaged-binary" to enable binary builds, or "composer-default" (default)
 */

import { getOctokit } from './utils/github.js';

const ORG = 'pie-extensions';
const TEMPLATE_REPO = 'extension-template';

async function main() {
    const octokit = getOctokit();

    const upstreamRepo = process.env.UPSTREAM_REPO;
    const extName = process.env.EXT_NAME;
    const phpExtName = process.env.PHP_EXT_NAME;
    const buildPath = process.env.BUILD_PATH || 'src';
    const downloadUrlMethod = process.env.DOWNLOAD_URL_METHOD || 'composer-default';
    const enableBinaryBuild = downloadUrlMethod === 'pre-packaged-binary';

    if (!upstreamRepo || !extName || !phpExtName) {
        throw new Error('UPSTREAM_REPO, EXT_NAME, and PHP_EXT_NAME are required');
    }

    console.log(`Creating pie-extensions/${extName} from template...`);

    // Create repo from template
    await octokit.rest.repos.createUsingTemplate({
        template_owner: ORG,
        template_repo: TEMPLATE_REPO,
        owner: ORG,
        name: extName,
        description: `PIE-compatible mirror of ${upstreamRepo}`,
        private: false,
        include_all_branches: false,
    });

    console.log(`✓ Repo created: https://github.com/${ORG}/${extName}`);

    // Wait a moment for GitHub to finish setting up the repo
    await new Promise(r => setTimeout(r, 3000));

    // Get the current .pie-mirror.yml to find its SHA (needed for update)
    const { data: currentFile } = await octokit.rest.repos.getContent({
        owner: ORG,
        repo: extName,
        path: '.pie-mirror.yml',
    });

    // Build the populated .pie-mirror.yml content
    const lines = [
        `upstream:`,
        `  repo: ${upstreamRepo}`,
        `  type: github`,
        `php_ext_name: ${phpExtName}`,
        `source_dir: src/`,
    ];

    if (enableBinaryBuild) {
        lines.push(
            ``,
            `build:`,
            `  enabled: true`,
            `  os: [linux, darwin]`,
            `  arches: [x86_64, arm64]`,
            `  php-versions: ['8.2', '8.3', '8.4', '8.5']`,
            `  zts: [nts, ts]`,
            `  build-path: ${buildPath}`,
        );
    }

    lines.push('');
    const content = lines.join('\n');

    // Update the file
    await octokit.rest.repos.createOrUpdateFileContents({
        owner: ORG,
        repo: extName,
        path: '.pie-mirror.yml',
        message: `chore: configure upstream mirror for ${upstreamRepo}`,
        content: Buffer.from(content).toString('base64'),
        sha: currentFile.sha,
    });

    console.log(`✓ .pie-mirror.yml configured`);

    // Get the current composer.json to find its SHA
    const { data: composerFile } = await octokit.rest.repos.getContent({
        owner: ORG,
        repo: extName,
        path: 'composer.json',
    });

    // Parse, replace placeholders, and write back
    const composerContent = JSON.parse(
        Buffer.from(composerFile.content, 'base64').toString('utf-8')
    );
    composerContent.name = `${ORG}/${extName}`;
    composerContent.description = `PIE-compatible mirror of ${upstreamRepo}`;
    delete composerContent.extra;
    composerContent['php-ext']['extension-name'] = phpExtName;
    composerContent['php-ext']['build-path'] = buildPath;
    if (enableBinaryBuild) {
        composerContent['php-ext']['download-url-method'] = ['pre-packaged-binary', 'composer-default'];
    }
    composerContent.support = {
        source: `https://github.com/${ORG}/${extName}`,
    };

    await octokit.rest.repos.createOrUpdateFileContents({
        owner: ORG,
        repo: extName,
        path: 'composer.json',
        message: `chore: configure composer.json for ${phpExtName}`,
        content: Buffer.from(JSON.stringify(composerContent, null, 4) + '\n').toString('base64'),
        sha: composerFile.sha,
    });

    console.log(`✓ composer.json configured`);

    // Get the current README.md to find its SHA
    const { data: readmeFile } = await octokit.rest.repos.getContent({
        owner: ORG,
        repo: extName,
        path: 'README.md',
    });

    // Decode, replace placeholders, and write back
    let readmeContent = Buffer.from(readmeFile.content, 'base64').toString('utf-8');
    readmeContent = readmeContent.replaceAll('UPSTREAM_OWNER/UPSTREAM_REPO', upstreamRepo);
    readmeContent = readmeContent.replaceAll('EXTENSION_NAME', extName);

    await octokit.rest.repos.createOrUpdateFileContents({
        owner: ORG,
        repo: extName,
        path: 'README.md',
        message: `chore: configure README.md for ${extName}`,
        content: Buffer.from(readmeContent).toString('base64'),
        sha: readmeFile.sha,
    });

    console.log(`✓ README.md configured`);
    console.log(`\nNext steps:`);
    console.log(`  1. Wait for initial sync to complete`);
    console.log(`  2. Register on Packagist: https://packagist.org/packages/submit`);
    console.log(`  3. Set packagist-registered: true in registry.json`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});