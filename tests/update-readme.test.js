import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { generateTable, replaceTableInReadme } from '../scripts/update-readme.js';

let importCounter = 0;

describe('update-readme', () => {
    describe('generateTable', () => {
        it('generates markdown table with extensions', () => {
            const extensions = [
                {
                    name: 'redis',
                    'upstream-repo': 'phpredis/phpredis',
                    'mirror-repo': 'pie-extensions/redis',
                    'packagist-name': 'pie-extensions/redis',
                },
            ];
            const table = generateTable(extensions);
            assert.ok(table.includes('| Extension | Upstream | Mirror | Packagist |'));
            assert.ok(table.includes('|-----------|----------|--------|-----------|'));
            assert.ok(table.includes('| redis |'));
            assert.ok(table.includes('[phpredis/phpredis]'));
            assert.ok(table.includes('https://github.com/phpredis/phpredis'));
            assert.ok(table.includes('[pie-extensions/redis]'));
            assert.ok(table.includes('https://packagist.org/packages/pie-extensions/redis'));
        });

        it('generates table with multiple extensions', () => {
            const extensions = [
                {
                    name: 'redis',
                    'upstream-repo': 'phpredis/phpredis',
                    'mirror-repo': 'pie-extensions/redis',
                    'packagist-name': 'pie-extensions/redis',
                },
                {
                    name: 'imagick',
                    'upstream-repo': 'Imagick/imagick',
                    'mirror-repo': 'pie-extensions/imagick',
                    'packagist-name': 'pie-extensions/imagick',
                },
            ];
            const table = generateTable(extensions);
            const lines = table.split('\n');
            assert.equal(lines.length, 4); // header + separator + 2 rows
        });

        it('generates table with no extensions', () => {
            const table = generateTable([]);
            const lines = table.split('\n');
            assert.equal(lines.length, 2); // header + separator only
        });
    });

    describe('replaceTableInReadme', () => {
        it('replaces table between markers', () => {
            const readme = 'before\n<!-- extensions-table-start -->\nold table\n<!-- extensions-table-end -->\nafter';
            const result = replaceTableInReadme(readme, 'new table');
            assert.ok(result.includes('new table'));
            assert.ok(!result.includes('old table'));
            assert.ok(result.includes('before'));
            assert.ok(result.includes('after'));
        });

        it('preserves content before start marker', () => {
            const readme =
                '# Title\n\nSome content\n<!-- extensions-table-start -->\nold\n<!-- extensions-table-end -->\nfooter';
            const result = replaceTableInReadme(readme, 'new');
            assert.ok(result.startsWith('# Title\n\nSome content\n<!-- extensions-table-start -->'));
        });

        it('preserves content after end marker', () => {
            const readme = '<!-- extensions-table-start -->\nold\n<!-- extensions-table-end -->\n## Footer';
            const result = replaceTableInReadme(readme, 'new');
            assert.ok(result.includes('## Footer'));
        });

        it('throws when start marker is missing', () => {
            const readme = 'no markers here\n<!-- extensions-table-end -->';
            assert.throws(() => replaceTableInReadme(readme, 'table'), /Could not find table markers/);
        });

        it('throws when end marker is missing', () => {
            const readme = '<!-- extensions-table-start -->\nno end marker';
            assert.throws(() => replaceTableInReadme(readme, 'table'), /Could not find table markers/);
        });

        it('throws when both markers are missing', () => {
            const readme = 'no markers at all';
            assert.throws(() => replaceTableInReadme(readme, 'table'), /Could not find table markers/);
        });
    });

    describe('main', () => {
        let tmpDir;
        let readmePath;
        let logs;
        let originalLog;

        beforeEach(() => {
            tmpDir = mkdtempSync(join(tmpdir(), 'readme-test-'));
            readmePath = join(tmpDir, 'README.md');
            originalLog = console.log;
            logs = [];
            console.log = (...args) => logs.push(args.join(' '));
        });

        afterEach(() => {
            console.log = originalLog;
            rmSync(tmpDir, { recursive: true, force: true });
            mock.restoreAll();
        });

        it('updates README with extension table', async () => {
            const readme = '# Title\n<!-- extensions-table-start -->\nold\n<!-- extensions-table-end -->\n## Footer';
            writeFileSync(readmePath, readme, 'utf-8');

            mock.module('../scripts/utils/registry.js', {
                namedExports: {
                    getActiveExtensions: () => [
                        {
                            name: 'redis',
                            'upstream-repo': 'phpredis/phpredis',
                            'mirror-repo': 'pie-extensions/redis',
                            'packagist-name': 'pie-extensions/redis',
                            status: 'active',
                        },
                    ],
                },
            });

            const { main } = await import(`../scripts/update-readme.js?t=${importCounter++}`);
            main(readmePath);

            const updated = readFileSync(readmePath, 'utf-8');
            assert.ok(updated.includes('| redis |'));
            assert.ok(updated.includes('# Title'));
            assert.ok(updated.includes('## Footer'));
            assert.ok(!updated.includes('old'));
            assert.ok(logs.some((l) => l.includes('Updated README')));
        });

        it('reports no change when already up to date', async () => {
            mock.module('../scripts/utils/registry.js', {
                namedExports: {
                    getActiveExtensions: () => [],
                },
            });

            const { main, generateTable: genTable } = await import(`../scripts/update-readme.js?t=${importCounter++}`);
            const table = genTable([]);
            const readme = `# Title\n<!-- extensions-table-start -->\n${table}\n<!-- extensions-table-end -->\n## Footer`;
            writeFileSync(readmePath, readme, 'utf-8');

            main(readmePath);

            assert.ok(logs.some((l) => l.includes('already up to date')));
        });

        it('throws when markers are missing', async () => {
            writeFileSync(readmePath, '# No markers', 'utf-8');

            mock.module('../scripts/utils/registry.js', {
                namedExports: {
                    getActiveExtensions: () => [],
                },
            });

            const { main } = await import(`../scripts/update-readme.js?t=${importCounter++}`);
            assert.throws(() => main(readmePath), /Could not find table markers/);
        });
    });
});
