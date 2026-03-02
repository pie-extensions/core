/**
 * utils/actions.js
 * Helpers for GitHub Actions output/env file writing.
 */

import { appendFileSync } from 'fs';

/**
 * Sets a GitHub Actions step output.
 * Uses the GITHUB_OUTPUT file if available (modern Actions),
 * falls back to console.log for local dev.
 */
export function setOutput(name, value) {
    const outputFile = process.env.GITHUB_OUTPUT;
    if (outputFile) {
        // Multi-line values need heredoc syntax
        if (value.includes('\n')) {
            const delimiter = `EOF_${Date.now()}`;
            appendFileSync(outputFile, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
        } else {
            appendFileSync(outputFile, `${name}=${value}\n`);
        }
    } else {
        console.log(`[output] ${name}=${value}`);
    }
}