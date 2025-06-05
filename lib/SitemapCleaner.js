/**
 * Nettoyeur de sitemap pour Stereolabs
 * Supprime les paramètres de langue, documents et images
 */
export class SitemapCleaner {
  constructor() {
    // Extensions de fichiers à exclure
    this.excludedExtensions = [
      // Documents
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.txt', '.rtf', '.odt', '.ods', '.odp',
      // Images
      '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.bmp',
      // Médias
      '.mp4', '.avi', '.mov', '.mp3', '.wav',
      // Archives
      '.zip', '.rar', '.tar', '.gz'
    ];

    // Paramètres d'URL à supprimer
    this.excludedParams = [
      'lang', 'locale', 'language', 'l',
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'gclid', 'fbclid', '_ga', '_gac'
    ];

    // Préfixes de langue à normaliser
    this.languagePrefixes = [

    '/en-fr/',

    // Anglais - Versions régionales principales
    '/en-us/',
    '/en-gb/',
    '/en-ca/',
    '/en-au/',
    '/en-in/',

    // Anglais - Europe
    '/en-at/',    // Autriche
    '/en-be/',    // Belgique
    '/en-cy/',    // Chypre
    '/en-cz/',    // République tchèque
    '/en-dk/',    // Danemark
    '/en-ee/',    // Estonie
    '/en-fi/',    // Finlande
    '/en-fr/',    // France
    '/en-de/',    // Allemagne
    '/en-gr/',    // Grèce
    '/en-hu/',    // Hongrie
    '/en-ie/',    // Irlande
    '/en-it/',    // Italie
    '/en-lt/',    // Lituanie
    '/en-lu/',    // Luxembourg
    '/en-lv/',    // Lettonie
    '/en-mt/',    // Malte
    '/en-nl/',    // Pays-Bas
    '/en-no/',    // Norvège
    '/en-pl/',    // Pologne
    '/en-pt/',    // Portugal
    '/en-ro/',    // Roumanie
    '/en-sk/',    // Slovaquie
    '/en-si/',    // Slovénie
    '/en-es/',    // Espagne
    '/en-se/',    // Suède
    '/en-ch/',    // Suisse

    // Anglais - Amérique
    '/en-ar/',    // Argentine
    '/en-br/',    // Brésil
    '/en-cl/',    // Chili
    '/en-mx/',    // Mexique
    '/en-pe/',    // Pérou
    '/en-uy/',    // Uruguay

    // Anglais - Asie/Océanie
    '/en-cn/',    // Chine
    '/en-hk/',    // Hong Kong
    '/en-id/',    // Indonésie
    '/en-il/',    // Israël
    '/en-jp/',    // Japon
    '/en-kz/',    // Kazakhstan
    '/en-kr/',    // Corée du Sud
    '/en-my/',    // Malaisie
    '/en-nz/',    // Nouvelle-Zélande
    '/en-ph/',    // Philippines
    '/en-sg/',    // Singapour
    '/en-tw/',    // Taïwan
    '/en-th/',    // Thaïlande
    '/en-tr/',    // Turquie
    '/en-vn/',    // Vietnam

    // Anglais - Moyen-Orient/Afrique
    '/en-eg/',    // Égypte
    '/en-il/',    // Israël (déjà listé)
    '/en-lb/',    // Liban
    '/en-ma/',    // Maroc
    '/en-qa/',    // Qatar
    '/en-sa/',    // Arabie Saoudite
    '/en-ae/',    // Émirats Arabes Unis
    '/en-za/',    // Afrique du Sud
];
  }

  /**
   * Traite et épure une liste d'URLs
   * @param {Array<string>} urls - URLs brutes du sitemap
   * @returns {Array<string>} - URLs épurées et uniques
   */
  process(urls) {
    console.log('🧹 Début épuration sitemap:', urls.length, 'URLs');
    
    const cleanedUrls = urls
      .map(url => this.cleanSingleUrl(url))
      .filter(url => url !== null)                    // Supprime les URLs invalides
      .filter(url => !this.isExcludedFile(url))      // Supprime documents/images
      .filter(url => !this.isExcludedPath(url));     // Supprime chemins spéciaux

    // Suppression des doublons
    const uniqueUrls = [...new Set(cleanedUrls)];
    
    console.log('✅ Épuration terminée:', uniqueUrls.length, 'URLs uniques');
    console.log('📊 Supprimées:', urls.length - uniqueUrls.length, 'URLs');
    
    return uniqueUrls.sort(); // Tri pour un ordre prévisible
  }

  /**
   * Nettoie une URL individuelle
   * @param {string} url - URL à nettoyer
   * @returns {string|null} - URL nettoyée ou null si à exclure
   */
  cleanSingleUrl(url) {
    try {
      // Validation URL de base
      if (!url || typeof url !== 'string') return null;
      
      let urlObj = new URL(url.trim());
      
      // Suppression des paramètres indésirables
      this.excludedParams.forEach(param => {
        urlObj.searchParams.delete(param);
      });

      // Normalisation du pathname (suppression préfixes langue)
      let pathname = urlObj.pathname;
      
      for (const prefix of this.languagePrefixes) {
        if (pathname.startsWith(prefix)) {
          pathname = pathname.substring(prefix.length - 1); // Garde le /
          break;
        }
      }

      // Assure qu'on a au moins un /
      if (!pathname.startsWith('/')) {
        pathname = '/' + pathname;
      }

      // Reconstruction URL propre
      urlObj.pathname = pathname;
      
      // Suppression fragment (anchor)
      urlObj.hash = '';
      
      return urlObj.toString();

    } catch (error) {
      console.warn('⚠️ URL invalide ignorée:', url);
      return null;
    }
  }

  /**
   * Vérifie si l'URL pointe vers un fichier exclu
   * @param {string} url - URL à vérifier
   * @returns {boolean}
   */
  isExcludedFile(url) {
    const pathname = new URL(url).pathname.toLowerCase();
    return this.excludedExtensions.some(ext => pathname.endsWith(ext));
  }

  /**
   * Vérifie si l'URL a un chemin exclu
   * @param {string} url - URL à vérifier
   * @returns {boolean}
   */
  isExcludedPath(url) {
    const pathname = new URL(url).pathname.toLowerCase();
    
    // Chemins à exclure pour Stereolabs
    const excludedPaths = [
      '/admin', '/wp-admin', '/api/', '/assets/', '/static/',
      '/downloads/', '/files/', '/uploads/', '/media/',
      '/.well-known/', '/robots.txt', '/sitemap'
    ];
    
    return excludedPaths.some(path => pathname.startsWith(path));
  }

  /**
   * Génère un rapport de nettoyage
   * @param {Array<string>} originalUrls - URLs originales
   * @param {Array<string>} cleanedUrls - URLs après nettoyage
   * @returns {Object} - Rapport détaillé
   */
  generateReport(originalUrls, cleanedUrls) {
    const removedCount = originalUrls.length - cleanedUrls.length;
    
    // Analyse des suppresions par catégorie
    let filesRemoved = 0;
    let languageNormalized = 0;
    let duplicatesRemoved = 0;
    
    originalUrls.forEach(url => {
      if (this.isExcludedFile(url)) filesRemoved++;
      if (this.languagePrefixes.some(prefix => url.includes(prefix))) languageNormalized++;
    });
    
    const uniqueOriginal = new Set(originalUrls.map(url => this.cleanSingleUrl(url) || url));
    duplicatesRemoved = originalUrls.length - uniqueOriginal.size;
    
    return {
      original: originalUrls.length,
      cleaned: cleanedUrls.length,
      removed: removedCount,
      categories: {
        filesRemoved,
        languageNormalized,
        duplicatesRemoved
      },
      reductionRate: ((removedCount / originalUrls.length) * 100).toFixed(1) + '%'
    };
  }
}
