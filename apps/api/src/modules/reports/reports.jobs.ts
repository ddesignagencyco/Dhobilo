export const GENERATE_REPORT_JOB = 'generate-report';
export const PURGE_REPORTS_JOB = 'purge-reports';
/** Hourly: removes the files of reports past their expiry. */
export const PURGE_REPORTS_EVERY_MS = 60 * 60 * 1000;

export interface GenerateReportJob {
  reportId: string;
}
