// Browser-compatible cron job interfaces
// These replace node-cron types for frontend compatibility

export interface BrowserCronJob {
  stop: () => void;
  start: () => void;
}

export interface BrowserCronOptions {
  scheduled?: boolean;
  timezone?: string;
}

export interface BrowserCron {
  schedule: (
    expression: string, 
    callback: () => void, 
    options?: BrowserCronOptions
  ) => BrowserCronJob;
}

// Browser-compatible cron implementation
export const browserCron: BrowserCron = {
  schedule: (expression: string, callback: () => void, options?: BrowserCronOptions) => {
    console.log(`[BROWSER] Cron schedule requested: ${expression}`);
    // In browser, we can't run actual cron jobs
    // This would be handled by serverless functions in production
    return {
      stop: () => console.log('[BROWSER] Cron job stopped'),
      start: () => console.log('[BROWSER] Cron job started')
    };
  }
}; 