import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

let importCounter = 0;

describe('remove-mirror-repo', () => {
    let originalEnv;
    let logs;
    let originalLog;
    let originalError;
    let outputs;

    beforeEach(() => {
        originalEnv = { ...process.env };
        originalLog = console.log;
        originalError = console.error;
        logs = [];
        outputs = {};
        console.log = (...args) => logs.push(args.join(' '));
        console.error = (...args) => logs.push(args.join(' '));
    });

    afterEach(() => {
        process.env = originalEnv;
        console.log = originalLog;
        console.error = originalError;
        mock.restoreAll();
    });

    function setupMocks(repoGetResult, extraActions = {}) {
        mock.module('../scripts/utils/github.js', {
            namedExports: {
                getOctokit: () => ({
                    rest: {
                        repos: {
                            get: repoGetResult,
                            update: extraActions.update || (async () => {}),
                            delete: extraActions.delete || (async () => {}),
                        },
                    },
                }),
            },
        });
        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                getExtension: (name) => {
                    if (name === 'redis') return { name: 'redis', 'mirror-repo': 'pie-extensions/redis' };
                    return null;
                },
            },
        });
        mock.module('../scripts/utils/actions.js', {
            namedExports: {
                setOutput: (name, value) => {
                    outputs[name] = value;
                },
            },
        });
    }

    it('throws when EXT_NAME is missing', async () => {
        delete process.env.EXT_NAME;
        process.env.REPO_ACTION = 'delete';

        setupMocks(async () => ({ data: {} }));

        const { main } = await import(`../scripts/remove-mirror-repo.js?t=${importCounter++}`);
        await assert.rejects(() => main(), /required/);
    });

    it('throws when REPO_ACTION is missing', async () => {
        process.env.EXT_NAME = 'redis';
        delete process.env.REPO_ACTION;

        setupMocks(async () => ({ data: {} }));

        const { main } = await import(`../scripts/remove-mirror-repo.js?t=${importCounter++}`);
        await assert.rejects(() => main(), /required/);
    });

    it('throws on invalid REPO_ACTION', async () => {
        process.env.EXT_NAME = 'redis';
        process.env.REPO_ACTION = 'invalid';

        setupMocks(async () => ({ data: {} }));

        const { main } = await import(`../scripts/remove-mirror-repo.js?t=${importCounter++}`);
        await assert.rejects(() => main(), /Invalid REPO_ACTION/);
    });

    it('handles skip action', async () => {
        process.env.EXT_NAME = 'redis';
        process.env.REPO_ACTION = 'skip';
        process.env.GITHUB_TOKEN = 'test-token';

        setupMocks(async () => ({ data: {} }));

        const { main } = await import(`../scripts/remove-mirror-repo.js?t=${importCounter++}`);
        await main();

        assert.equal(outputs['repo-result'], 'skipped');
    });

    it('handles 404 repo not found', async () => {
        process.env.EXT_NAME = 'redis';
        process.env.REPO_ACTION = 'delete';
        process.env.GITHUB_TOKEN = 'test-token';

        setupMocks(async () => {
            const err = new Error('Not Found');
            err.status = 404;
            throw err;
        });

        const { main } = await import(`../scripts/remove-mirror-repo.js?t=${importCounter++}`);
        await main();

        assert.equal(outputs['repo-result'], 'not-found');
    });

    it('archives a repo', async () => {
        process.env.EXT_NAME = 'redis';
        process.env.REPO_ACTION = 'archive';
        process.env.GITHUB_TOKEN = 'test-token';
        let updateCalled = false;

        setupMocks(async () => ({ data: { archived: false } }), {
            update: async (params) => {
                updateCalled = true;
                assert.equal(params.archived, true);
            },
        });

        const { main } = await import(`../scripts/remove-mirror-repo.js?t=${importCounter++}`);
        await main();

        assert.ok(updateCalled);
        assert.equal(outputs['repo-result'], 'archived');
    });

    it('handles already archived repo', async () => {
        process.env.EXT_NAME = 'redis';
        process.env.REPO_ACTION = 'archive';
        process.env.GITHUB_TOKEN = 'test-token';

        setupMocks(async () => ({ data: { archived: true } }));

        const { main } = await import(`../scripts/remove-mirror-repo.js?t=${importCounter++}`);
        await main();

        assert.equal(outputs['repo-result'], 'already-archived');
    });

    it('deletes a repo', async () => {
        process.env.EXT_NAME = 'redis';
        process.env.REPO_ACTION = 'delete';
        process.env.GITHUB_TOKEN = 'test-token';
        let deleteCalled = false;

        setupMocks(async () => ({ data: { archived: false } }), {
            delete: async () => {
                deleteCalled = true;
            },
        });

        const { main } = await import(`../scripts/remove-mirror-repo.js?t=${importCounter++}`);
        await main();

        assert.ok(deleteCalled);
        assert.equal(outputs['repo-result'], 'deleted');
    });

    it('falls back to extName when not in registry', async () => {
        process.env.EXT_NAME = 'unknown';
        process.env.REPO_ACTION = 'delete';
        process.env.GITHUB_TOKEN = 'test-token';
        let deleteCalledWith = null;

        mock.module('../scripts/utils/github.js', {
            namedExports: {
                getOctokit: () => ({
                    rest: {
                        repos: {
                            get: async () => ({ data: { archived: false } }),
                            delete: async (params) => {
                                deleteCalledWith = params;
                            },
                        },
                    },
                }),
            },
        });
        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                getExtension: () => null,
            },
        });
        mock.module('../scripts/utils/actions.js', {
            namedExports: {
                setOutput: (name, value) => {
                    outputs[name] = value;
                },
            },
        });

        const { main } = await import(`../scripts/remove-mirror-repo.js?t=${importCounter++}`);
        await main();

        assert.equal(deleteCalledWith.repo, 'unknown');
    });
});
