import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

let importCounter = 0;

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
        ],
    };
}

describe('remove-from-registry', () => {
    let tmpDir;
    let registryPath;
    let originalEnv;
    let logs;
    let originalLog;
    let originalError;
    let outputs;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'rm-reg-test-'));
        registryPath = join(tmpDir, 'registry.json');
        writeFileSync(registryPath, JSON.stringify(makeFixture(), null, 2), 'utf-8');

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
        rmSync(tmpDir, { recursive: true, force: true });
        mock.restoreAll();
    });

    function mockRegistryAndActions() {
        const fixture = makeFixture();
        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                getExtension: (name) => fixture.extensions.find((e) => e.name === name) || null,
                removeExtension: (name) => {
                    const idx = fixture.extensions.findIndex((e) => e.name === name);
                    if (idx === -1) throw new Error(`Extension ${name} not found`);
                    return fixture.extensions.splice(idx, 1)[0];
                },
                readRegistry: () => JSON.parse(JSON.stringify(fixture)),
                writeRegistry: (reg) => {
                    fixture.extensions = reg.extensions;
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
        process.env.REGISTRY_ACTION = 'remove';

        mockRegistryAndActions();

        const { main } = await import(`../scripts/remove-from-registry.js?t=${importCounter++}`);
        assert.throws(() => main(), /required/);
    });

    it('throws when REGISTRY_ACTION is missing', async () => {
        process.env.EXT_NAME = 'redis';
        delete process.env.REGISTRY_ACTION;

        mockRegistryAndActions();

        const { main } = await import(`../scripts/remove-from-registry.js?t=${importCounter++}`);
        assert.throws(() => main(), /required/);
    });

    it('throws on invalid REGISTRY_ACTION', async () => {
        process.env.EXT_NAME = 'redis';
        process.env.REGISTRY_ACTION = 'invalid';

        mockRegistryAndActions();

        const { main } = await import(`../scripts/remove-from-registry.js?t=${importCounter++}`);
        assert.throws(() => main(), /Invalid REGISTRY_ACTION/);
    });

    it('handles skip action', async () => {
        process.env.EXT_NAME = 'redis';
        process.env.REGISTRY_ACTION = 'skip';

        mockRegistryAndActions();

        const { main } = await import(`../scripts/remove-from-registry.js?t=${importCounter++}`);
        main();

        assert.equal(outputs['registry-result'], 'skipped');
        assert.ok(logs.some((l) => l.includes('Skipping')));
    });

    it('removes extension from registry', async () => {
        process.env.EXT_NAME = 'redis';
        process.env.REGISTRY_ACTION = 'remove';

        mockRegistryAndActions();

        const { main } = await import(`../scripts/remove-from-registry.js?t=${importCounter++}`);
        main();

        assert.equal(outputs['registry-result'], 'removed');
        assert.ok(logs.some((l) => l.includes('Removed redis')));
    });

    it('throws when removing non-existent extension', async () => {
        process.env.EXT_NAME = 'nonexistent';
        process.env.REGISTRY_ACTION = 'remove';

        mockRegistryAndActions();

        const { main } = await import(`../scripts/remove-from-registry.js?t=${importCounter++}`);
        assert.throws(() => main(), /not found in registry/);
    });

    it('deprecates extension', async () => {
        process.env.EXT_NAME = 'redis';
        process.env.REGISTRY_ACTION = 'deprecate';
        process.env.REASON = 'no longer maintained';

        mockRegistryAndActions();

        const { main } = await import(`../scripts/remove-from-registry.js?t=${importCounter++}`);
        main();

        assert.equal(outputs['registry-result'], 'deprecated');
        assert.ok(logs.some((l) => l.includes('deprecated')));
    });

    it('reports already deprecated extension', async () => {
        process.env.EXT_NAME = 'redis';
        process.env.REGISTRY_ACTION = 'deprecate';

        const fixture = makeFixture();
        fixture.extensions[0].status = 'deprecated';
        mock.module('../scripts/utils/registry.js', {
            namedExports: {
                getExtension: (name) => fixture.extensions.find((e) => e.name === name) || null,
                removeExtension: () => {},
                readRegistry: () => JSON.parse(JSON.stringify(fixture)),
                writeRegistry: () => {},
            },
        });
        mock.module('../scripts/utils/actions.js', {
            namedExports: {
                setOutput: (name, value) => {
                    outputs[name] = value;
                },
            },
        });

        const { main } = await import(`../scripts/remove-from-registry.js?t=${importCounter++}`);
        main();

        assert.equal(outputs['registry-result'], 'already-deprecated');
    });
});
