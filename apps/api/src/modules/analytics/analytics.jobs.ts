export const ROLLUP_DAILY_JOB = 'rollup-daily';
/** Cron in Pakistan time: shortly after midnight, so "yesterday" is complete. */
export const ROLLUP_DAILY_CRON = '10 0 * * *';

export interface RollupDailyJob {
  /** Days (YYYY-MM-DD, Pakistan time) to recompute. Missing = yesterday. */
  days?: string[];
}
