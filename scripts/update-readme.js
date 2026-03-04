import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getActiveExtensions } from './utils/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_README_PATH = resolve(__dirname, '../README.md');

const START_MARKER = '<!-- extensions-table-start -->';
const END_MARKER = '<!-- extensions-table-end -->';

export function generateTable(extensions) {
    const header = '| Extension | Upstream | Mirror | Packagist |';
    const separator = '|-----------|----------|--------|-----------|';
    const rows = extensions.map((ext) => {
        const upstream = `[${ext['upstream-repo']}](https://github.com/${ext['upstream-repo']})`;
        const mirror = `[${ext['mirror-repo']}](https://github.com/${ext['mirror-repo']})`;
        const packagist = `[${ext['packagist-name']}](https://packagist.org/packages/${ext['packagist-name']})`;
        return `| ${ext.name} | ${upstream} | ${mirror} | ${packagist} |`;
    });
    return [header, separator, ...rows].join('\n');
}

export function replaceTableInReadme(readme, table) {
    const startIdx = readme.indexOf(START_MARKER);
    const endIdx = readme.indexOf(END_MARKER);

    if (startIdx === -1 || endIdx === -1) {
        throw new Error('Could not find table markers in README.md');
    }

    const before = readme.slice(0, startIdx + START_MARKER.length);
    const after = readme.slice(endIdx);
    return `${before}\n${table}\n${after}`;
}

export function main(readmePath = DEFAULT_README_PATH) {
    const readme = readFileSync(readmePath, 'utf-8');
    const extensions = getActiveExtensions();
    const table = generateTable(extensions);
    const updated = replaceTableInReadme(readme, table);

    if (updated === readme) {
        console.log('README already up to date');
    } else {
        writeFileSync(readmePath, updated, 'utf-8');
        console.log(`Updated README with ${extensions.length} extension(s)`);
    }
}

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
    try {
        main();
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}
