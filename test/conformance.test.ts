import { describe, expect, it } from 'vitest';
import prettier from 'prettier';
import * as plugin from '../src/plugin';
import { backlogCases, readyCases } from './conformance-cases';

async function format(source: string, overrides: Record<string, unknown> = {}) {
  return prettier.format(source, {
    parser: 'handlebars',
    plugins: [plugin as never],
    printWidth: 80,
    ...overrides,
  });
}

describe('open-source conformance ready cases', () => {
  readyCases.forEach((testCase) => {
    it(`[${testCase.id}] ${testCase.name}`, async () => {
      const firstPass = await format(testCase.source, testCase.options);

      expect(firstPass).toBe(testCase.expected);

      const secondPass = await format(firstPass, testCase.options);
      expect(secondPass).toBe(firstPass);
    });
  });
});

describe('open-source conformance backlog', () => {
  backlogCases.forEach((testCase) => {
    it(`[${testCase.priority}] ${testCase.area}: ${testCase.name}`, async () => {
      const firstPass = await format(testCase.source, testCase.options);

      if (testCase.expected) {
        expect(firstPass).toBe(testCase.expected);
      }

      const secondPass = await format(firstPass, testCase.options);
      expect(secondPass).toBe(firstPass);

      if (testCase.id === 'triple-pass-stability') {
        const thirdPass = await format(secondPass, testCase.options);
        expect(thirdPass).toBe(secondPass);
      }
    });
  });
});
