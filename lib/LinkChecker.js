import axios from 'axios';
import { LinkExtractor } from './LinkExtractor.js';
import { sleep, formatDuration, processConcurrent } from './utils.js';

/**
 * Vérificateur de liens principal
 * Teste la validité de chaque lien et détecte les erreurs 404
 */
export class LinkChecker {
  constructor() {
    this.extractor = new LinkExtractor();
    this.timeout = parseInt(process.env.REQUEST_TIMEOUT) || 10000;
    this.maxConcurrent = parseInt(process.env.MAX_CONCURRENT_CHECKS) || 10;
    this.userAgent = 'SterelabsLinkChecker/1.0 (Internal SEO Tool)';
    
    // Compteurs de statistiques
    this.stats = {
      pagesScanned: 0,
      linksChecked: 0,
      errors404: 0,
      errorsOther: 0,
      timeouts: 0,
      startTime: Date.now()
    };

    // Configuration axios par défaut
    this.axiosConfig = {
      timeout: this.timeout,
      maxRedirects: 5,
      validateStatus: () => true, // On veut tous les status codes
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache'
      }
    };
  }

  /**
   * Scanne une page et vérifie tous ses liens
   * @param {string} pageUrl - URL de la page à scanner
   * @returns {Promise<Object>} - Résultats du scan de la page
   */
  async scanSinglePage(pageUrl) {
    console.log(`📄 Scan page: ${pageUrl}`);
    
    try {
      // 1. Récupération HTML de la page
      const pageResponse = await axios.get(pageUrl, this.axiosConfig);
      
      if (pageResponse.status !== 200) {
        console.warn(`⚠️ Page status ${pageResponse.status}:`, pageUrl);
        return {
          pageUrl,
          accessible: false,
          status: pageResponse.status,
          error: `Page returned status ${pageResponse.status}`,
          links: [],
          checkedLinks: []
        };
      }

      // 2. Extraction des liens
      const links = this.extractor.extractLinks(pageResponse.data, pageUrl);
      
      // 3. Filtrage des liens à vérifier (exclut ancres, mailto, etc.)
      const linksToCheck = links.filter(link => 
        link.url.startsWith('http') && 
        !link.url.includes('#') &&
        !link.originalHref.startsWith('mailto:') &&
        !link.originalHref.startsWith('tel:')
      );

      console.log(`🔍 Page ${pageUrl}: ${linksToCheck.length} liens à vérifier`);

      // 4. Vérification des liens par batch
      const checkedLinks = await this.checkLinksInBatch(linksToCheck);
      
      // 5. Statistiques de la page
      const pageStats = this.generatePageStats(links, checkedLinks);
      
      this.stats.pagesScanned++;
      this.stats.linksChecked += checkedLinks.length;

      return {
        pageUrl,
        accessible: true,
        status: pageResponse.status,
        links: links,
        checkedLinks: checkedLinks,
        stats: pageStats,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Erreur scan page ${pageUrl}:`, error.message);
      
      return {
        pageUrl,
        accessible: false,
        error: error.message,
        links: [],
        checkedLinks: [],
        timestamp: new Date().toISOString()
      };
    }
  }

   /**
   * Vérifie une liste de liens par batch pour optimiser la performance
   * @param {Array<Object>} links - Liens à vérifier
   * @returns {Promise<Array<Object>>} - Liens vérifiés avec leur statut
   */
  async checkLinksInBatch(links) {
    if (links.length === 0) return [];

    console.log(`🔍 Vérification de ${links.length} liens par batch de ${this.maxConcurrent}`);

    const results = await processConcurrent(
      links, 
      link => this.checkSingleLink(link),
      this.maxConcurrent
    );

    // Traitement des résultats
    const checkedLinks = results.map(result => {
      if (result.success) {
        return result.result;
      } else {
        // Erreur de vérification
        return {
          ...result.item,
          status: 'error',
          statusCode: 0,
          error: result.result?.message || 'Erreur inconnue',
          responseTime: 0,
          timestamp: new Date().toISOString()
        };
      }
    });

    return checkedLinks;
  }

  /**
   * Vérifie un lien individuel
   * @param {Object} link - Objet lien avec métadonnées
   * @returns {Promise<Object>} - Lien avec statut de vérification
   */
  async checkSingleLink(link) {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(link.url, this.axiosConfig);
      const responseTime = Date.now() - startTime;
      
      // Classification du statut
      let status = 'ok';
      if (response.status === 404) {
        status = 'broken';
        this.stats.errors404++;
      } else if (response.status >= 400) {
        status = 'warning';
        this.stats.errorsOther++;
      }

      return {
        ...link,
        status,
        statusCode: response.status,
        responseTime,
        contentType: response.headers['content-type'],
        lastModified: response.headers['last-modified'],
        timestamp: new Date().toISOString(),
        // Additionnel pour le debug
        redirected: response.request.res?.responseUrl !== link.url,
        finalUrl: response.request.res?.responseUrl || link.url
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Classification des erreurs
      let status = 'error';
      let statusCode = 0;
      
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        status = 'timeout';
        this.stats.timeouts++;
      } else if (error.response) {
        statusCode = error.response.status;
        if (statusCode === 404) {
          status = 'broken';
          this.stats.errors404++;
        } else if (statusCode >= 400) {
          status = 'warning'; 
          this.stats.errorsOther++;
        }
      } else {
        this.stats.errorsOther++;
      }

      return {
        ...link,
        status,
        statusCode,
        responseTime,
        error: error.message,
        errorCode: error.code,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Lance le scan complet d'une liste d'URLs
   * @param {Array<string>} urls - URLs à scanner
   * @returns {Promise<Object>} - Résultats complets du scan
   */
  async scanWebsite(urls) {
    console.log(`🚀 Début scan complet - ${urls.length} pages à analyser`);
    this.resetStats();
    
    const results = {
      startTime: new Date().toISOString(),
      totalPages: urls.length,
      pages: [],
      summary: {
        totalLinks: 0,
        errors404: [],
        errorsOther: [],
        timeouts: []
      }
    };

    // Scan de chaque page avec pause pour éviter surcharge serveur
    let pageIndex = 0;
    for (const url of urls) {
      pageIndex++;
      console.log(`📊 Progression: ${pageIndex}/${urls.length} (${((pageIndex/urls.length)*100).toFixed(1)}%)`);
      
      const pageResult = await this.scanSinglePage(url);
      results.pages.push(pageResult);
      
      // Compilation des erreurs 404 uniquement
      if (pageResult.checkedLinks) {
        pageResult.checkedLinks.forEach(link => {
          results.summary.totalLinks++;
          
          if (link.status === 'broken' && link.statusCode === 404) {
            results.summary.errors404.push({
              url: link.url,
              foundOn: link.foundOn,
              linkText: link.linkText,
              position: link.position,
              isInternal: link.isInternal
            });
          }
        });
      }
      
      // Pause entre pages pour être respectueux
      if (pageIndex < urls.length) {
        await sleep(500); // 500ms entre chaque page
      }
    }

    // Finalisation des résultats
    results.endTime = new Date().toISOString();
    results.duration = formatDuration(this.stats.startTime);
    results.stats = { ...this.stats };
    
    console.log(`✅ Scan terminé! ${results.summary.errors404.length} erreurs 404 détectées`);
    
    return results;
  }

  /**
   * Génère les statistiques d'une page
   * @param {Array<Object>} allLinks - Tous les liens extraits
   * @param {Array<Object>} checkedLinks - Liens vérifiés
   * @returns {Object} - Statistiques de la page
   */
  generatePageStats(allLinks, checkedLinks) {
    const stats = {
      totalLinksFound: allLinks.length,
      linksChecked: checkedLinks.length,
      internal: checkedLinks.filter(l => l.isInternal).length,
      external: checkedLinks.filter(l => !l.isInternal).length,
      ok: checkedLinks.filter(l => l.status === 'ok').length,
      broken: checkedLinks.filter(l => l.status === 'broken').length,
      warnings: checkedLinks.filter(l => l.status === 'warning').length,
      errors: checkedLinks.filter(l => l.status === 'error').length,
      timeouts: checkedLinks.filter(l => l.status === 'timeout').length
    };
    
    stats.successRate = stats.linksChecked > 0 
      ? ((stats.ok / stats.linksChecked) * 100).toFixed(1) + '%'
      : '0%';
      
    return stats;
  }

  /**
   * Remet à zéro les statistiques
   */
  resetStats() {
    this.stats = {
      pagesScanned: 0,
      linksChecked: 0,
      errors404: 0,
      errorsOther: 0,
      timeouts: 0,
      startTime: Date.now()
    };
  }

  /**
   * Filtre uniquement les erreurs 404 des résultats
   * @param {Object} scanResults - Résultats complets du scan
   * @returns {Array<Object>} - Uniquement les erreurs 404
   */
  extractErrors404Only(scanResults) {
    return scanResults.summary.errors404.filter(error => 
      error.statusCode === 404 // Double vérification
    );
  }

  /**
   * Génère un rapport résumé des erreurs 404
   * @param {Array<Object>} errors404 - Liste des erreurs 404
   * @returns {Object} - Rapport formaté
   */
  generateErrorReport(errors404) {
    const report = {
      totalErrors: errors404.length,
      internalErrors: errors404.filter(e => e.isInternal).length,
      externalErrors: errors404.filter(e => !e.isInternal).length,
      errorsByPage: {},
      errorsByDomain: {}
    };

    // Groupement par page où l'erreur a été trouvée
    errors404.forEach(error => {
      const page = error.foundOn;
      if (!report.errorsByPage[page]) {
        report.errorsByPage[page] = [];
      }
      report.errorsByPage[page].push(error);

      // Groupement par domaine de l'erreur
      try {
        const domain = new URL(error.url).hostname;
        if (!report.errorsByDomain[domain]) {
          report.errorsByDomain[domain] = [];
        }
        report.errorsByDomain[domain].push(error);
      } catch {}
    });

    return report;
  }
}
