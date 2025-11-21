// lib/sentry.ts
import * as Sentry from '@sentry/nextjs';
import { Http, OnUncaughtException, OnUnhandledRejection } from '@sentry/integrations';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  integrations: [
    new Http({ tracing: true }),
    new OnUncaughtException(),
    new OnUnhandledRejection(),
  ],
});

export { Sentry };