// Types de suivis et leurs configurations

export type FollowupType = 'magistrale' | 'suivis-importants' | 'rx-pickup' | 'pilulier';

export interface FollowupTypeConfig {
  id: FollowupType;
  name: string;
  emoji: string;
  description: string;
  fields: FieldConfig[];
  statuses: StatusOption[];
}

export interface FieldConfig {
  id: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'datetime' | 'boolean';
  required: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface StatusOption {
  value: string;
  label: string;
  emoji: string;
  isFinal?: boolean;
}

// Configuration des types de suivis
export const FOLLOWUP_CONFIGS: Record<FollowupType, FollowupTypeConfig> = {
  magistrale: {
    id: 'magistrale',
    name: 'Commande Magistrale',
    emoji: '🧪',
    description: 'Suivi des préparations magistrales',
    fields: [
      {
        id: 'pharmacie',
        label: 'Pharmacie',
        type: 'select',
        required: true,
        options: [
          { value: 'ejm', label: 'EJM' },
          { value: 'frayne', label: 'Frayne' },
          { value: 'autre', label: 'Autre' }
        ]
      },
      {
        id: 'pharmacie_autre',
        label: 'Précisez la pharmacie',
        type: 'text',
        required: false,
        placeholder: 'Nom de la pharmacie'
      },
      {
        id: 'devis_envoye',
        label: 'Demande de devis envoyée',
        type: 'boolean',
        required: false
      },
      {
        id: 'commande_envoyee',
        label: 'Commande envoyée',
        type: 'boolean',
        required: false
      },
      {
        id: 'patient_avise_prix',
        label: 'Patient avisé du prix',
        type: 'boolean',
        required: false
      },
      {
        id: 'paye',
        label: 'Payé',
        type: 'boolean',
        required: false
      }
    ],
    statuses: [
      { value: 'devis_demande', label: 'Devis demandé', emoji: '📨' },
      { value: 'devis_recu', label: 'Devis reçu', emoji: '📋' },
      { value: 'attente_patient', label: 'Attente réponse patient', emoji: '⏳' },
      { value: 'commande_envoyee', label: 'Commande envoyée', emoji: '📦' },
      { value: 'en_preparation', label: 'En préparation', emoji: '⚗️' },
      { value: 'pret', label: 'Prêt à récupérer', emoji: '✅' },
      { value: 'patient_refuse', label: 'Patient a refusé', emoji: '❌', isFinal: true },
      { value: 'ferme', label: 'Fermé', emoji: '🏁', isFinal: true }
    ]
  },

  'suivis-importants': {
    id: 'suivis-importants',
    name: 'Suivi Important',
    emoji: '⚠️',
    description: 'Suivis importants généraux',
    fields: [
      {
        id: 'description',
        label: 'Description',
        type: 'text',
        required: true,
        placeholder: 'Décrivez le suivi important...'
      },
      {
        id: 'priorite',
        label: 'Priorité',
        type: 'select',
        required: true,
        options: [
          { value: 'haute', label: '🔴 Haute' },
          { value: 'moyenne', label: '🟡 Moyenne' },
          { value: 'basse', label: '🟢 Basse' }
        ]
      },
      {
        id: 'date_echeance',
        label: 'Date d\'échéance',
        type: 'date',
        required: false
      }
    ],
    statuses: [
      { value: 'ouvert', label: 'Ouvert', emoji: '🔵' },
      { value: 'en_cours', label: 'En cours', emoji: '🟡' },
      { value: 'en_attente', label: 'En attente', emoji: '⏸️' },
      { value: 'ferme', label: 'Fermé', emoji: '✅', isFinal: true }
    ]
  },

  'rx-pickup': {
    id: 'rx-pickup',
    name: 'Rx Pickup en cours',
    emoji: '📞',
    description: 'Récupération de prescriptions en cours',
    fields: [
      {
        id: 'date_signale',
        label: 'Date/heure signalé',
        type: 'datetime',
        required: true
      },
      {
        id: 'pharmacie_origine',
        label: 'Pharmacie d\'origine',
        type: 'text',
        required: false,
        placeholder: 'Nom de la pharmacie'
      },
      {
        id: 'medicaments',
        label: 'Médicaments concernés',
        type: 'text',
        required: false,
        placeholder: 'Liste des médicaments'
      },
      {
        id: 'recu',
        label: 'Reçu',
        type: 'boolean',
        required: false
      }
    ],
    statuses: [
      { value: 'demande', label: 'Demandé', emoji: '📨' },
      { value: 'en_attente', label: 'En attente', emoji: '⏳' },
      { value: 'relance', label: 'Relancé', emoji: '🔄' },
      { value: 'recu', label: 'Reçu', emoji: '✅', isFinal: true },
      { value: 'annule', label: 'Annulé', emoji: '❌', isFinal: true }
    ]
  },

  pilulier: {
    id: 'pilulier',
    name: 'Changement de pilulier',
    emoji: '💊',
    description: 'Changements de piluliers en cours',
    fields: [
      {
        id: 'date_echeance',
        label: 'Date d\'échéance',
        type: 'date',
        required: true
      },
      {
        id: 'type_changement',
        label: 'Type de changement',
        type: 'select',
        required: false,
        options: [
          { value: 'nouveau', label: 'Nouveau pilulier' },
          { value: 'modification', label: 'Modification' },
          { value: 'arret', label: 'Arrêt pilulier' }
        ]
      },
      {
        id: 'medicaments',
        label: 'Médicaments concernés',
        type: 'text',
        required: false,
        placeholder: 'Changements de médicaments'
      }
    ],
    statuses: [
      { value: 'planifie', label: 'Planifié', emoji: '📅' },
      { value: 'en_cours', label: 'En cours', emoji: '🔄' },
      { value: 'complete', label: 'Complété', emoji: '✅', isFinal: true },
      { value: 'annule', label: 'Annulé', emoji: '❌', isFinal: true }
    ]
  }
};

export function getFollowupConfig(type: FollowupType): FollowupTypeConfig {
  return FOLLOWUP_CONFIGS[type];
}

export function getAllFollowupTypes(): FollowupTypeConfig[] {
  return Object.values(FOLLOWUP_CONFIGS);
}

export function formatStatus(type: FollowupType, statusValue: string): string {
  const config = getFollowupConfig(type);
  const status = config.statuses.find(s => s.value === statusValue);
  return status ? `${status.emoji} ${status.label}` : statusValue;
}
