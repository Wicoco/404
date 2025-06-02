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
    this.languagePrefixes = ['/en/', '/fr/', '/de/', '/es/', '/it/', '/ja/', '/zh/', '/ko/'];
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
