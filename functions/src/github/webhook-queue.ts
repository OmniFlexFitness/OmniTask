/**
 * Webhook job dispatch. Phase 4 will enqueue to Cloud Tasks; today we run inline
 * after returning 202 so GitHub redelivery stays fast.
 */
export async function processGithubWebhookJob(handler: () => Promise<void>): Promise<void> {
  await handler();
}
