import { App, LogLevel } from '@slack/bolt';
import dotenv from 'dotenv';
import { initializeDatabase } from './database/schema';
import { registerHandlers } from './followups/handlers';
import { scheduleMorningReport, sendMorningReportNow } from './scheduler/morning-report';

// Charger les variables d'environnement
dotenv.config();

// Valider les variables requises
const requiredEnvVars = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_APP_TOKEN'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Variable d'environnement manquante: ${envVar}`);
    process.exit(1);
  }
}

// Initialiser la base de données
console.log('📦 Initialisation de la base de données...');
initializeDatabase();

// Créer l'application Slack
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: LogLevel.INFO
});

// Enregistrer les handlers de commandes et interactions
registerHandlers(app);

// Programmer le rapport matinal
scheduleMorningReport(app);

// Commande pour forcer l'envoi du rapport (admin)
app.command('/rapport', async ({ command, ack, client, logger }) => {
  await ack();

  try {
    await sendMorningReportNow(app);
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: '✅ Rapport matinal envoyé!'
    });
  } catch (error) {
    logger.error('Erreur lors de l\'envoi du rapport:', error);
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: '❌ Erreur lors de l\'envoi du rapport'
    });
  }
});

// Démarrer l'application
(async () => {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  await app.start(port);
  console.log('⚡️ Slack Bot démarré!');
  console.log(`📍 Canal pharmacien: ${process.env.PHARMACIEN_CHANNEL_ID || 'NON CONFIGURÉ'}`);
  console.log(`\n📋 Commandes disponibles:`);
  console.log('  /suivi           - Créer un nouveau suivi (menu général)');
  console.log('  /suivi liste     - Voir les suivis en cours');
  console.log('  /magistrale      - Nouveau suivi commande magistrale');
  console.log('  /rx-pickup       - Nouveau suivi Rx pickup en cours');
  console.log('  /pilulier        - Nouveau suivi changement pilulier');
  console.log('  /important       - Nouveau suivi important');
  console.log('  /rapport         - Forcer l\'envoi du rapport matinal');
})();
