import { Followup } from '../database/schema';
import {
  FollowupType,
  FollowupTypeConfig,
  getFollowupConfig,
  getAllFollowupTypes,
  formatStatus,
  FOLLOWUP_CONFIGS
} from './types';
import { KnownBlock, ModalView, Button, SectionBlock, ActionsBlock } from '@slack/bolt';

// Modal pour créer un nouveau suivi
export function buildNewFollowupModal(preselectedType?: FollowupType): ModalView {
  const typeOptions = getAllFollowupTypes().map(config => ({
    text: { type: 'plain_text' as const, text: `${config.emoji} ${config.name}`, emoji: true },
    value: config.id
  }));

  const blocks: KnownBlock[] = [
    {
      type: 'input',
      block_id: 'followup_type',
      label: { type: 'plain_text', text: 'Type de suivi' },
      element: {
        type: 'static_select',
        action_id: 'type_select',
        placeholder: { type: 'plain_text', text: 'Choisir le type...' },
        options: typeOptions,
        ...(preselectedType && { initial_option: typeOptions.find(o => o.value === preselectedType) })
      }
    },
    {
      type: 'input',
      block_id: 'patient_name',
      label: { type: 'plain_text', text: 'Nom du patient' },
      element: {
        type: 'plain_text_input',
        action_id: 'patient_input',
        placeholder: { type: 'plain_text', text: 'Nom du patient...' }
      },
      optional: true
    },
    {
      type: 'input',
      block_id: 'context',
      label: { type: 'plain_text', text: 'Contexte initial' },
      element: {
        type: 'plain_text_input',
        action_id: 'context_input',
        multiline: true,
        placeholder: { type: 'plain_text', text: 'Ajoutez du contexte...' }
      },
      optional: true
    }
  ];

  return {
    type: 'modal',
    callback_id: 'new_followup_modal',
    title: { type: 'plain_text', text: 'Nouveau suivi' },
    submit: { type: 'plain_text', text: 'Créer' },
    close: { type: 'plain_text', text: 'Annuler' },
    blocks
  };
}

// Modal pour les détails spécifiques au type de suivi
export function buildFollowupDetailsModal(
  type: FollowupType,
  patientName: string,
  context: string
): ModalView {
  const config = getFollowupConfig(type);
  const blocks: KnownBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${config.emoji} ${config.name}*\n${patientName ? `Patient: ${patientName}` : '_Aucun patient spécifié_'}`
      }
    },
    { type: 'divider' }
  ];

  // Ajouter les champs spécifiques au type
  for (const field of config.fields) {
    if (field.type === 'select' && field.options) {
      blocks.push({
        type: 'input',
        block_id: `field_${field.id}`,
        label: { type: 'plain_text', text: field.label },
        element: {
          type: 'static_select',
          action_id: `field_${field.id}_input`,
          placeholder: { type: 'plain_text', text: 'Choisir...' },
          options: field.options.map(opt => ({
            text: { type: 'plain_text' as const, text: opt.label, emoji: true },
            value: opt.value
          }))
        },
        optional: !field.required
      });
    } else if (field.type === 'boolean') {
      blocks.push({
        type: 'input',
        block_id: `field_${field.id}`,
        label: { type: 'plain_text', text: field.label },
        element: {
          type: 'static_select',
          action_id: `field_${field.id}_input`,
          options: [
            { text: { type: 'plain_text', text: '✅ Oui' }, value: 'true' },
            { text: { type: 'plain_text', text: '❌ Non' }, value: 'false' }
          ]
        },
        optional: true
      });
    } else if (field.type === 'date') {
      blocks.push({
        type: 'input',
        block_id: `field_${field.id}`,
        label: { type: 'plain_text', text: field.label },
        element: {
          type: 'datepicker',
          action_id: `field_${field.id}_input`,
          placeholder: { type: 'plain_text', text: 'Choisir une date...' }
        },
        optional: !field.required
      });
    } else {
      blocks.push({
        type: 'input',
        block_id: `field_${field.id}`,
        label: { type: 'plain_text', text: field.label },
        element: {
          type: 'plain_text_input',
          action_id: `field_${field.id}_input`,
          placeholder: { type: 'plain_text', text: field.placeholder || '' }
        },
        optional: !field.required
      });
    }
  }

  // Sélection du statut initial
  blocks.push(
    { type: 'divider' },
    {
      type: 'input',
      block_id: 'initial_status',
      label: { type: 'plain_text', text: 'Statut initial' },
      element: {
        type: 'static_select',
        action_id: 'status_select',
        options: config.statuses.filter(s => !s.isFinal).map(status => ({
          text: { type: 'plain_text' as const, text: `${status.emoji} ${status.label}`, emoji: true },
          value: status.value
        }))
      }
    }
  );

  return {
    type: 'modal',
    callback_id: 'followup_details_modal',
    private_metadata: JSON.stringify({ type, patientName, context }),
    title: { type: 'plain_text', text: 'Détails du suivi' },
    submit: { type: 'plain_text', text: 'Créer' },
    close: { type: 'plain_text', text: 'Retour' },
    blocks
  };
}

// Message de suivi posté dans le channel
export function buildFollowupMessage(followup: Followup): { blocks: KnownBlock[]; text: string } {
  const config = getFollowupConfig(followup.type);
  const data = followup.data as Record<string, unknown>;

  const headerText = `${config.emoji} *${config.name}* #${followup.id}`;
  const statusText = formatStatus(followup.type, followup.status);

  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${config.emoji} ${config.name} #${followup.id}`, emoji: true }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Patient:*\n${followup.patient_name || '_Non spécifié_'}` },
        { type: 'mrkdwn', text: `*Statut:*\n${statusText}` },
        { type: 'mrkdwn', text: `*Créé par:*\n<@${followup.created_by}>` },
        { type: 'mrkdwn', text: `*Date:*\n${formatDate(followup.created_at)}` }
      ]
    }
  ];

  // Ajouter les champs de données spécifiques
  const dataFields = buildDataFields(config, data);
  if (dataFields.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      fields: dataFields
    });
  }

  // Contexte
  if (data.context) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `💬 ${data.context}` }]
    });
  }

  // Boutons d'action
  const isFinal = config.statuses.find(s => s.value === followup.status)?.isFinal;
  if (!isFinal) {
    blocks.push({
      type: 'actions',
      block_id: `followup_actions_${followup.id}`,
      elements: [
        {
          type: 'button',
          action_id: 'update_status',
          text: { type: 'plain_text', text: '🔄 Modifier statut', emoji: true },
          value: String(followup.id)
        },
        {
          type: 'button',
          action_id: 'add_context',
          text: { type: 'plain_text', text: '💬 Ajouter contexte', emoji: true },
          value: String(followup.id)
        },
        {
          type: 'button',
          action_id: 'close_followup',
          text: { type: 'plain_text', text: '✅ Fermer', emoji: true },
          style: 'primary',
          value: String(followup.id)
        }
      ] as Button[]
    } as ActionsBlock);
  }

  return {
    blocks,
    text: `${headerText} - ${followup.patient_name || 'Patient non spécifié'} - ${statusText}`
  };
}

// Modal pour mettre à jour le statut
export function buildUpdateStatusModal(followup: Followup): ModalView {
  const config = getFollowupConfig(followup.type);

  return {
    type: 'modal',
    callback_id: 'update_status_modal',
    private_metadata: JSON.stringify({ followupId: followup.id }),
    title: { type: 'plain_text', text: 'Modifier le statut' },
    submit: { type: 'plain_text', text: 'Mettre à jour' },
    close: { type: 'plain_text', text: 'Annuler' },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Suivi #${followup.id}*\n${followup.patient_name || '_Patient non spécifié_'}`
        }
      },
      {
        type: 'input',
        block_id: 'new_status',
        label: { type: 'plain_text', text: 'Nouveau statut' },
        element: {
          type: 'static_select',
          action_id: 'status_select',
          initial_option: {
            text: {
              type: 'plain_text',
              text: formatStatus(followup.type, followup.status),
              emoji: true
            },
            value: followup.status
          },
          options: config.statuses.map(status => ({
            text: { type: 'plain_text' as const, text: `${status.emoji} ${status.label}`, emoji: true },
            value: status.value
          }))
        }
      },
      {
        type: 'input',
        block_id: 'update_context',
        label: { type: 'plain_text', text: 'Contexte de la modification' },
        element: {
          type: 'plain_text_input',
          action_id: 'context_input',
          multiline: true,
          placeholder: { type: 'plain_text', text: 'Expliquez la modification...' }
        },
        optional: true
      }
    ]
  };
}

// Modal pour ajouter du contexte
export function buildAddContextModal(followup: Followup): ModalView {
  return {
    type: 'modal',
    callback_id: 'add_context_modal',
    private_metadata: JSON.stringify({ followupId: followup.id }),
    title: { type: 'plain_text', text: 'Ajouter contexte' },
    submit: { type: 'plain_text', text: 'Ajouter' },
    close: { type: 'plain_text', text: 'Annuler' },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Suivi #${followup.id}*\n${followup.patient_name || '_Patient non spécifié_'}`
        }
      },
      {
        type: 'input',
        block_id: 'new_context',
        label: { type: 'plain_text', text: 'Nouveau contexte' },
        element: {
          type: 'plain_text_input',
          action_id: 'context_input',
          multiline: true,
          placeholder: { type: 'plain_text', text: 'Ajoutez des informations supplémentaires...' }
        }
      }
    ]
  };
}

// Rapport matinal
export function buildMorningReport(followups: Followup[]): { blocks: KnownBlock[]; text: string } {
  const today = new Date().toLocaleDateString('fr-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `☀️ Rapport du matin - ${today}`, emoji: true }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${followups.length} suivi(s) en cours*\nVoici les éléments qui nécessitent votre attention:`
      }
    },
    { type: 'divider' }
  ];

  // Grouper par type
  const byType: Record<FollowupType, Followup[]> = {
    magistrale: [],
    'suivis-importants': [],
    'rx-pickup': [],
    pilulier: []
  };

  for (const f of followups) {
    byType[f.type].push(f);
  }

  for (const [type, items] of Object.entries(byType)) {
    if (items.length === 0) continue;

    const config = FOLLOWUP_CONFIGS[type as FollowupType];
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${config.emoji} ${config.name}* (${items.length})`
      }
    });

    for (const item of items) {
      const statusText = formatStatus(item.type, item.status);
      const data = item.data as Record<string, unknown>;
      let details = '';

      // Ajouter des détails pertinents selon le type
      if (type === 'magistrale' && data.pharmacie) {
        details = ` • Pharmacie: ${String(data.pharmacie).toUpperCase()}`;
      } else if (type === 'pilulier') {
        const typeLabel = data.type_changement === 'nouveau' ? 'Nouveau' :
                          data.type_changement === 'transfert' ? 'Transfert' : '';
        details = ` • ${typeLabel}${data.date_echeance ? ` • Échéance: ${data.date_echeance}` : ''}`;
      } else if (type === 'rx-pickup' && data.date_signale) {
        details = ` • Signalé: ${data.date_signale}${data.adresse ? ` • ${data.adresse}` : ''}`;
      }

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• *#${item.id}* ${item.patient_name || '_Sans patient_'} - ${statusText}${details}`
        },
        accessory: {
          type: 'button',
          action_id: 'view_followup',
          text: { type: 'plain_text', text: 'Voir', emoji: true },
          value: String(item.id)
        }
      } as SectionBlock);
    }

    blocks.push({ type: 'divider' });
  }

  if (followups.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '🎉 *Aucun suivi en cours!* Bonne journée!'
      }
    });
  }

  return {
    blocks,
    text: `☀️ Rapport du matin - ${followups.length} suivi(s) en cours`
  };
}

// Helpers
function buildDataFields(config: FollowupTypeConfig, data: Record<string, unknown>): { type: 'mrkdwn'; text: string }[] {
  const fields: { type: 'mrkdwn'; text: string }[] = [];

  for (const field of config.fields) {
    const value = data[field.id];
    if (value === undefined || value === null || value === '') continue;

    let displayValue: string;

    if (field.type === 'boolean') {
      displayValue = value === true || value === 'true' ? '✅ Oui' : '❌ Non';
    } else if (field.type === 'select' && field.options) {
      const option = field.options.find(o => o.value === value);
      displayValue = option?.label || String(value);
    } else {
      displayValue = String(value);
    }

    fields.push({ type: 'mrkdwn', text: `*${field.label}:*\n${displayValue}` });
  }

  return fields;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
