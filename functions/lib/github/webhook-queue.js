"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processGithubWebhookJob = void 0;
/**
 * Webhook job dispatch. Phase 4 will enqueue to Cloud Tasks; today we run inline
 * after returning 202 so GitHub redelivery stays fast.
 */
async function processGithubWebhookJob(handler) {
    await handler();
}
exports.processGithubWebhookJob = processGithubWebhookJob;
//# sourceMappingURL=webhook-queue.js.map