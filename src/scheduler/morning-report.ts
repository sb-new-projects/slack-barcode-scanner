import cron from 'node-cron';
import { App } from '@slack/bolt';
import { getOpenFollowups } from '../database/schema';
import { buildMorningReport } from '../followups/views';

export function scheduleMorningReport(app: App): void {
  const hour = process.env.MORNING_REPORT_HOUR || '8';
  const minute = process.env.MORNING_REPORT_MINUTE || '0';
  const channelId = process.env.PHARMACIEN_CHANNEL_ID;

  if (!channelId) {
    console.error('⚠️ PHARMACIEN_CHANNEL_ID non configuré - rapport matinal désactivé');
    return;
  }

  // Cron expression: minute heure * * 1-5 (lundi à vendredi)
  const cronExpression = `${minute} ${hour} * * 1-5`;

  console.log(`📅 Rapport matinal programmé: ${hour}h${minute.padStart(2, '0')} (lun-ven)`);

  cron.schedule(cronExpression, async () => {
    try {
      console.log('🌅 Envoi du rapport matinal...');

      const openFollowups = getOpenFollowups();
      const report = buildMorningReport(openFollowups);

      await app.client.chat.postMessage({
        channel: channelId,
        ...report
      });

      console.log(`✅ Rapport matinal envoyé: ${openFollowups.length} suivi(s) en cours`);
    } catch (error) {
      console.error('❌ Erreur lors de l\'envoi du rapport matinal:', error);
    }
  }, {
    timezone: 'America/Montreal'
  });
}

// Fonction pour envoyer le rapport manuellement (utile pour les tests)
export async function sendMorningReportNow(app: App): Promise<void> {
  const channelId = process.env.PHARMACIEN_CHANNEL_ID;

  if (!channelId) {
    throw new Error('PHARMACIEN_CHANNEL_ID non configuré');
  }

  const openFollowups = getOpenFollowups();
  const report = buildMorningReport(openFollowups);

  await app.client.chat.postMessage({
    channel: channelId,
    ...report
  });

  console.log(`✅ Rapport envoyé: ${openFollowups.length} suivi(s) en cours`);
}
