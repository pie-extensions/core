import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REGISTRY_PATH = resolve(__dirname, '../../registry.json');

export function readRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
    const raw = readFileSync(registryPath, 'utf-8');
    return JSON.parse(raw);
}

export function writeRegistry(registry, registryPath = DEFAULT_REGISTRY_PATH) {
    writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf-8');
}

export function getExtensions(registryPath = DEFAULT_REGISTRY_PATH) {
    return readRegistry(registryPath).extensions;
}

export function getActiveExtensions(registryPath = DEFAULT_REGISTRY_PATH) {
    return getExtensions(registryPath).filter((e) => e.status === 'active');
}

export function addExtension(entry, registryPath = DEFAULT_REGISTRY_PATH) {
    const registry = readRegistry(registryPath);
    const exists = registry.extensions.find((e) => e.name === entry.name);
    if (exists) throw new Error(`Extension ${entry.name} already in registry`);
    registry.extensions.push(entry);
    writeRegistry(registry, registryPath);
}

export function updateExtensionStatus(name, status, registryPath = DEFAULT_REGISTRY_PATH) {
    const registry = readRegistry(registryPath);
    const ext = registry.extensions.find((e) => e.name === name);
    if (!ext) throw new Error(`Extension ${name} not found in registry`);
    ext.status = status;
    writeRegistry(registry, registryPath);
}

export function getExtension(name, registryPath = DEFAULT_REGISTRY_PATH) {
    const registry = readRegistry(registryPath);
    return registry.extensions.find((e) => e.name === name) || null;
}

export function removeExtension(name, registryPath = DEFAULT_REGISTRY_PATH) {
    const registry = readRegistry(registryPath);
    const index = registry.extensions.findIndex((e) => e.name === name);
    if (index === -1) throw new Error(`Extension ${name} not found in registry`);
    const removed = registry.extensions.splice(index, 1)[0];
    writeRegistry(registry, registryPath);
    return removed;
}
