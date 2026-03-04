import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
    addExtension,
    getActiveExtensions,
    getExtension,
    getExtensions,
    readRegistry,
    removeExtension,
    updateExtensionStatus,
    writeRegistry,
} from '../../scripts/utils/registry.js';

function makeFixture() {
    return {
        extensions: [
            {
                name: 'redis',
                'mirror-repo': 'pie-extensions/redis',
                'upstream-repo': 'phpredis/phpredis',
                'upstream-type': 'github',
                'packagist-name': 'pie-extensions/redis',
                'packagist-registered': false,
                'php-ext-name': 'redis',
                status: 'active',
                added: '2024-01-01',
                notes: '',
            },
            {
                name: 'imagick',
                'mirror-repo': 'pie-extensions/imagick',
                'upstream-repo': 'Imagick/imagick',
                'upstream-type': 'github',
                'packagist-name': 'pie-extensions/imagick',
                'packagist-registered': true,
                'php-ext-name': 'imagick',
                status: 'deprecated',
                added: '2024-01-02',
                notes: 'no longer maintained',
            },
        ],
    };
}

describe('registry utils', () => {
    let tmpDir;
    let registryPath;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'registry-test-'));
        registryPath = join(tmpDir, 'registry.json');
        writeFileSync(registryPath, JSON.stringify(makeFixture(), null, 2), 'utf-8');
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('readRegistry', () => {
        it('reads and parses registry.json', () => {
            const registry = readRegistry(registryPath);
            assert.equal(registry.extensions.length, 2);
            assert.equal(registry.extensions[0].name, 'redis');
        });

        it('throws on missing file', () => {
            assert.throws(() => readRegistry(join(tmpDir, 'nonexistent.json')));
        });

        it('throws on invalid JSON', () => {
            writeFileSync(registryPath, 'not json', 'utf-8');
            assert.throws(() => readRegistry(registryPath));
        });
    });

    describe('writeRegistry', () => {
        it('writes registry to file with trailing newline', () => {
            const data = { extensions: [] };
            writeRegistry(data, registryPath);
            const raw = readFileSync(registryPath, 'utf-8');
            assert.ok(raw.endsWith('\n'));
            assert.deepEqual(JSON.parse(raw), data);
        });

        it('preserves formatting with 2-space indent', () => {
            const data = { extensions: [{ name: 'test' }] };
            writeRegistry(data, registryPath);
            const raw = readFileSync(registryPath, 'utf-8');
            assert.ok(raw.includes('  "extensions"'));
        });
    });

    describe('getExtensions', () => {
        it('returns all extensions', () => {
            const exts = getExtensions(registryPath);
            assert.equal(exts.length, 2);
        });
    });

    describe('getActiveExtensions', () => {
        it('returns only active extensions', () => {
            const active = getActiveExtensions(registryPath);
            assert.equal(active.length, 1);
            assert.equal(active[0].name, 'redis');
        });

        it('returns empty array when no active extensions', () => {
            const registry = readRegistry(registryPath);
            for (const ext of registry.extensions) {
                ext.status = 'deprecated';
            }
            writeRegistry(registry, registryPath);
            const active = getActiveExtensions(registryPath);
            assert.equal(active.length, 0);
        });
    });

    describe('addExtension', () => {
        it('adds a new extension', () => {
            const newExt = {
                name: 'xdebug',
                'mirror-repo': 'pie-extensions/xdebug',
                'upstream-repo': 'xdebug/xdebug',
                'upstream-type': 'github',
                'packagist-name': 'pie-extensions/xdebug',
                'packagist-registered': false,
                'php-ext-name': 'xdebug',
                status: 'active',
                added: '2024-06-01',
                notes: '',
            };
            addExtension(newExt, registryPath);
            const exts = getExtensions(registryPath);
            assert.equal(exts.length, 3);
            assert.equal(exts[2].name, 'xdebug');
        });

        it('throws on duplicate name', () => {
            assert.throws(() => addExtension({ name: 'redis' }, registryPath), /already in registry/);
        });
    });

    describe('updateExtensionStatus', () => {
        it('updates status of existing extension', () => {
            updateExtensionStatus('redis', 'stale', registryPath);
            const ext = getExtension('redis', registryPath);
            assert.equal(ext.status, 'stale');
        });

        it('throws on non-existent extension', () => {
            assert.throws(() => updateExtensionStatus('nonexistent', 'active', registryPath), /not found in registry/);
        });
    });

    describe('getExtension', () => {
        it('returns extension by name', () => {
            const ext = getExtension('redis', registryPath);
            assert.equal(ext.name, 'redis');
            assert.equal(ext['upstream-repo'], 'phpredis/phpredis');
        });

        it('returns null for non-existent extension', () => {
            const ext = getExtension('nonexistent', registryPath);
            assert.equal(ext, null);
        });
    });

    describe('removeExtension', () => {
        it('removes extension and returns it', () => {
            const removed = removeExtension('redis', registryPath);
            assert.equal(removed.name, 'redis');
            const exts = getExtensions(registryPath);
            assert.equal(exts.length, 1);
            assert.equal(exts[0].name, 'imagick');
        });

        it('throws on non-existent extension', () => {
            assert.throws(() => removeExtension('nonexistent', registryPath), /not found in registry/);
        });
    });
});
