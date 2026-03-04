import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { setOutput } from '../../scripts/utils/actions.js';

describe('actions utils', () => {
    let tmpDir;
    let originalOutput;
    let originalLog;
    let logs;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'actions-test-'));
        originalOutput = process.env.GITHUB_OUTPUT;
        originalLog = console.log;
        logs = [];
        console.log = (...args) => logs.push(args.join(' '));
    });

    afterEach(() => {
        if (originalOutput !== undefined) {
            process.env.GITHUB_OUTPUT = originalOutput;
        } else {
            delete process.env.GITHUB_OUTPUT;
        }
        console.log = originalLog;
        rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('setOutput with GITHUB_OUTPUT file', () => {
        it('writes single-line value', () => {
            const outputFile = join(tmpDir, 'output');
            process.env.GITHUB_OUTPUT = outputFile;

            setOutput('name', 'value');

            const content = readFileSync(outputFile, 'utf-8');
            assert.equal(content, 'name=value\n');
        });

        it('writes multi-line value with heredoc syntax', () => {
            const outputFile = join(tmpDir, 'output');
            process.env.GITHUB_OUTPUT = outputFile;

            setOutput('body', 'line1\nline2');

            const content = readFileSync(outputFile, 'utf-8');
            assert.ok(content.startsWith('body<<EOF_'));
            assert.ok(content.includes('line1\nline2'));
        });

        it('appends multiple outputs', () => {
            const outputFile = join(tmpDir, 'output');
            process.env.GITHUB_OUTPUT = outputFile;

            setOutput('first', 'a');
            setOutput('second', 'b');

            const content = readFileSync(outputFile, 'utf-8');
            assert.ok(content.includes('first=a'));
            assert.ok(content.includes('second=b'));
        });
    });

    describe('setOutput with console fallback', () => {
        it('logs to console when GITHUB_OUTPUT is not set', () => {
            delete process.env.GITHUB_OUTPUT;

            setOutput('key', 'val');

            assert.equal(logs.length, 1);
            assert.equal(logs[0], '[output] key=val');
        });
    });
});
