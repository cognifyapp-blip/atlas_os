/**
 * Atlas OS — Workers barrel export
 */

export { workerManager } from './WorkerManager.js';
export { BaseWorker } from './BaseWorker.js';
export type { WorkerMetrics } from './BaseWorker.js';

// Individual workers (exported for testing/inspection, not for direct instantiation)
export { IntegrationWorker } from './workers/IntegrationWorker.js';
export { SyncWorker } from './workers/SyncWorker.js';
export { SalesWorker } from './workers/SalesWorker.js';
export { FinanceWorker } from './workers/FinanceWorker.js';
export { MarketingWorker } from './workers/MarketingWorker.js';
export { OperationsWorker } from './workers/OperationsWorker.js';
export { ExecutiveWorker } from './workers/ExecutiveWorker.js';
export { WorkflowWorker } from './workers/WorkflowWorker.js';
export { NotificationWorker } from './workers/NotificationWorker.js';
export { EmailWorker } from './workers/EmailWorker.js';
export { MemoryWorker } from './workers/MemoryWorker.js';
export { ReportWorker } from './workers/ReportWorker.js';
export { AnalyticsWorker } from './workers/AnalyticsWorker.js';
