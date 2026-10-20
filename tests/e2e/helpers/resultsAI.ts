import type { Page } from '@playwright/test';

/** Replaces the AI module in the browser: a result screenshot marks three wrong and two skipped questions. */
export async function mockResultsAI(page: Page) {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true, resultImages: true }; }
      export async function getAIUsage() { return null; }
      export async function extractMistakeWithAI() { throw new Error('not used'); }
      export async function extractPageWithAI() { throw new Error('not used'); }
      export async function readResultsWithAI(images) {
        window.__resultImages = images.length;
        return { wrong: [107, 113, 115], skipped: [117, 128], usage: {} };
      }`
  }));
}
