import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

let importCounter = 0;

describe('dispatch-syncs', () => {
    let originalStale;
    let logs;
    let originalLog;
    let originalError;
    let originalExit;

    beforeEach(() => {
        originalStale = process.env.STALE_EXTENSIONS;
        originalLog = console.log;
        originalError = console.error;
        originalExit = process.exit;
        logs = [];
        console.log = (...args) => logs.push(args.join(' '));
        console.error = (...args) => logs.push(args.join(' '));
    });

    afterEach(() => {
        if (originalStale !== undefined) {
            process.env.STALE_EXTENSIONS = originalStale;
        } else {
            delete process.env.STALE_EXTENSIONS;
        }
        console.log = originalLog;
        console.error = originalError;
        process.exit = originalExit;
        mock.restoreAll();
    });

    it('does nothing when STALE_EXTENSIONS is empty', async () => {
        delete process.env.STALE_EXTENSIONS;

        mock.module('../scripts/utils/github.js', {
            namedExports: {
                getOctokit: () => ({}),
                dispatchWorkflow: async () => {},
            },
        });
        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                getExtensions: () => [],
            },
        });

        const { main } = await import(`../scripts/dispatch-syncs.js?t=${importCounter++}`);
        await main();

        assert.ok(logs.some((l) => l.includes('nothing to dispatch')));
    });

    it('does nothing when STALE_EXTENSIONS is empty array', async () => {
        process.env.STALE_EXTENSIONS = '[]';

        mock.module('../scripts/utils/github.js', {
            namedExports: {
                getOctokit: () => ({}),
                dispatchWorkflow: async () => {},
            },
        });
        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                getExtensions: () => [],
            },
        });

        const { main } = await import(`../scripts/dispatch-syncs.js?t=${importCounter++}`);
        await main();

        assert.ok(logs.some((l) => l.includes('No stale extensions')));
    });

    it('dispatches workflow for stale extensions', async () => {
        process.env.STALE_EXTENSIONS = '["redis"]';
        process.env.GITHUB_TOKEN = 'test-token';
        const dispatched = [];

        mock.module('../scripts/utils/github.js', {
            namedExports: {
                getOctokit: () => ({}),
                dispatchWorkflow: async (_octokit, owner, repo, workflow) => {
                    dispatched.push({ owner, repo, workflow });
                },
            },
        });
        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                getExtensions: () => [{ name: 'redis', 'mirror-repo': 'pie-extensions/redis' }],
            },
        });

        const { main } = await import(`../scripts/dispatch-syncs.js?t=${importCounter++}`);
        await main();

        assert.equal(dispatched.length, 1);
        assert.equal(dispatched[0].owner, 'pie-extensions');
        assert.equal(dispatched[0].repo, 'redis');
        assert.equal(dispatched[0].workflow, 'sync.yml');
        assert.ok(logs.some((l) => l.includes('All dispatches successful')));
    });

    it('handles dispatch failures', async () => {
        process.env.STALE_EXTENSIONS = '["redis"]';
        process.env.GITHUB_TOKEN = 'test-token';
        let exitCode = null;
        process.exit = (code) => {
            exitCode = code;
        };

        mock.module('../scripts/utils/github.js', {
            namedExports: {
                getOctokit: () => ({}),
                dispatchWorkflow: async () => {
                    throw new Error('Dispatch failed');
                },
            },
        });
        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                getExtensions: () => [{ name: 'redis', 'mirror-repo': 'pie-extensions/redis' }],
            },
        });

        const { main } = await import(`../scripts/dispatch-syncs.js?t=${importCounter++}`);
        await main();

        assert.equal(exitCode, 1);
        assert.ok(logs.some((l) => l.includes('failed')));
    });

    it('throws when extension not found in registry', async () => {
        process.env.STALE_EXTENSIONS = '["nonexistent"]';
        process.env.GITHUB_TOKEN = 'test-token';
        let exitCode = null;
        process.exit = (code) => {
            exitCode = code;
        };

        mock.module('../scripts/utils/github.js', {
            namedExports: {
                getOctokit: () => ({}),
                dispatchWorkflow: async () => {},
            },
        });
        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                getExtensions: () => [{ name: 'redis', 'mirror-repo': 'pie-extensions/redis' }],
            },
        });

        const { main } = await import(`../scripts/dispatch-syncs.js?t=${importCounter++}`);
        await main();

        assert.equal(exitCode, 1);
    });
});
