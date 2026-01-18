import { App, SlackViewMiddlewareArgs, AllMiddlewareArgs, SlackCommandMiddlewareArgs, BlockAction, SlackActionMiddlewareArgs } from '@slack/bolt';
import {
  createFollowup,
  getFollowup,
  updateFollowup,
  closeFollowup,
  getOpenFollowups
} from '../database/schema';
import { FollowupType, getFollowupConfig, getAllFollowupTypes } from './types';
import {
  buildNewFollowupModal,
  buildFollowupDetailsModal,
  buildFollowupMessage,
  buildUpdateStatusModal,
  buildAddContextModal
} from './views';

export function registerHandlers(app: App): void {
  // Commande /suivi - ouvre le modal pour créer un nouveau suivi
  app.command('/suivi', async ({ command, ack, client, logger }) => {
    await ack();

    try {
      // Vérifier si un type est spécifié
      const args = command.text.trim().toLowerCase();
      let preselectedType: FollowupType | undefined;

      if (args === 'magistrale') preselectedType = 'magistrale';
      else if (args === 'important' || args === 'suivis-importants') preselectedType = 'suivis-importants';
      else if (args === 'rx' || args === 'rx-pickup' || args === 'pickup') preselectedType = 'rx-pickup';
      else if (args === 'pilulier') preselectedType = 'pilulier';
      else if (args === 'liste' || args === 'list') {
        // Afficher la liste des suivis ouverts
        const followups = getOpenFollowups();
        if (followups.length === 0) {
          await client.chat.postEphemeral({
            channel: command.channel_id,
            user: command.user_id,
            text: '✨ Aucun suivi en cours!'
          });
          return;
        }

        const typeEmojis: Record<string, string> = {
          magistrale: '🧪',
          'suivis-importants': '⚠️',
          'rx-pickup': '📞',
          pilulier: '💊'
        };

        const lines = followups.slice(0, 20).map(f => {
          const emoji = typeEmojis[f.type] || '📋';
          return `${emoji} *#${f.id}* ${f.patient_name || '_Sans patient_'} - ${f.status}`;
        });

        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: command.user_id,
          text: `📋 *Suivis en cours (${followups.length}):*\n\n${lines.join('\n')}\n\nUtilisez \`/suivi\` pour créer un nouveau suivi.`
        });
        return;
      }

      await client.views.open({
        trigger_id: command.trigger_id,
        view: buildNewFollowupModal(preselectedType)
      });
    } catch (error) {
      logger.error('Erreur lors de l\'ouverture du modal:', error);
    }
  });

  // Raccourcis pour chaque type
  app.command('/magistrale', async ({ command, ack, client, logger }) => {
    await ack();
    try {
      await client.views.open({
        trigger_id: command.trigger_id,
        view: buildNewFollowupModal('magistrale')
      });
    } catch (error) {
      logger.error('Erreur:', error);
    }
  });

  app.command('/rx-pickup', async ({ command, ack, client, logger }) => {
    await ack();
    try {
      await client.views.open({
        trigger_id: command.trigger_id,
        view: buildNewFollowupModal('rx-pickup')
      });
    } catch (error) {
      logger.error('Erreur:', error);
    }
  });

  app.command('/pilulier', async ({ command, ack, client, logger }) => {
    await ack();
    try {
      await client.views.open({
        trigger_id: command.trigger_id,
        view: buildNewFollowupModal('pilulier')
      });
    } catch (error) {
      logger.error('Erreur:', error);
    }
  });

  app.command('/important', async ({ command, ack, client, logger }) => {
    await ack();
    try {
      await client.views.open({
        trigger_id: command.trigger_id,
        view: buildNewFollowupModal('suivis-importants')
      });
    } catch (error) {
      logger.error('Erreur:', error);
    }
  });

  // Modal submission - étape 1: sélection du type
  app.view('new_followup_modal', async ({ ack, body, view, client, logger }) => {
    const values = view.state.values;
    const type = values.followup_type?.type_select?.selected_option?.value as FollowupType;
    const patientName = values.patient_name?.patient_input?.value || '';
    const context = values.context?.context_input?.value || '';

    if (!type) {
      await ack({
        response_action: 'errors',
        errors: { followup_type: 'Veuillez sélectionner un type de suivi' }
      });
      return;
    }

    // Pousser le modal des détails
    await ack({
      response_action: 'push',
      view: buildFollowupDetailsModal(type, patientName, context)
    });
  });

  // Modal submission - étape 2: détails du suivi
  app.view('followup_details_modal', async ({ ack, body, view, client, logger }) => {
    await ack();

    try {
      const metadata = JSON.parse(view.private_metadata);
      const { type, patientName, context } = metadata as {
        type: FollowupType;
        patientName: string;
        context: string;
      };

      const values = view.state.values;
      const config = getFollowupConfig(type);

      // Extraire les valeurs des champs
      const data: Record<string, unknown> = {};
      if (context) data.context = context;

      for (const field of config.fields) {
        const blockValue = values[`field_${field.id}`]?.[`field_${field.id}_input`];
        if (blockValue) {
          if (field.type === 'select' || field.type === 'boolean') {
            data[field.id] = blockValue.selected_option?.value;
          } else if (field.type === 'date') {
            data[field.id] = blockValue.selected_date;
          } else {
            data[field.id] = blockValue.value;
          }
        }
      }

      // Statut initial
      const initialStatus = values.initial_status?.status_select?.selected_option?.value || 'ouvert';

      // Créer le suivi
      const followup = createFollowup(type, body.user.id, patientName || null, data);

      // Mettre à jour avec le statut
      const channelId = process.env.PHARMACIEN_CHANNEL_ID;
      if (!channelId) {
        logger.error('PHARMACIEN_CHANNEL_ID non configuré');
        return;
      }

      // Poster le message dans le channel
      const message = buildFollowupMessage({ ...followup, status: initialStatus });
      const result = await client.chat.postMessage({
        channel: channelId,
        ...message
      });

      // Mettre à jour le suivi avec les infos du message
      updateFollowup(
        followup.id,
        {
          status: initialStatus,
          slack_message_ts: result.ts,
          slack_channel_id: channelId
        },
        body.user.id,
        'Création du suivi'
      );

      logger.info(`Suivi #${followup.id} créé par ${body.user.id}`);
    } catch (error) {
      logger.error('Erreur lors de la création du suivi:', error);
    }
  });

  // Action: Modifier le statut
  app.action('update_status', async ({ ack, body, client, logger }) => {
    await ack();

    try {
      const action = body as BlockAction;
      const followupId = parseInt((action.actions[0] as { value: string }).value);
      const followup = getFollowup(followupId);

      if (!followup) {
        logger.error(`Suivi #${followupId} non trouvé`);
        return;
      }

      await client.views.open({
        trigger_id: action.trigger_id,
        view: buildUpdateStatusModal(followup)
      });
    } catch (error) {
      logger.error('Erreur:', error);
    }
  });

  // Modal: Mise à jour du statut
  app.view('update_status_modal', async ({ ack, body, view, client, logger }) => {
    await ack();

    try {
      const metadata = JSON.parse(view.private_metadata);
      const { followupId } = metadata as { followupId: number };
      const values = view.state.values;

      const newStatus = values.new_status?.status_select?.selected_option?.value;
      const context = values.update_context?.context_input?.value;

      if (!newStatus) return;

      const followup = updateFollowup(followupId, { status: newStatus }, body.user.id, context);

      if (followup && followup.slack_message_ts && followup.slack_channel_id) {
        const message = buildFollowupMessage(followup);
        await client.chat.update({
          channel: followup.slack_channel_id,
          ts: followup.slack_message_ts,
          ...message
        });
      }

      logger.info(`Suivi #${followupId} mis à jour par ${body.user.id}`);
    } catch (error) {
      logger.error('Erreur:', error);
    }
  });

  // Action: Ajouter du contexte
  app.action('add_context', async ({ ack, body, client, logger }) => {
    await ack();

    try {
      const action = body as BlockAction;
      const followupId = parseInt((action.actions[0] as { value: string }).value);
      const followup = getFollowup(followupId);

      if (!followup) {
        logger.error(`Suivi #${followupId} non trouvé`);
        return;
      }

      await client.views.open({
        trigger_id: action.trigger_id,
        view: buildAddContextModal(followup)
      });
    } catch (error) {
      logger.error('Erreur:', error);
    }
  });

  // Modal: Ajout de contexte
  app.view('add_context_modal', async ({ ack, body, view, client, logger }) => {
    await ack();

    try {
      const metadata = JSON.parse(view.private_metadata);
      const { followupId } = metadata as { followupId: number };
      const values = view.state.values;

      const newContext = values.new_context?.context_input?.value;
      if (!newContext) return;

      const currentFollowup = getFollowup(followupId);
      if (!currentFollowup) return;

      const existingContext = (currentFollowup.data as Record<string, unknown>).context as string || '';
      const timestamp = new Date().toLocaleString('fr-CA');
      const updatedContext = existingContext
        ? `${existingContext}\n\n[${timestamp}] ${newContext}`
        : `[${timestamp}] ${newContext}`;

      const followup = updateFollowup(
        followupId,
        { data: { context: updatedContext } },
        body.user.id,
        newContext
      );

      if (followup && followup.slack_message_ts && followup.slack_channel_id) {
        const message = buildFollowupMessage(followup);
        await client.chat.update({
          channel: followup.slack_channel_id,
          ts: followup.slack_message_ts,
          ...message
        });
      }

      logger.info(`Contexte ajouté au suivi #${followupId} par ${body.user.id}`);
    } catch (error) {
      logger.error('Erreur:', error);
    }
  });

  // Action: Fermer le suivi
  app.action('close_followup', async ({ ack, body, client, logger }) => {
    await ack();

    try {
      const action = body as BlockAction;
      const followupId = parseInt((action.actions[0] as { value: string }).value);

      const followup = closeFollowup(followupId, action.user.id, 'Fermé via bouton');

      if (followup && followup.slack_message_ts && followup.slack_channel_id) {
        const message = buildFollowupMessage(followup);
        await client.chat.update({
          channel: followup.slack_channel_id,
          ts: followup.slack_message_ts,
          ...message
        });

        // Ajouter une réaction pour indiquer que c'est fermé
        await client.reactions.add({
          channel: followup.slack_channel_id,
          timestamp: followup.slack_message_ts,
          name: 'white_check_mark'
        });
      }

      logger.info(`Suivi #${followupId} fermé par ${action.user.id}`);
    } catch (error) {
      logger.error('Erreur:', error);
    }
  });

  // Action: Voir un suivi (depuis le rapport)
  app.action('view_followup', async ({ ack, body, client, logger }) => {
    await ack();

    try {
      const action = body as BlockAction;
      const followupId = parseInt((action.actions[0] as { value: string }).value);
      const followup = getFollowup(followupId);

      if (!followup) {
        logger.error(`Suivi #${followupId} non trouvé`);
        return;
      }

      // Si le message original existe, on y navigue
      if (followup.slack_message_ts && followup.slack_channel_id) {
        const permalink = await client.chat.getPermalink({
          channel: followup.slack_channel_id,
          message_ts: followup.slack_message_ts
        });

        await client.chat.postEphemeral({
          channel: action.channel?.id || followup.slack_channel_id,
          user: action.user.id,
          text: `📋 Suivi #${followupId}: ${permalink.permalink}`
        });
      } else {
        // Sinon on affiche les détails en éphémère
        const message = buildFollowupMessage(followup);
        await client.chat.postEphemeral({
          channel: action.channel?.id || process.env.PHARMACIEN_CHANNEL_ID!,
          user: action.user.id,
          ...message
        });
      }
    } catch (error) {
      logger.error('Erreur:', error);
    }
  });
}
