import axios from 'axios';
import xml2js from 'xml2js';

/**
 * Récupérateur de sitemap depuis URL publique
 * Spécialisé pour Stereolabs.com
 */
export class SitemapFetcher {
  constructor() {
    this.timeout = parseInt(process.env.REQUEST_TIMEOUT) || 10000;
    this.userAgent = 'SterelabsLinkChecker/1.0 (Internal SEO Tool)';
  }

  /**
   * Récupère et parse le sitemap depuis une URL publique
   * @param {string} sitemapUrl - URL du sitemap XML
   * @returns {Promise<Array<string>>} - Liste des URLs trouvées
   */
  async fetchSitemap(sitemapUrl) {
    console.log('📡 Récupération sitemap depuis:', sitemapUrl);
    
    try {
      // Récupération du XML
      const response = await axios.get(sitemapUrl, {
        timeout: this.timeout,
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/xml, text/xml, */*'
        }
      });

      console.log('✅ Sitemap téléchargé:', response.data.length, 'caractères');
      
      // Parse XML vers objet JavaScript
      const parser = new xml2js.Parser({
        explicitArray: false,
        ignoreAttrs: false,
        trim: true
      });
      
      const parsedXml = await parser.parseStringPromise(response.data);
      
      // Extraction des URLs selon le format du sitemap
      let urls = [];
      
      if (parsedXml.urlset && parsedXml.urlset.url) {
        // Sitemap standard
        const urlEntries = Array.isArray(parsedXml.urlset.url) 
          ? parsedXml.urlset.url 
          : [parsedXml.urlset.url];
        
        urls = urlEntries.map(entry => {
          if (typeof entry === 'string') return entry;
          if (typeof entry === 'object' && entry.loc) {
            return typeof entry.loc === 'string' ? entry.loc : entry.loc._;
          }
          return null;
        }).filter(Boolean);
        
      } else if (parsedXml.sitemapindex && parsedXml.sitemapindex.sitemap) {
        // Index de sitemaps - récupère tous les sous-sitemaps
        console.log('🔍 Index de sitemaps détecté, récupération des sous-sitemaps...');
        
        const sitemaps = Array.isArray(parsedXml.sitemapindex.sitemap)
          ? parsedXml.sitemapindex.sitemap
          : [parsedXml.sitemapindex.sitemap];
        
        for (const sitemap of sitemaps) {
          const sitemapUrl = typeof sitemap.loc === 'string' ? sitemap.loc : sitemap.loc._;
          console.log('📡 Récupération sous-sitemap:', sitemapUrl);
          
          try {
            const subUrls = await this.fetchSitemap(sitemapUrl);
            urls.push(...subUrls);
          } catch (error) {
            console.error('❌ Erreur récupération sous-sitemap:', sitemapUrl, error.message);
          }
        }
      }

      // Validation et nettoyage
      const validUrls = urls
        .filter(url => url && typeof url === 'string')
        .filter(url => url.startsWith('http'))
        .map(url => url.trim());

      console.log('✅ URLs extraites du sitemap:', validUrls.length);
      return validUrls;

    } catch (error) {
      console.error('❌ Erreur récupération sitemap:', error.message);
      throw new Error(`Impossible de récupérer le sitemap depuis ${sitemapUrl}:  $ {error.message}`);
    }
  }

  /**
   * Vérifie la validité d'un sitemap sans le télécharger entièrement
   * @param {string} sitemapUrl - URL à vérifier
   * @returns {Promise<Object>} - Statut de la vérification
   */
  async validateSitemap(sitemapUrl) {
    try {
      const response = await axios.head(sitemapUrl, {
        timeout: 5000,
        headers: { 'User-Agent': this.userAgent }
      });

      return {
        valid: true,
        status: response.status,
        contentType: response.headers['content-type'],
        size: response.headers['content-length']
      };

    } catch (error) {
      return {
        valid: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }
}
