import type { Criterion } from '../backend.js'

// Original Australian taxonomy, versioned separately from the retained IRS catalogue.
export const AU_CATALOGUE = {
  'income-statement': { what: 'Australian employment income statement from ATO online services, including Single Touch Payroll amounts and tax-ready status.', not_for: 'PAYG payment summaries, payslips or instructions.' },
  'payment-summary': { what: 'PAYG payment summary showing gross payments and withholding for a recipient.', not_for: 'STP income statements or payslips.' },
  'bank-statement': { what: 'Bank transaction or savings account statement showing balances, transactions or interest.', not_for: 'Loan statements or a letter requesting a bank statement.' },
  'loan-statement': { what: 'Loan or mortgage account statement showing principal, interest and repayments.', not_for: 'Ordinary deposit accounts, loan applications or agreements.' },
  'dividend-statement': { what: 'Company dividend payment statement or advice, including franked/unfranked amounts and franking credits.', not_for: 'Managed fund distributions, trade confirmations or performance reports.' },
  'managed-fund-statement': { what: 'Managed fund annual tax statement or AMMA statement with attributed income, distributions, capital gains or AMIT cost base amounts.', not_for: 'Company dividends or investment performance reports.' },
  'share-trade-confirmation': { what: 'Securities contract note or trade confirmation showing a purchase or sale, quantity and settlement.', not_for: 'Portfolio valuations or dividend statements.' },
  'rental-statement': { what: 'Property manager rental or owner statement showing rent collected and property expenses.', not_for: 'Lease agreements, depreciation schedules or general property advice.' },
  'depreciation-schedule': { what: 'Depreciation schedule or report listing decline in value, capital works or plant and equipment deductions.', not_for: 'Purchase invoices or instructions about depreciation.' },
  'business-activity-statement': { what: 'Australian business activity statement with GST reporting labels such as G1, 1A and 1B.', not_for: 'Instructions, tax invoices or income tax returns.' },
  'notice-of-assessment': { what: 'ATO income tax notice of assessment or amended assessment, with taxable income and an assessed payable or refund.', not_for: 'Tax returns, estimates or general ATO correspondence.' },
  'tax-return': { what: 'Australian individual, company, trust, partnership or superannuation income tax return.', not_for: 'Assessments, instructions, activity statements or foreign returns.' },
  'tax-invoice': { what: 'Tax invoice for supplied goods or services, identifying GST and an amount billed.', not_for: 'Invoice templates, instructions, quotes or payment receipts. A combined invoice and receipt is ambiguous.' },
  'receipt': { what: 'Receipt acknowledging payment, with an amount paid and payment details.', not_for: 'Unpaid invoices or receipt instructions. A combined invoice and receipt is ambiguous.' },
  'private-health-statement': { what: 'Australian private health insurance tax statement with rebate, benefit or tax claim codes and premium information.', not_for: 'Medical invoices, insurance quotes or policy renewal letters.' },
} satisfies Record<string, Criterion>

export type AuDocumentType = keyof typeof AU_CATALOGUE
export const AU_TYPES = Object.keys(AU_CATALOGUE) as AuDocumentType[]
export const AU_TAXONOMY_VERSION = 'au-1'
