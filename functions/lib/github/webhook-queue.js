"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processGithubWebhookJob = processGithubWebhookJob;
/**
 * Webhook job dispatch. Phase 4 will enqueue to Cloud Tasks; today we run inline
 * after returning 202 so GitHub redelivery stays fast.
 */
async function processGithubWebhookJob(handler) {
    await handler();
}
//# sourceMappingURL=webhook-queue.js.map