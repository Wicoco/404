/**
 * Utilitaires partagés pour le Link Checker Stereolabs
 */

/**
 * Pause d'exécution pour éviter le rate limiting
 * @param {number} ms - Millisecondes de pause
 */
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Détermine si une URL est interne au domaine Stereolabs
 * @param {string} url - URL à vérifier
 * @param {string} baseUrl - URL de base (défaut: stereolabs.com)
 * @returns {boolean}
 */
export const isInternalUrl = (url, baseUrl = 'https://www.stereolabs.com') => {
  try {
    const urlObj = new URL(url, baseUrl);
    const baseObj = new URL(baseUrl);
    return urlObj.hostname === baseObj.hostname;
  } catch {
    return false;
  }
};

/**
 * Résout une URL relative en URL absolue
 * @param {string} href - URL relative ou absolue
 * @param {string} baseUrl - URL de base pour résolution
 * @returns {string|null}
 */
export const resolveUrl = (href, baseUrl) => {
  try {
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return null; // Ignore anchors et liens non-HTTP
    }
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
};

/**
 * Formatte une durée en format lisible
 * @param {number} startTime - Timestamp de début
 * @returns {string}
 */
export const formatDuration = (startTime) => {
  const duration = Date.now() - startTime;
  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

/**
 * Trouve approximativement le numéro de ligne d'un élément dans le HTML
 * @param {string} html - Code HTML complet
 * @param {string} element - Élément à localiser
 * @returns {number}
 */
export const findLineNumber = (html, element) => {
  const lines = html.split('\n');
  const cleanElement = element.replace(/\s+/g, ' ').trim();
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(cleanElement) || lines[i].replace(/\s+/g, ' ').includes(cleanElement)) {
      return i + 1;
    }
  }
  return 0; // Non trouvé
};

/**
 * Limite le nombre de promesses concurrentes
 * @param {Array} items - Items à traiter
 * @param {Function} processor - Fonction de traitement
 * @param {number} concurrency - Nombre max de promesses simultanées
 */
export const processConcurrent = async (items, processor, concurrency = 10) => {
  const results = [];
  
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(item => processor(item))
    );
    
    results.push(...batchResults.map((result, index) => ({
      item: batch[index],
      success: result.status === 'fulfilled',
      result: result.status === 'fulfilled' ? result.value : result.reason
    })));
    
    // Pause entre batches pour être gentil avec les serveurs
    if (i + concurrency < items.length) {
      await sleep(1000);
    }
  }
  
  return results;
};
