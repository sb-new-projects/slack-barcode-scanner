import axios from 'axios';
import * as cheerio from 'cheerio';
import { db } from '../database/schema';

const RAMQ_INFOLETTRE_URL = 'https://www.ramq.gouv.qc.ca/fr/professionnels/actualites?champ-clientele-professionnels-cible-id=519461';

export interface Infolettre {
  title: string;
  url: string;
  date: string;
  isNew: boolean;
}

// Initialiser la table pour tracker les infolettres déjà vues
export function initializeInfolettreTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS seen_infolettres (
      url TEXT PRIMARY KEY,
      title TEXT,
      date_seen TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
}

// Vérifier si une infolettre a déjà été vue
function isInfolettreSeen(url: string): boolean {
  const stmt = db.prepare('SELECT 1 FROM seen_infolettres WHERE url = ?');
  return !!stmt.get(url);
}

// Marquer une infolettre comme vue
function markInfolettreSeen(url: string, title: string): void {
  const stmt = db.prepare('INSERT OR IGNORE INTO seen_infolettres (url, title) VALUES (?, ?)');
  stmt.run(url, title);
}

// Récupérer les infolettres depuis le site RAMQ
export async function fetchRAMQInfolettres(): Promise<Infolettre[]> {
  try {
    const response = await axios.get(RAMQ_INFOLETTRE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8',
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const infolettres: Infolettre[] = [];

    // Chercher les articles/actualités sur la page
    // Structure typique RAMQ: liste d'articles avec titre, date, lien
    $('article, .actualite, .news-item, .liste-actualites li, .card, [class*="actualite"], [class*="news"]').each((_, element) => {
      const $el = $(element);

      // Essayer différents sélecteurs pour le titre et le lien
      const $link = $el.find('a[href*="/actualites/"], a[href*="/infolettre"], a').first();
      const title = $link.text().trim() || $el.find('h2, h3, h4, .titre, .title').first().text().trim();
      let url = $link.attr('href') || '';

      // Essayer de trouver la date
      const dateText = $el.find('time, .date, [class*="date"], span').first().text().trim();

      if (title && url) {
        // Construire l'URL complète si nécessaire
        if (url.startsWith('/')) {
          url = `https://www.ramq.gouv.qc.ca${url}`;
        }

        const isNew = !isInfolettreSeen(url);

        infolettres.push({
          title: title.substring(0, 200), // Limiter la longueur
          url,
          date: dateText || 'Date inconnue',
          isNew
        });
      }
    });

    // Si la structure standard ne fonctionne pas, essayer une approche plus générique
    if (infolettres.length === 0) {
      $('a[href*="/actualites/"], a[href*="infolettre"]').each((_, element) => {
        const $link = $(element);
        const title = $link.text().trim();
        let url = $link.attr('href') || '';

        if (title && url && title.length > 10) {
          if (url.startsWith('/')) {
            url = `https://www.ramq.gouv.qc.ca${url}`;
          }

          const isNew = !isInfolettreSeen(url);

          infolettres.push({
            title: title.substring(0, 200),
            url,
            date: '',
            isNew
          });
        }
      });
    }

    return infolettres;
  } catch (error) {
    console.error('Erreur lors de la récupération des infolettres RAMQ:', error);
    return [];
  }
}

// Récupérer uniquement les nouvelles infolettres et les marquer comme vues
export async function getNewInfolettres(): Promise<Infolettre[]> {
  const allInfolettres = await fetchRAMQInfolettres();
  const newOnes = allInfolettres.filter(i => i.isNew);

  // Marquer les nouvelles comme vues
  for (const info of newOnes) {
    markInfolettreSeen(info.url, info.title);
  }

  return newOnes;
}

// Construire les blocs Slack pour les infolettres
export function buildInfolettreBlocks(infolettres: Infolettre[]): import('@slack/bolt').KnownBlock[] {
  if (infolettres.length === 0) {
    return [];
  }

  const blocks: import('@slack/bolt').KnownBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '📰 Nouvelles infolettres RAMQ', emoji: true }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${infolettres.length} nouvelle(s) publication(s) pour pharmaciens:*`
      }
    }
  ];

  for (const info of infolettres.slice(0, 5)) { // Max 5 pour ne pas surcharger
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `📄 <${info.url}|${info.title}>${info.date ? `\n_${info.date}_` : ''}`
      }
    });
  }

  blocks.push({ type: 'divider' });

  return blocks;
}
