import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { formatResultsTable } from '../scripts/check-upstreams.js';

let importCounter = 0;

describe('check-upstreams', () => {
    describe('formatResultsTable', () => {
        it('formats results with sync needed', () => {
            const results = [{ name: 'redis', upstreamTag: 'v6.0.0', mirrorTag: 'v5.0.0', needsSync: true }];
            const table = formatResultsTable(results);
            assert.ok(table.includes('redis'));
            assert.ok(table.includes('v6.0.0'));
            assert.ok(table.includes('v5.0.0'));
            assert.ok(table.includes('⚠ YES'));
        });

        it('formats results without sync needed', () => {
            const results = [{ name: 'redis', upstreamTag: 'v6.0.0', mirrorTag: 'v6.0.0', needsSync: false }];
            const table = formatResultsTable(results);
            assert.ok(table.includes('✓ no'));
        });

        it('formats error results', () => {
            const results = [{ name: 'broken', error: 'API failed', needsSync: false }];
            const table = formatResultsTable(results);
            assert.ok(table.includes('ERROR: API failed'));
        });

        it('handles null tags', () => {
            const results = [{ name: 'redis', upstreamTag: null, mirrorTag: null, needsSync: false }];
            const table = formatResultsTable(results);
            assert.ok(table.includes('none'));
        });

        it('includes header row', () => {
            const table = formatResultsTable([]);
            assert.ok(table.includes('Extension'));
            assert.ok(table.includes('Upstream Tag'));
            assert.ok(table.includes('Mirror Tag'));
            assert.ok(table.includes('Needs Sync'));
        });
    });

    describe('main', () => {
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

        it('handles empty extensions list with dry-run', async () => {
            process.argv = ['node', 'check-upstreams.js', '--dry-run'];

            mock.module('../scripts/utils/registry.js', {
                namedExports: {
                    getActiveExtensions: () => [],
                },
            });

            const { main } = await import(`../scripts/check-upstreams.js?t=${importCounter++}`);
            await main();

            assert.ok(logs.some((l) => l.includes('0 extension(s) need sync')));
            assert.ok(logs.some((l) => l.includes('Dry run')));
        });

        it('handles empty extensions list without dry-run', async () => {
            process.argv = ['node', 'check-upstreams.js'];
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

            const { main } = await import(`../scripts/check-upstreams.js?t=${importCounter++}`);
            await main();

            assert.equal(outputs.stale, '[]');
            assert.equal(outputs.count, '0');
        });

        it('detects stale extensions', async () => {
            process.argv = ['node', 'check-upstreams.js'];
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
                    getLatestTag: async (_octokit, owner, _repo) => {
                        if (owner === 'phpredis') return 'v6.0.0';
                        return 'v5.0.0';
                    },
                },
            });

            const { main } = await import(`../scripts/check-upstreams.js?t=${importCounter++}`);
            await main();

            const stale = JSON.parse(outputs.stale);
            assert.deepEqual(stale, ['redis']);
            assert.equal(outputs.count, '1');
        });

        it('detects no stale extensions when tags match', async () => {
            process.argv = ['node', 'check-upstreams.js'];
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
                    getLatestTag: async () => 'v6.0.0',
                },
            });

            const { main } = await import(`../scripts/check-upstreams.js?t=${importCounter++}`);
            await main();

            const stale = JSON.parse(outputs.stale);
            assert.deepEqual(stale, []);
        });

        it('handles errors checking individual extensions', async () => {
            process.argv = ['node', 'check-upstreams.js'];
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

            const { main } = await import(`../scripts/check-upstreams.js?t=${importCounter++}`);
            await main();

            const stale = JSON.parse(outputs.stale);
            assert.deepEqual(stale, []);
        });
    });
});
