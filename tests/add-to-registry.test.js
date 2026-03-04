import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

let importCounter = 0;

describe('add-to-registry', () => {
    let tmpDir;
    let registryPath;
    let originalEnv;
    let logs;
    let originalLog;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'add-reg-test-'));
        registryPath = join(tmpDir, 'registry.json');
        writeFileSync(registryPath, JSON.stringify({ extensions: [] }, null, 2), 'utf-8');

        originalEnv = { ...process.env };
        originalLog = console.log;
        logs = [];
        console.log = (...args) => logs.push(args.join(' '));
    });

    afterEach(() => {
        process.env = originalEnv;
        console.log = originalLog;
        rmSync(tmpDir, { recursive: true, force: true });
        mock.restoreAll();
    });

    it('adds extension to registry', async () => {
        process.env.UPSTREAM_REPO = 'phpredis/phpredis';
        process.env.EXT_NAME = 'redis';
        process.env.PHP_EXT_NAME = 'redis';

        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                addExtension: (entry) => {
                    const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
                    registry.extensions.push(entry);
                    writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
                },
            },
        });

        const { main } = await import(`../scripts/add-to-registry.js?t=${importCounter++}`);
        main();

        const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
        assert.equal(registry.extensions.length, 1);
        assert.equal(registry.extensions[0].name, 'redis');
        assert.equal(registry.extensions[0]['upstream-repo'], 'phpredis/phpredis');
        assert.equal(registry.extensions[0].status, 'active');
        assert.ok(logs.some((l) => l.includes('Added redis')));
    });

    it('throws when UPSTREAM_REPO is missing', async () => {
        delete process.env.UPSTREAM_REPO;
        process.env.EXT_NAME = 'redis';
        process.env.PHP_EXT_NAME = 'redis';

        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                addExtension: () => {},
            },
        });

        const { main } = await import(`../scripts/add-to-registry.js?t=${importCounter++}`);
        assert.throws(() => main(), /required/);
    });

    it('throws when EXT_NAME is missing', async () => {
        process.env.UPSTREAM_REPO = 'phpredis/phpredis';
        delete process.env.EXT_NAME;
        process.env.PHP_EXT_NAME = 'redis';

        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                addExtension: () => {},
            },
        });

        const { main } = await import(`../scripts/add-to-registry.js?t=${importCounter++}`);
        assert.throws(() => main(), /required/);
    });

    it('throws when PHP_EXT_NAME is missing', async () => {
        process.env.UPSTREAM_REPO = 'phpredis/phpredis';
        process.env.EXT_NAME = 'redis';
        delete process.env.PHP_EXT_NAME;

        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                addExtension: () => {},
            },
        });

        const { main } = await import(`../scripts/add-to-registry.js?t=${importCounter++}`);
        assert.throws(() => main(), /required/);
    });

    it('sets correct date in added field', async () => {
        process.env.UPSTREAM_REPO = 'phpredis/phpredis';
        process.env.EXT_NAME = 'redis';
        process.env.PHP_EXT_NAME = 'redis';

        let capturedEntry = null;
        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                addExtension: (entry) => {
                    capturedEntry = entry;
                },
            },
        });

        const { main } = await import(`../scripts/add-to-registry.js?t=${importCounter++}`);
        main();

        assert.ok(capturedEntry.added);
        assert.match(capturedEntry.added, /^\d{4}-\d{2}-\d{2}$/);
    });

    it('sets all required fields', async () => {
        process.env.UPSTREAM_REPO = 'phpredis/phpredis';
        process.env.EXT_NAME = 'redis';
        process.env.PHP_EXT_NAME = 'redis';

        let capturedEntry = null;
        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                addExtension: (entry) => {
                    capturedEntry = entry;
                },
            },
        });

        const { main } = await import(`../scripts/add-to-registry.js?t=${importCounter++}`);
        main();

        assert.equal(capturedEntry.name, 'redis');
        assert.equal(capturedEntry['mirror-repo'], 'pie-extensions/redis');
        assert.equal(capturedEntry['upstream-repo'], 'phpredis/phpredis');
        assert.equal(capturedEntry['upstream-type'], 'github');
        assert.equal(capturedEntry['packagist-name'], 'pie-extensions/redis');
        assert.equal(capturedEntry['packagist-registered'], false);
        assert.equal(capturedEntry['php-ext-name'], 'redis');
        assert.equal(capturedEntry.status, 'active');
        assert.equal(capturedEntry.notes, '');
    });
});
