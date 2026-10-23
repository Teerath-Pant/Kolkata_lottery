import cron from 'node-cron';
import { createApp } from './app';
import { config } from './config';
import { runDueDraws } from './services/drawJob';
import { purgeExpiredOtps } from './services/otp';
import { purgeExpiredSessions } from './services/sessions';
import { purgeExpiredIdempotencyKeys } from './services/buy';

const app = createApp();
app.listen(config.PORT, () => console.log(`
  ➜  SERVER (API): http://localhost:${config.PORT}/api/v1/health
`));

if (config.RUN_CRON === 'true') {
  const tick = () => runDueDraws().then((r) => r.length && console.log('[draw-job]', JSON.stringify(r)))
    .catch((e) => console.error('[draw-job] failed', e));
  cron.schedule('* * * * *', tick);
  cron.schedule('17 * * * *', () => Promise.all([purgeExpiredSessions(), purgeExpiredOtps(), purgeExpiredIdempotencyKeys()])
    .catch((e) => console.error('[housekeeping] purge failed', e)));
  tick(); // catch up immediately after a restart
}
