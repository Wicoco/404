import cheerio from 'cheerio';
import { resolveUrl, isInternalUrl, findLineNumber } from './utils.js';

/**
 * Extracteur de liens depuis HTML
 * Trouve tous les liens internes et externes d'une page
 */
export class LinkExtractor {
  constructor() {
    // Types de liens à extraire
    this.linkSelectors = [
      'a[href]',                    // Liens standard
      'link[href]',                 // CSS, preload, etc.
      'img[src]',                   // Images (optionnel selon config)
      'script[src]',                // Scripts externes
      'iframe[src]',                // iFrames
      'source[src]',                // Sources media
      'video[src]',                 // Vidéos
      'audio[src]'                  // Audio
    ];
    
    // Attributs contenant des URLs
    this.urlAttributes = {
      'a': 'href',
      'link': 'href', 
      'img': 'src',
      'script': 'src',
      'iframe': 'src',
      'source': 'src',
      'video': 'src',
      'audio': 'src'
    };

    this.excludeImages = true; // Config: exclure les images par défaut
  }

  /**
   * Extrait tous les liens d'une page HTML
   * @param {string} html - Code HTML de la page
   * @param {string} baseUrl - URL de la page pour résolution relative
   * @returns {Array<Object>} - Liste des liens avec métadonnées
   */
  extractLinks(html, baseUrl) {
    const  $  = cheerio.load(html);
    const links = [];
    
    console.log('🔍 Extraction liens depuis:', baseUrl);

    // Extraction des liens <a>
    $('a[href]').each((index, element) => {
      const link = this.extractSingleLink($, element, 'href', baseUrl, html);
      if (link) links.push(link);
    });

    // Extraction des ressources (CSS, JS, etc.) - optionnel
    if (!this.excludeImages) {
      $('img[src], script[src], link[href]').each((index, element) => {
        const attribute = this.urlAttributes[element.name] || 'src';
        const link = this.extractSingleLink( $ , element, attribute, baseUrl, html);
        if (link) {
          link.type = this.categorizeLink(element.name);
          links.push(link);
        }
      });
    }

    console.log('✅ Liens extraits:', links.length);
    
    // Suppression des doublons par URL
    const uniqueLinks = this.deduplicateLinks(links);
    
    return uniqueLinks;
  }

  /**
   * Extrait un lien individuel avec ses métadonnées
   * @param {CheerioAPI}  $  - Instance Cheerio
   * @param {Element} element - Élément DOM
   * @param {string} attribute - Attribut contenant l'URL
   * @param {string} baseUrl - URL de base
   * @param {string} html - HTML complet pour localisation
   * @returns {Object|null} - Données du lien
   */
  extractSingleLink($, element, attribute, baseUrl, html) {
    const href = $(element).attr(attribute);
    if (!href) return null;

    // Résolution URL absolue
    const absoluteUrl = resolveUrl(href, baseUrl);
    if (!absoluteUrl) return null;

    // Texte du lien (pour les <a>)
    const linkText = element.name === 'a' 
      ? $(element).text().trim().substring(0, 100)
      : $(element).attr('alt') || $(element).attr('title') || '';

    // HTML de l'élément pour localisation
    const elementHtml = $.html(element);
    const lineNumber = findLineNumber(html, elementHtml);

    return {
      url: absoluteUrl,
      originalHref: href,
      linkText,
      element: element.name,
      isInternal: isInternalUrl(absoluteUrl, baseUrl),
      position: {
        line: lineNumber,
        html: elementHtml.substring(0, 200) + (elementHtml.length > 200 ? '...' : '')
      },
      foundOn: baseUrl
    };
  }

  /**
   * Catégorise un type de lien selon l'élément
   * @param {string} tagName - Nom de la balise HTML
   * @returns {string} - Catégorie du lien
   */
  categorizeLink(tagName) {
    const categories = {
      'a': 'navigation',
      'img': 'image',
      'script': 'script', 
      'link': 'resource',
      'iframe': 'embed',
      'video': 'media',
      'audio': 'media',
      'source': 'media'
    };
    
    return categories[tagName] || 'other';
  }

  /**
   * Supprime les liens en double (même URL)
   * @param {Array<Object>} links - Liste des liens
   * @returns {Array<Object>} - Liens uniques
   */
  deduplicateLinks(links) {
    const uniqueMap = new Map();
    
    links.forEach(link => {
      const key = link.url;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, link);
      } else {
        // Garde le premier, mais marque s'il y a des doublons
        const existing = uniqueMap.get(key);
        existing.duplicateCount = (existing.duplicateCount || 1) + 1;
      }
    });
    
    return Array.from(uniqueMap.values());
  }

  /**
   * Filtre les liens selon des critères
   * @param {Array<Object>} links - Liste des liens
   * @param {Object} filters - Filtres à appliquer
   * @returns {Array<Object>} - Liens filtrés
   */
  filterLinks(links, filters = {}) {
    let filteredLinks = [...links];

    // Filtre par type (interne/externe)
    if (filters.internal === true) {
      filteredLinks = filteredLinks.filter(link => link.isInternal);
    }
    if (filters.external === true) {
      filteredLinks = filteredLinks.filter(link => !link.isInternal);
    }

    // Filtre par élément HTML
    if (filters.elements && filters.elements.length > 0) {
      filteredLinks = filteredLinks.filter(link => 
        filters.elements.includes(link.element)
      );
    }

    // Filtre par domaine
    if (filters.excludeDomains) {
      filteredLinks = filteredLinks.filter(link => {
        try {
          const domain = new URL(link.url).hostname;
          return !filters.excludeDomains.includes(domain);
        } catch {
          return true;
        }
      });
    }

    return filteredLinks;
  }

  /**
   * Génère des statistiques sur les liens extraits
   * @param {Array<Object>} links - Liste des liens
   * @returns {Object} - Statistiques détaillées
   */
  generateStats(links) {
    const stats = {
      total: links.length,
      internal: links.filter(l => l.isInternal).length,
      external: links.filter(l => !l.isInternal).length,
      byElement: {},
      byCategory: {},
      domains: {}
    };

    stats.external = stats.total - stats.internal;

    // Stats par élément HTML
    links.forEach(link => {
      stats.byElement[link.element] = (stats.byElement[link.element] || 0) + 1;
      
      if (link.type) {
        stats.byCategory[link.type] = (stats.byCategory[link.type] || 0) + 1;
      }

      // Stats par domaine
      try {
        const domain = new URL(link.url).hostname;
        stats.domains[domain] = (stats.domains[domain] || 0) + 1;
      } catch {}
    });

    return stats;
  }
}
