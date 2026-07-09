/**
 * Atlas OS — Queue Infrastructure barrel export
 */

export { queueManager } from './QueueManager.js';
export { queueEvents } from './QueueEvents.js';
export { QueueFactory } from './QueueFactory.js';
export { WorkerFactory } from './WorkerFactory.js';
export { QueueMetrics } from './QueueMetrics.js';
export type { EnqueueOptions } from './QueueManager.js';
export type { QueueMetricSnapshot, AllQueueMetrics } from './QueueMetrics.js';
export {
  QUEUE_NAMES,
  type QueueName,
  type AtlasJobPayload,
  type BaseJobPayload,
  type IntegrationJobPayload,
  type SyncJobPayload,
  type WorkflowJobPayload,
  type SalesJobPayload,
  type FinanceJobPayload,
  type MarketingJobPayload,
  type OperationsJobPayload,
  type EmailJobPayload,
  type NotificationJobPayload,
  type MemoryJobPayload,
  type ReportJobPayload,
  type AnalyticsJobPayload,
  type AutomationJobPayload,
  type ExecutiveJobPayload,
  type JobResult,
} from './types.js';
