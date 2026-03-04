import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { buildReport } from '../scripts/health-check.js';

let importCounter = 0;

describe('health-check', () => {
    describe('checkExtension', () => {
        afterEach(() => {
            mock.restoreAll();
        });

        it('returns no problems for healthy extension', async () => {
            const octokit = {
                rest: {
                    repos: {
                        get: async () => ({ data: {} }),
                        getContent: async () => ({ data: {} }),
                    },
                },
            };
            const ext = {
                name: 'redis',
                'mirror-repo': 'pie-extensions/redis',
                'upstream-repo': 'phpredis/phpredis',
                'packagist-registered': true,
            };

            mock.module('../scripts/utils/github.js', {
                namedExports: {
                    getOctokit: () => octokit,
                    parseRepo: (name) => {
                        const [owner, repo] = name.split('/');
                        return { owner, repo };
                    },
                    getLatestTag: async () => 'v6.0.0',
                },
            });

            const { checkExtension: check } = await import(`../scripts/health-check.js?t=${importCounter++}`);
            const result = await check(octokit, ext);
            assert.equal(result.ext, 'redis');
            assert.equal(result.problems.length, 0);
        });

        it('reports inaccessible mirror repo', async () => {
            const octokit = {
                rest: {
                    repos: {
                        get: async () => {
                            throw new Error('Not Found');
                        },
                    },
                },
            };
            const ext = {
                name: 'redis',
                'mirror-repo': 'pie-extensions/redis',
                'upstream-repo': 'phpredis/phpredis',
                'packagist-registered': true,
            };

            mock.module('../scripts/utils/github.js', {
                namedExports: {
                    getOctokit: () => octokit,
                    parseRepo: (name) => {
                        const [owner, repo] = name.split('/');
                        return { owner, repo };
                    },
                    getLatestTag: async () => 'v1.0.0',
                },
            });

            const { checkExtension: check } = await import(`../scripts/health-check.js?t=${importCounter++}`);
            const result = await check(octokit, ext);
            assert.ok(result.problems.some((p) => p.includes('not accessible')));
        });

        it('reports missing mirror tags', async () => {
            const octokit = {
                rest: {
                    repos: {
                        get: async () => ({ data: {} }),
                        getContent: async () => ({ data: {} }),
                    },
                },
            };
            const ext = {
                name: 'redis',
                'mirror-repo': 'pie-extensions/redis',
                'upstream-repo': 'phpredis/phpredis',
                'packagist-registered': true,
            };

            mock.module('../scripts/utils/github.js', {
                namedExports: {
                    getOctokit: () => octokit,
                    parseRepo: (name) => {
                        const [owner, repo] = name.split('/');
                        return { owner, repo };
                    },
                    getLatestTag: async (_octokit, owner) => {
                        if (owner === 'phpredis') return 'v6.0.0';
                        return null;
                    },
                },
            });

            const { checkExtension: check } = await import(`../scripts/health-check.js?t=${importCounter++}`);
            const result = await check(octokit, ext);
            assert.ok(result.problems.some((p) => p.includes('no releases')));
        });

        it('reports mirror behind upstream', async () => {
            const octokit = {
                rest: {
                    repos: {
                        get: async () => ({ data: {} }),
                        getContent: async () => ({ data: {} }),
                    },
                },
            };
            const ext = {
                name: 'redis',
                'mirror-repo': 'pie-extensions/redis',
                'upstream-repo': 'phpredis/phpredis',
                'packagist-registered': true,
            };

            mock.module('../scripts/utils/github.js', {
                namedExports: {
                    getOctokit: () => octokit,
                    parseRepo: (name) => {
                        const [owner, repo] = name.split('/');
                        return { owner, repo };
                    },
                    getLatestTag: async (_octokit, owner) => {
                        if (owner === 'phpredis') return 'v6.0.0';
                        return 'v5.0.0';
                    },
                },
            });

            const { checkExtension: check } = await import(`../scripts/health-check.js?t=${importCounter++}`);
            const result = await check(octokit, ext);
            assert.ok(result.problems.some((p) => p.includes('behind upstream')));
        });

        it('reports missing composer.json', async () => {
            const octokit = {
                rest: {
                    repos: {
                        get: async () => ({ data: {} }),
                        getContent: async () => {
                            throw new Error('Not Found');
                        },
                    },
                },
            };
            const ext = {
                name: 'redis',
                'mirror-repo': 'pie-extensions/redis',
                'upstream-repo': 'phpredis/phpredis',
                'packagist-registered': true,
            };

            mock.module('../scripts/utils/github.js', {
                namedExports: {
                    getOctokit: () => octokit,
                    parseRepo: (name) => {
                        const [owner, repo] = name.split('/');
                        return { owner, repo };
                    },
                    getLatestTag: async () => 'v6.0.0',
                },
            });

            const { checkExtension: check } = await import(`../scripts/health-check.js?t=${importCounter++}`);
            const result = await check(octokit, ext);
            assert.ok(result.problems.some((p) => p.includes('composer.json not found')));
        });

        it('reports not registered on packagist', async () => {
            const octokit = {
                rest: {
                    repos: {
                        get: async () => ({ data: {} }),
                        getContent: async () => ({ data: {} }),
                    },
                },
            };
            const ext = {
                name: 'redis',
                'mirror-repo': 'pie-extensions/redis',
                'upstream-repo': 'phpredis/phpredis',
                'packagist-registered': false,
            };

            mock.module('../scripts/utils/github.js', {
                namedExports: {
                    getOctokit: () => octokit,
                    parseRepo: (name) => {
                        const [owner, repo] = name.split('/');
                        return { owner, repo };
                    },
                    getLatestTag: async () => 'v6.0.0',
                },
            });

            const { checkExtension: check } = await import(`../scripts/health-check.js?t=${importCounter++}`);
            const result = await check(octokit, ext);
            assert.ok(result.problems.some((p) => p.includes('Packagist')));
        });
    });

    describe('buildReport', () => {
        it('builds report with no problems', () => {
            const healthy = [{ ext: 'redis', problems: [], info: {} }];
            const report = buildReport(healthy, []);
            assert.ok(report.includes('Health Check Report'));
            assert.ok(report.includes('**1** healthy'));
            assert.ok(report.includes('**0** with problems'));
        });

        it('builds report with problems', () => {
            const withProblems = [
                { ext: 'redis', problems: ['Mirror has no releases yet', 'Not yet registered on Packagist'], info: {} },
            ];
            const report = buildReport([], withProblems);
            assert.ok(report.includes('**redis**'));
            assert.ok(report.includes('Mirror has no releases yet'));
            assert.ok(report.includes('### Problems'));
        });
    });

    describe('main', () => {
        let logs;
        let originalLog;
        let originalError;

        beforeEach(() => {
            originalLog = console.log;
            originalError = console.error;
            logs = [];
            console.log = (...args) => logs.push(args.join(' '));
            console.error = (...args) => logs.push(args.join(' '));
        });

        afterEach(() => {
            console.log = originalLog;
            console.error = originalError;
            mock.restoreAll();
        });

        it('handles empty extensions list', async () => {
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

            const { main } = await import(`../scripts/health-check.js?t=${importCounter++}`);
            await main();

            assert.equal(outputs['has-problems'], 'false');
            assert.ok(outputs.report.includes('No extensions'));
        });

        it('runs health checks and reports results', async () => {
            process.env.GITHUB_TOKEN = 'test-token';
            const outputs = {};

            mock.module('../scripts/utils/registry.js', {
                namedExports: {
                    getActiveExtensions: () => [
                        {
                            name: 'redis',
                            'mirror-repo': 'pie-extensions/redis',
                            'upstream-repo': 'phpredis/phpredis',
                            'packagist-registered': true,
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
                    getOctokit: () => ({
                        rest: {
                            repos: {
                                get: async () => ({ data: {} }),
                                getContent: async () => ({ data: {} }),
                            },
                        },
                    }),
                    parseRepo: (name) => {
                        const [owner, repo] = name.split('/');
                        return { owner, repo };
                    },
                    getLatestTag: async () => 'v6.0.0',
                },
            });

            const { main } = await import(`../scripts/health-check.js?t=${importCounter++}`);
            await main();

            assert.equal(outputs['has-problems'], 'false');
        });
    });
});
