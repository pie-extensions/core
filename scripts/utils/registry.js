import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = resolve(__dirname, '../../registry.json');

export function readRegistry() {
    const raw = readFileSync(REGISTRY_PATH, 'utf-8');
    return JSON.parse(raw);
}

export function writeRegistry(registry) {
    writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
}

export function getExtensions() {
    return readRegistry().extensions;
}

export function getActiveExtensions() {
    return getExtensions().filter(e => e.status === 'active');
}

export function addExtension(entry) {
    const registry = readRegistry();
    const exists = registry.extensions.find(e => e.name === entry.name);
    if (exists) throw new Error(`Extension ${entry.name} already in registry`);
    registry.extensions.push(entry);
    writeRegistry(registry);
}

export function updateExtensionStatus(name, status) {
    const registry = readRegistry();
    const ext = registry.extensions.find(e => e.name === name);
    if (!ext) throw new Error(`Extension ${name} not found in registry`);
    ext.status = status;
    writeRegistry(registry);
}

export function getExtension(name) {
    const registry = readRegistry();
    return registry.extensions.find(e => e.name === name) || null;
}

export function removeExtension(name) {
    const registry = readRegistry();
    const index = registry.extensions.findIndex(e => e.name === name);
    if (index === -1) throw new Error(`Extension ${name} not found in registry`);
    const removed = registry.extensions.splice(index, 1)[0];
    writeRegistry(registry);
    return removed;
}