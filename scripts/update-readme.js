import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getActiveExtensions } from './utils/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const README_PATH = resolve(__dirname, '../README.md');

const START_MARKER = '<!-- extensions-table-start -->';
const END_MARKER = '<!-- extensions-table-end -->';

function generateTable(extensions) {
    const header = '| Extension | Upstream | Mirror | Packagist |';
    const separator = '|-----------|----------|--------|-----------|';
    const rows = extensions.map(ext => {
        const upstream = `[${ext['upstream-repo']}](https://github.com/${ext['upstream-repo']})`;
        const mirror = `[${ext['mirror-repo']}](https://github.com/${ext['mirror-repo']})`;
        const packagist = `[${ext['packagist-name']}](https://packagist.org/packages/${ext['packagist-name']})`;
        return `| ${ext.name} | ${upstream} | ${mirror} | ${packagist} |`;
    });
    return [header, separator, ...rows].join('\n');
}

const readme = readFileSync(README_PATH, 'utf-8');

const startIdx = readme.indexOf(START_MARKER);
const endIdx = readme.indexOf(END_MARKER);

if (startIdx === -1 || endIdx === -1) {
    console.error('Could not find table markers in README.md');
    process.exit(1);
}

const extensions = getActiveExtensions();
const table = generateTable(extensions);

const before = readme.slice(0, startIdx + START_MARKER.length);
const after = readme.slice(endIdx);
const updated = before + '\n' + table + '\n' + after;

if (updated === readme) {
    console.log('README already up to date');
} else {
    writeFileSync(README_PATH, updated, 'utf-8');
    console.log(`Updated README with ${extensions.length} extension(s)`);
}
