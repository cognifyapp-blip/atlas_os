/**
 * Atlas OS — AI Executive Index
 *
 * All 10 AI executives, fully specified and implemented.
 *
 * Personas:
 *   Atlas   — CEO Assistant (Chief of Staff)
 *   Aurelia — Finance AI (CFO)
 *   Zephyr  — Sales AI (VP Sales)
 *   Aria    — Marketing AI (CMO)
 *   Lyra    — Customer Success AI (CCO)
 *   Sage    — HR AI (CPO)
 *   Orion   — Operations AI (COO)
 *   Lexis   — Legal AI (General Counsel)
 *   Forge   — Developer AI (CTO)
 *   Iris    — Intelligence AI (CDO)
 */

export { ExecutiveService, registerSSEBroadcaster } from './ExecutiveService.js';
export { CEOAssistant } from './CEOAssistant.js';
export { FinanceAI } from './FinanceAI.js';
export { SalesAI } from './SalesAI.js';
export { MarketingAI } from './MarketingAI.js';
export { CustomerSuccessAI } from './CustomerSuccessAI.js';
export { HRAI } from './HRAI.js';
export { OperationsAI } from './OperationsAI.js';
export { LegalAI } from './LegalAI.js';
export { DeveloperAI } from './DeveloperAI.js';
export { IntelligenceAI } from './IntelligenceAI.js';

/**
 * Executive name → class lookup map.
 * Used by the Executive Router to instantiate the right class.
 */
export const EXECUTIVE_PERSONAS: Record<string, string> = {
  'CEO Assistant (Atlas)': 'CEOAssistant',
  'Finance AI (Aurelia)': 'FinanceAI',
  'Sales AI (Zephyr)': 'SalesAI',
  'Marketing AI (Aria)': 'MarketingAI',
  'Customer Success AI (Lyra)': 'CustomerSuccessAI',
  'HR AI (Sage)': 'HRAI',
  'Operations AI (Orion)': 'OperationsAI',
  'Legal AI (Lexis)': 'LegalAI',
  'Developer AI (Forge)': 'DeveloperAI',
  'Intelligence AI (Iris)': 'IntelligenceAI',
};
