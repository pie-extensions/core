import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

let importCounter = 0;

describe('check-new-mirrors', () => {
    let originalArgv;
    let originalToken;
    let logs;
    let originalLog;
    let originalError;

    beforeEach(() => {
        originalArgv = process.argv;
        originalToken = process.env.GITHUB_TOKEN;
        originalLog = console.log;
        originalError = console.error;
        logs = [];
        console.log = (...args) => logs.push(args.join(' '));
        console.error = (...args) => logs.push(args.join(' '));
    });

    afterEach(() => {
        process.argv = originalArgv;
        if (originalToken !== undefined) {
            process.env.GITHUB_TOKEN = originalToken;
        } else {
            delete process.env.GITHUB_TOKEN;
        }
        console.log = originalLog;
        console.error = originalError;
        mock.restoreAll();
    });

    it('handles empty extensions with dry-run', async () => {
        process.argv = ['node', 'check-new-mirrors.js', '--dry-run'];

        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                getActiveExtensions: () => [],
            },
        });

        const { main } = await import(`../scripts/check-new-mirrors.js?t=${importCounter++}`);
        await main();

        assert.ok(logs.some((l) => l.includes('No active extensions found')));
        assert.ok(logs.some((l) => l.includes('Dry run')));
    });

    it('handles empty extensions without dry-run', async () => {
        process.argv = ['node', 'check-new-mirrors.js'];
        const outputs = {};

        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                getActiveExtensions: () => [],
            },
        });
        mock.module('../scripts/utils/actions.js', {
            namedExports: {
                setOutput: (name, value) => {
                    outputs[name] = value;
                },
            },
        });

        const { main } = await import(`../scripts/check-new-mirrors.js?t=${importCounter++}`);
        await main();

        assert.equal(outputs.new, '[]');
        assert.equal(outputs.count, '0');
    });

    it('detects new mirrors (no tags)', async () => {
        process.argv = ['node', 'check-new-mirrors.js'];
        process.env.GITHUB_TOKEN = 'test-token';
        const outputs = {};

        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                getActiveExtensions: () => [
                    {
                        name: 'redis',
                        'mirror-repo': 'pie-extensions/redis',
                        'upstream-repo': 'phpredis/phpredis',
                        status: 'active',
                    },
                ],
            },
        });
        mock.module('../scripts/utils/actions.js', {
            namedExports: {
                setOutput: (name, value) => {
                    outputs[name] = value;
                },
            },
        });
        mock.module('../scripts/utils/github.js', {
            namedExports: {
                getOctokit: () => ({}),
                parseRepo: (name) => {
                    const [owner, repo] = name.split('/');
                    return { owner, repo };
                },
                getLatestTag: async () => null,
            },
        });

        const { main } = await import(`../scripts/check-new-mirrors.js?t=${importCounter++}`);
        await main();

        const newExts = JSON.parse(outputs.new);
        assert.deepEqual(newExts, ['redis']);
    });

    it('skips mirrors that already have tags', async () => {
        process.argv = ['node', 'check-new-mirrors.js'];
        process.env.GITHUB_TOKEN = 'test-token';
        const outputs = {};

        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                getActiveExtensions: () => [
                    {
                        name: 'redis',
                        'mirror-repo': 'pie-extensions/redis',
                        'upstream-repo': 'phpredis/phpredis',
                        status: 'active',
                    },
                ],
            },
        });
        mock.module('../scripts/utils/actions.js', {
            namedExports: {
                setOutput: (name, value) => {
                    outputs[name] = value;
                },
            },
        });
        mock.module('../scripts/utils/github.js', {
            namedExports: {
                getOctokit: () => ({}),
                parseRepo: (name) => {
                    const [owner, repo] = name.split('/');
                    return { owner, repo };
                },
                getLatestTag: async () => 'v1.0.0',
            },
        });

        const { main } = await import(`../scripts/check-new-mirrors.js?t=${importCounter++}`);
        await main();

        const newExts = JSON.parse(outputs.new);
        assert.deepEqual(newExts, []);
    });

    it('handles errors checking individual extensions', async () => {
        process.argv = ['node', 'check-new-mirrors.js'];
        process.env.GITHUB_TOKEN = 'test-token';
        const outputs = {};

        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                getActiveExtensions: () => [
                    {
                        name: 'broken',
                        'mirror-repo': 'pie-extensions/broken',
                        'upstream-repo': 'org/broken',
                        status: 'active',
                    },
                ],
            },
        });
        mock.module('../scripts/utils/actions.js', {
            namedExports: {
                setOutput: (name, value) => {
                    outputs[name] = value;
                },
            },
        });
        mock.module('../scripts/utils/github.js', {
            namedExports: {
                getOctokit: () => ({}),
                parseRepo: (name) => {
                    const [owner, repo] = name.split('/');
                    return { owner, repo };
                },
                getLatestTag: async () => {
                    throw new Error('API error');
                },
            },
        });

        const { main } = await import(`../scripts/check-new-mirrors.js?t=${importCounter++}`);
        await main();

        const newExts = JSON.parse(outputs.new);
        assert.deepEqual(newExts, []);
    });

    it('prints dry run message with --dry-run flag', async () => {
        process.argv = ['node', 'check-new-mirrors.js', '--dry-run'];
        process.env.GITHUB_TOKEN = 'test-token';

        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                getActiveExtensions: () => [
                    {
                        name: 'redis',
                        'mirror-repo': 'pie-extensions/redis',
                        'upstream-repo': 'phpredis/phpredis',
                        status: 'active',
                    },
                ],
            },
        });
        mock.module('../scripts/utils/github.js', {
            namedExports: {
                getOctokit: () => ({}),
                parseRepo: (name) => {
                    const [owner, repo] = name.split('/');
                    return { owner, repo };
                },
                getLatestTag: async () => null,
            },
        });

        const { main } = await import(`../scripts/check-new-mirrors.js?t=${importCounter++}`);
        await main();

        assert.ok(logs.some((l) => l.includes('Dry run')));
    });
});
