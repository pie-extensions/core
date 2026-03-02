/**
 * add-to-registry.js
 *
 * Adds a new extension entry to registry.json.
 * Called by the onboard-extension workflow after repo creation.
 *
 * Required env vars:
 *   UPSTREAM_REPO   - e.g. phpredis/phpredis
 *   EXT_NAME        - e.g. redis
 *   PHP_EXT_NAME    - e.g. redis
 */

import { addExtension } from './utils/registry.js';

const upstreamRepo = process.env.UPSTREAM_REPO;
const extName = process.env.EXT_NAME;
const phpExtName = process.env.PHP_EXT_NAME;

if (!upstreamRepo || !extName || !phpExtName) {
    console.error('UPSTREAM_REPO, EXT_NAME, PHP_EXT_NAME are required');
    process.exit(1);
}

const today = new Date().toISOString().split('T')[0];

addExtension({
    name: extName,
    'mirror-repo': `pie-extensions/${extName}`,
    'upstream-repo': upstreamRepo,
    'upstream-type': 'github',
    'packagist-name': `pie-extensions/${extName}`,
    'packagist-registered': false,
    'php-ext-name': phpExtName,
    status: 'active',
    added: today,
    notes: '',
});

console.log(`✓ Added ${extName} to registry.json`);