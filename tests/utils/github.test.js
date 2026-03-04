import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
    dispatchWorkflow,
    getLatestReleaseTag,
    getLatestTag,
    getOctokit,
    parseRepo,
} from '../../scripts/utils/github.js';

describe('github utils', () => {
    describe('parseRepo', () => {
        it('parses owner/repo format', () => {
            const result = parseRepo('phpredis/phpredis');
            assert.deepEqual(result, { owner: 'phpredis', repo: 'phpredis' });
        });

        it('parses org/repo format', () => {
            const result = parseRepo('pie-extensions/redis');
            assert.deepEqual(result, { owner: 'pie-extensions', repo: 'redis' });
        });

        it('throws on invalid format - no slash', () => {
            assert.throws(() => parseRepo('invalid'), /Invalid repo format/);
        });

        it('throws on invalid format - empty parts', () => {
            assert.throws(() => parseRepo('/repo'), /Invalid repo format/);
            assert.throws(() => parseRepo('owner/'), /Invalid repo format/);
        });
    });

    describe('getOctokit', () => {
        let originalToken;

        beforeEach(() => {
            originalToken = process.env.GITHUB_TOKEN;
        });

        afterEach(() => {
            if (originalToken !== undefined) {
                process.env.GITHUB_TOKEN = originalToken;
            } else {
                delete process.env.GITHUB_TOKEN;
            }
        });

        it('throws when GITHUB_TOKEN is not set', () => {
            delete process.env.GITHUB_TOKEN;
            assert.throws(() => getOctokit(), /GITHUB_TOKEN/);
        });

        it('returns Octokit instance when token is set', () => {
            process.env.GITHUB_TOKEN = 'test-token';
            const octokit = getOctokit();
            assert.ok(octokit);
            assert.ok(octokit.rest);
        });
    });

    describe('getLatestReleaseTag', () => {
        it('returns tag_name from latest release', async () => {
            const octokit = {
                rest: {
                    repos: {
                        getLatestRelease: async () => ({ data: { tag_name: 'v1.0.0' } }),
                    },
                },
            };
            const tag = await getLatestReleaseTag(octokit, 'owner', 'repo');
            assert.equal(tag, 'v1.0.0');
        });

        it('returns null on 404', async () => {
            const octokit = {
                rest: {
                    repos: {
                        getLatestRelease: async () => {
                            const err = new Error('Not Found');
                            err.status = 404;
                            throw err;
                        },
                    },
                },
            };
            const tag = await getLatestReleaseTag(octokit, 'owner', 'repo');
            assert.equal(tag, null);
        });

        it('rethrows non-404 errors', async () => {
            const octokit = {
                rest: {
                    repos: {
                        getLatestRelease: async () => {
                            const err = new Error('Server Error');
                            err.status = 500;
                            throw err;
                        },
                    },
                },
            };
            await assert.rejects(() => getLatestReleaseTag(octokit, 'owner', 'repo'), /Server Error/);
        });
    });

    describe('getLatestTag', () => {
        it('returns release tag when available', async () => {
            const octokit = {
                rest: {
                    repos: {
                        getLatestRelease: async () => ({ data: { tag_name: 'v2.0.0' } }),
                    },
                },
            };
            const tag = await getLatestTag(octokit, 'owner', 'repo');
            assert.equal(tag, 'v2.0.0');
        });

        it('falls back to listing tags when no release', async () => {
            const octokit = {
                rest: {
                    repos: {
                        getLatestRelease: async () => {
                            const err = new Error('Not Found');
                            err.status = 404;
                            throw err;
                        },
                        listTags: async () => ({ data: [{ name: 'v0.9.0' }] }),
                    },
                },
            };
            const tag = await getLatestTag(octokit, 'owner', 'repo');
            assert.equal(tag, 'v0.9.0');
        });

        it('returns null when no releases and no tags', async () => {
            const octokit = {
                rest: {
                    repos: {
                        getLatestRelease: async () => {
                            const err = new Error('Not Found');
                            err.status = 404;
                            throw err;
                        },
                        listTags: async () => ({ data: [] }),
                    },
                },
            };
            const tag = await getLatestTag(octokit, 'owner', 'repo');
            assert.equal(tag, null);
        });
    });

    describe('dispatchWorkflow', () => {
        it('calls createWorkflowDispatch with correct params', async () => {
            let calledWith = null;
            const octokit = {
                rest: {
                    actions: {
                        createWorkflowDispatch: async (params) => {
                            calledWith = params;
                        },
                    },
                },
            };
            await dispatchWorkflow(octokit, 'owner', 'repo', 'sync.yml');
            assert.deepEqual(calledWith, {
                owner: 'owner',
                repo: 'repo',
                workflow_id: 'sync.yml',
                ref: 'main',
                inputs: {},
            });
        });

        it('passes custom ref and inputs', async () => {
            let calledWith = null;
            const octokit = {
                rest: {
                    actions: {
                        createWorkflowDispatch: async (params) => {
                            calledWith = params;
                        },
                    },
                },
            };
            await dispatchWorkflow(octokit, 'owner', 'repo', 'sync.yml', 'develop', { key: 'val' });
            assert.equal(calledWith.ref, 'develop');
            assert.deepEqual(calledWith.inputs, { key: 'val' });
        });
    });
});
