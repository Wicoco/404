import { SitemapFetcher } from '../lib/SitemapFetcher.js';
import { SitemapCleaner } from '../lib/SitemapCleaner.js';
import { LinkChecker } from '../lib/LinkChecker.js';
import { SlackNotifier } from '../lib/SlackNotifier.js';

/**
 * API Endpoint principal pour la vérification des liens
 * Endpoint: /api/check-links
 * Méthodes: GET, POST
 */
export default async function handler(request, response) {
  // Headers CORS pour tests depuis navigateur
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  console.log('🚀 Début vérification liens Stereolabs.com');
  console.log('📊 Méthode:', request.method);
  console.log('📊 Query params:', request.query);

  try {
    // Configuration
    const sitemapUrl = request.query.sitemap || process.env.SITEMAP_URL || 'https://www.stereolabs.com/sitemap.xml';
    const notifySlack = request.query.notify !== 'true'; // Par défaut true
    const maxPages = request.query.maxPages ? parseInt(request.query.maxPages) : null; // Limite pour tests
    
    console.log('📡 Sitemap configuré:', sitemapUrl);
    console.log('📱 Notifications Slack:', notifySlack ? 'activées' : 'désactivées');

    // Étape 1: Récupération du sitemap
    console.log('📡 Étape 1/4: Récupération sitemap...');
    const fetcher = new SitemapFetcher();
    const rawUrls = await fetcher.fetchSitemap(sitemapUrl);
    
    if (rawUrls.length === 0) {
      throw new Error('Aucune URL trouvée dans le sitemap');
    }

    // Étape 2: Épuration du sitemap
    console.log('🧹 Étape 2/4: Épuration sitemap...');
    const cleaner = new SitemapCleaner();
    const cleanUrls = cleaner.process(rawUrls);
    const cleaningReport = cleaner.generateReport(rawUrls, cleanUrls);
    
    console.log('📊 Rapport épuration:', cleaningReport);

    // Limitation pour tests
    const urlsToScan = maxPages ? cleanUrls.slice(0, maxPages) : cleanUrls;
    
    if (maxPages) {
      console.log(`🧪 Mode test: scan limité à ${maxPages} pages`);
    }

    // Étape 3: Scan des liens
    console.log('🔍 Étape 3/4: Scan des liens...');
    const checker = new LinkChecker();
    const scanResults = await checker.scanWebsite(urlsToScan);

    // Extraction des erreurs 404 uniquement
    const errors404 = scanResults.summary.errors404;
    
    // Étape 4: Notification Slack si erreurs 404
    let notificationSent = false;
    if (notifySlack && errors404.length > 0) {
      console.log('📱 Étape 4/4: Envoi notification Slack...');
      const notifier = new SlackNotifier();
      notificationSent = await notifier.notifyErrors404(errors404, scanResults.stats);
    } else if (errors404.length === 0) {
      console.log('✅ Étape 4/4: Aucune erreur 404 - pas de notification');
    } else {
      console.log('⏭️ Étape 4/4: Notifications désactivées');
    }

    // Réponse finale
    const finalResults = {
      success: true,
      timestamp: new Date().toISOString(),
      scan: {
        sitemapUrl,
        originalUrls: rawUrls.length,
        cleanedUrls: cleanUrls.length,
        scannedUrls: urlsToScan.length,
        cleaningReport
      },
      results: {
        duration: scanResults.duration,
        totalLinksChecked: scanResults.summary.totalLinks,
        errors404Count: errors404.length,
        errors404,
        stats: scanResults.stats
      },
      notification: {
        enabled: notifySlack,
        sent: notificationSent,
        errors404Count: errors404.length
      }
    };

    // Réponse différenciée selon présence erreurs
    if (errors404.length > 0) {
      console.log(`🚨 SCAN TERMINÉ: ${errors404.length} erreurs 404 détectées`);
      response.status(200).json(finalResults);
    } else {
      console.log('✅ SCAN TERMINÉ: Aucune erreur 404, site sain!');
      response.status(200).json(finalResults);
    }

  } catch (error) {
    console.error('❌ Erreur critique lors du scan:', error);
    
    // Notification d'erreur technique vers Slack
    if (process.env.SLACK_WEBHOOK_URL) {
      try {
        const notifier = new SlackNotifier();
        await notifier.notifyTechnicalError(error, request);
      } catch (slackError) {
        console.error('❌ Erreur notification Slack également:', slackError.message);
      }
    }
    
    response.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
