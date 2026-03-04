import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { buildComposerConfig, buildMirrorConfig } from '../scripts/create-mirror-repo.js';

let importCounter = 0;

describe('create-mirror-repo', () => {
    describe('buildMirrorConfig', () => {
        it('builds basic config without binary build', () => {
            const config = buildMirrorConfig('phpredis/phpredis', 'redis', '.', false);
            assert.deepEqual(config, {
                upstream: { repo: 'phpredis/phpredis', type: 'github' },
                php_ext_name: 'redis',
                source_dir: 'src/',
            });
        });

        it('builds config with binary build enabled', () => {
            const config = buildMirrorConfig('phpredis/phpredis', 'redis', 'ext', true);
            assert.deepEqual(config.upstream, { repo: 'phpredis/phpredis', type: 'github' });
            assert.equal(config.php_ext_name, 'redis');
            assert.ok(config.build);
            assert.equal(config.build.enabled, true);
            assert.deepEqual(config.build.os, ['linux', 'darwin']);
            assert.deepEqual(config.build.arches, ['x86_64', 'arm64']);
            assert.equal(config.build['build-path'], 'ext');
        });

        it('does not include build key when disabled', () => {
            const config = buildMirrorConfig('org/repo', 'ext', '.', false);
            assert.equal(config.build, undefined);
        });
    });

    describe('buildComposerConfig', () => {
        const baseComposer = {
            name: 'placeholder',
            description: 'placeholder',
            type: 'php-ext',
            extra: { some: 'data' },
            'php-ext': {
                'extension-name': 'placeholder',
                'build-path': 'placeholder',
            },
        };

        it('builds composer config without binary build', () => {
            const result = buildComposerConfig(baseComposer, 'redis', 'phpredis/phpredis', 'redis', '.', false, 'src/');
            assert.equal(result.name, 'pie-extensions/redis');
            assert.equal(result.description, 'PIE-compatible mirror of phpredis/phpredis');
            assert.equal(result.extra, undefined);
            assert.equal(result['php-ext']['extension-name'], 'redis');
            assert.equal(result['php-ext']['build-path'], 'src');
            assert.equal(result['php-ext']['download-url-method'], undefined);
            assert.deepEqual(result.support, { source: 'https://github.com/pie-extensions/redis' });
        });

        it('builds composer config with binary build', () => {
            const result = buildComposerConfig(
                baseComposer,
                'redis',
                'phpredis/phpredis',
                'redis',
                'ext',
                true,
                'src/',
            );
            assert.deepEqual(result['php-ext']['download-url-method'], ['pre-packaged-binary', 'composer-default']);
            assert.equal(result['php-ext']['build-path'], 'src/ext');
        });

        it('resolves nested build path (gRPC-like)', () => {
            const result = buildComposerConfig(baseComposer, 'grpc', 'grpc/grpc', 'grpc', 'php/ext/grpc', true, 'src/');
            assert.equal(result['php-ext']['build-path'], 'src/php/ext/grpc');
        });

        it('does not mutate original composer content', () => {
            const original = JSON.parse(JSON.stringify(baseComposer));
            buildComposerConfig(baseComposer, 'redis', 'phpredis/phpredis', 'redis', '.', false, 'src/');
            assert.equal(baseComposer.name, original.name);
            assert.deepEqual(baseComposer.extra, original.extra);
        });

        it('preserves existing type field', () => {
            const result = buildComposerConfig(baseComposer, 'redis', 'phpredis/phpredis', 'redis', '.', false, 'src/');
            assert.equal(result.type, 'php-ext');
        });
    });

    describe('main', () => {
        let originalEnv;
        let logs;
        let originalLog;

        beforeEach(() => {
            originalEnv = { ...process.env };
            originalLog = console.log;
            logs = [];
            console.log = (...args) => logs.push(args.join(' '));
        });

        afterEach(() => {
            process.env = originalEnv;
            console.log = originalLog;
            mock.restoreAll();
        });

        it('throws when required env vars are missing', async () => {
            delete process.env.UPSTREAM_REPO;
            process.env.EXT_NAME = 'redis';
            process.env.PHP_EXT_NAME = 'redis';
            process.env.GITHUB_TOKEN = 'test-token';

            mock.module('../scripts/utils/github.js', {
                namedExports: {
                    getOctokit: () => ({ rest: { repos: {} } }),
                },
            });

            const { main } = await import(`../scripts/create-mirror-repo.js?t=${importCounter++}`);
            await assert.rejects(() => main(), /required/);
        });

        it('creates repo and configures all files', async () => {
            process.env.UPSTREAM_REPO = 'phpredis/phpredis';
            process.env.EXT_NAME = 'redis';
            process.env.PHP_EXT_NAME = 'redis';
            process.env.GITHUB_TOKEN = 'test-token';

            const apiCalls = [];

            mock.module('../scripts/utils/github.js', {
                namedExports: {
                    getOctokit: () => ({
                        rest: {
                            repos: {
                                createUsingTemplate: async (params) => {
                                    apiCalls.push({ method: 'createUsingTemplate', params });
                                },
                                update: async (params) => {
                                    apiCalls.push({ method: 'update', params });
                                },
                                getContent: async (params) => {
                                    apiCalls.push({ method: 'getContent', params });
                                    if (params.path === 'composer.json') {
                                        const content = Buffer.from(
                                            JSON.stringify({
                                                name: 'placeholder',
                                                'php-ext': { 'extension-name': 'placeholder', 'build-path': 'src' },
                                            }),
                                        ).toString('base64');
                                        return { data: { sha: 'abc123', content } };
                                    }
                                    if (params.path === 'README.md') {
                                        return {
                                            data: {
                                                sha: 'def456',
                                                content: Buffer.from(
                                                    '# EXTENSION_NAME\nUpstream: UPSTREAM_OWNER/UPSTREAM_REPO',
                                                ).toString('base64'),
                                            },
                                        };
                                    }
                                    return { data: { sha: 'sha123' } };
                                },
                                createOrUpdateFileContents: async (params) => {
                                    apiCalls.push({ method: 'createOrUpdateFileContents', params });
                                },
                            },
                        },
                    }),
                },
            });

            const { main } = await import(`../scripts/create-mirror-repo.js?t=${importCounter++}`);
            await main();

            assert.ok(apiCalls.some((c) => c.method === 'createUsingTemplate'));
            assert.ok(apiCalls.some((c) => c.method === 'update'));
            // 3 createOrUpdateFileContents: .pie-mirror.json, composer.json, README.md
            const updates = apiCalls.filter((c) => c.method === 'createOrUpdateFileContents');
            assert.equal(updates.length, 3);
            assert.ok(logs.some((l) => l.includes('Repo created')));
            assert.ok(logs.some((l) => l.includes('.pie-mirror.json configured')));
            assert.ok(logs.some((l) => l.includes('composer.json configured')));
            assert.ok(logs.some((l) => l.includes('README.md configured')));
        });

        it('enables binary build when DOWNLOAD_URL_METHOD is pre-packaged-binary', async () => {
            process.env.UPSTREAM_REPO = 'phpredis/phpredis';
            process.env.EXT_NAME = 'redis';
            process.env.PHP_EXT_NAME = 'redis';
            process.env.GITHUB_TOKEN = 'test-token';
            process.env.DOWNLOAD_URL_METHOD = 'pre-packaged-binary';

            const updates = [];

            mock.module('../scripts/utils/github.js', {
                namedExports: {
                    getOctokit: () => ({
                        rest: {
                            repos: {
                                createUsingTemplate: async () => {},
                                update: async () => {},
                                getContent: async (params) => {
                                    if (params.path === 'composer.json') {
                                        const content = Buffer.from(
                                            JSON.stringify({
                                                name: 'placeholder',
                                                'php-ext': { 'extension-name': 'placeholder', 'build-path': 'src' },
                                            }),
                                        ).toString('base64');
                                        return { data: { sha: 'abc123', content } };
                                    }
                                    if (params.path === 'README.md') {
                                        return {
                                            data: {
                                                sha: 'def456',
                                                content: Buffer.from('# EXTENSION_NAME').toString('base64'),
                                            },
                                        };
                                    }
                                    return { data: { sha: 'sha123' } };
                                },
                                createOrUpdateFileContents: async (params) => {
                                    updates.push(params);
                                },
                            },
                        },
                    }),
                },
            });

            const { main } = await import(`../scripts/create-mirror-repo.js?t=${importCounter++}`);
            await main();

            // Check that .pie-mirror.json includes build config
            const mirrorUpdate = updates.find((u) => u.path === '.pie-mirror.json');
            const mirrorContent = JSON.parse(Buffer.from(mirrorUpdate.content, 'base64').toString('utf-8'));
            assert.ok(mirrorContent.build);
            assert.equal(mirrorContent.build.enabled, true);
        });
    });
});
