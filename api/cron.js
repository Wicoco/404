import { SitemapFetcher } from '../lib/SitemapFetcher.js';
import { SitemapCleaner } from '../lib/SitemapCleaner.js';
import { LinkChecker } from '../lib/LinkChecker.js';
import { SlackNotifier } from '../lib/SlackNotifier.js';

/**
 * Endpoint Vercel Cron - Exécution automatique quotidienne
 * Scan complet du site Stereolabs et notification uniquement si erreurs 404
 * Configuration: Exécution tous les jours à 8h UTC
 */
export default async function handler(request, response) {
  const startTime = Date.now();
  console.log('⏰ CRON - Début scan automatique quotidien:', new Date().toISOString());

  // Verification autorisation cron (sécurité Vercel)
  const authHeader = request.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return response.status(401).json({
      success: false,
      error: 'Non autorisé - token cron invalide',
      timestamp: new Date().toISOString()
    });
  }

  try {
    // Configuration pour scan automatique optimisé
    const config = {
      sitemapUrl: process.env.SITEMAP_URL || 'https://www.stereolabs.com/sitemap.xml',
      maxPagesLimit: 50, // Limite pages pour cron (éviter timeout)
      maxConcurrent: 5,  // Connexions simultanées réduites
      timeout: 15000,    // Timeout réduit pour cron
      retries: 1         // Moins de retries pour cron
    };

    console.log('🚀 Configuration cron:', config);

    // === ÉTAPE 1: RÉCUPÉRATION SITEMAP ===
    console.log('📡 [1/5] Récupération sitemap...');
    const fetcher = new SitemapFetcher();
    const rawUrls = await fetcher.fetchSitemap(config.sitemapUrl);
    
    if (rawUrls.length === 0) {
      throw new Error('Aucune URL trouvée dans le sitemap');
    }

    // === ÉTAPE 2: ÉPURATION SITEMAP ===
    console.log('🧹 [2/5] Épuration sitemap...');
    const cleaner = new SitemapCleaner();
    const cleanUrls = cleaner.process(rawUrls);
    
    console.log(`📊 Sitemap épuré: ${rawUrls.length} → ${cleanUrls.length} URLs`);

    // Limitation pour cron (éviter timeouts Vercel)
    const urlsToScan = cleanUrls.slice(0, config.maxPagesLimit);
    if (urlsToScan.length < cleanUrls.length) {
      console.log(`⚠️ CRON: Limitation à ${config.maxPagesLimit} pages (total: ${cleanUrls.length})`);
    }

    // === ÉTAPE 3: SCAN DES LIENS ===
    console.log('🔍 [3/5] Scan des liens...');
    const checker = new LinkChecker({
      maxConcurrent: config.maxConcurrent,
      timeout: config.timeout,
      retries: config.retries,
      userAgent: 'Stereolabs-LinkChecker-Cron/1.0'
    });

    const scanResults = await checker.scanWebsite(urlsToScan);

    // === ÉTAPE 4: ANALYSE RÉSULTATS ===
    console.log('📊 [4/5] Analyse des résultats...');
    const analysis = generateCronAnalysis(scanResults, {
      originalSitemapSize: rawUrls.length,
      cleanedSitemapSize: cleanUrls.length,
      scannedPages: urlsToScan.length,
      executionTime: Date.now() - startTime
    });

    // === ÉTAPE 5: NOTIFICATION ===
    console.log('📱 [5/5] Notifications...');
    let notificationResult = { sent: false, reason: 'no-errors-404' };

    // Notification UNIQUEMENT si erreurs 404 détectées
    const errors404 = scanResults.summary.errors404;
    if (errors404.length > 0) {
      console.log(`🚨 ${errors404.length} erreurs 404 détectées → Envoi notification Slack`);
      
      if (process.env.SLACK_WEBHOOK_URL) {
        const notifier = new SlackNotifier();
        const notified = await notifier.notifyCronResults(analysis, errors404);
        notificationResult = { 
          sent: notified, 
          reason: notified ? 'errors-404-found' : 'slack-error',
          errorsCount: errors404.length 
        };
      } else {
        console.warn('⚠️ SLACK_WEBHOOK_URL non configuré - pas de notification');
        notificationResult = { sent: false, reason: 'no-slack-config' };
      }
    } else {
      console.log('✅ Aucune erreur 404 détectée → pas de notification');
    }

    // === RÉPONSE SUCCÈS ===
    const cronResult = {
      success: true,
      mode: 'cron-daily',
      timestamp: new Date().toISOString(),
      executionTime: Date.now() - startTime,
      sitemap: {
        original: rawUrls.length,
        cleaned: cleanUrls.length,
        scanned: urlsToScan.length,
        skipped: cleanUrls.length - urlsToScan.length
      },
      scan: {
        duration: scanResults.duration,
        pagesScanned: scanResults.stats.pagesScanned,
        pagesSuccessful: scanResults.stats.pagesSuccessful,
        pagesError: scanResults.stats.pagesError,
        linksTotal: scanResults.stats.linksChecked,
        linksInternal: scanResults.stats.linksInternal,
        linksExternal: scanResults.stats.linksExternal
      },
      results: {
        errors404: errors404.length,
        errorsOther: scanResults.summary.errorsOther.length,
        warnings: scanResults.summary.warnings.length,
        timeouts: scanResults.stats.timeouts
      },
      notification: notificationResult,
      performance: {
        avgPageScanTime: Math.round(scanResults.duration / scanResults.stats.pagesScanned),
        avgLinkCheckTime: Math.round((scanResults.duration / scanResults.stats.linksChecked) * 1000),
        errorRate: ((errors404.length / scanResults.stats.linksChecked) * 100).toFixed(2) + '%'
      }
    };

    console.log('✅ CRON terminé avec succès:', {
      duration: cronResult.executionTime + 'ms',
      pages: cronResult.scan.pagesScanned,
      links: cronResult.scan.linksTotal,
      errors404: cronResult.results.errors404,
      notified: cronResult.notification.sent
    });

    response.status(200).json(cronResult);

  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error('❌ ERREUR CRON:', error.message);
    console.error(error.stack);

    // Notification d'erreur technique critique en cron
    try {
      if (process.env.SLACK_WEBHOOK_URL) {
        const notifier = new SlackNotifier();
        await notifier.notifyCronError(error, {
          startTime: new Date(startTime).toISOString(),
          executionTime,
          stage: detectErrorStage(error),
          environment: 'production-cron'
        });
      }
    } catch (notifError) {
      console.error('❌ Erreur notification erreur cron:', notifError.message);
    }

    // Réponse d'erreur
    response.status(500).json({
      success: false,
      mode: 'cron-daily',
      error: {
        message: error.message,
        type: error.constructor.name,
        stage: detectErrorStage(error)
      },
      timestamp: new Date().toISOString(),
      executionTime
    });
  }
}

/**
 * Génère une analyse complète pour le rapport cron
 * @param {Object} scanResults - Résultats du scan
 * @param {Object} metadata - Métadonnées du scan
 * @returns {Object} - Analyse formatée pour cron
 */
function generateCronAnalysis(scanResults, metadata) {
  const analysis = {
    // Informations générales
    scan: {
      timestamp: new Date().toISOString(),
      executionTime: metadata.executionTime,
      mode: 'daily-cron',
      version: '1.0'
    },

    // Statistiques sitemap
    sitemap: {
      originalSize: metadata.originalSitemapSize,
      cleanedSize: metadata.cleanedSitemapSize,
      scannedSize: metadata.scannedPages,
      reductionRate: (((metadata.originalSitemapSize - metadata.cleanedSitemapSize) / metadata.originalSitemapSize) * 100).toFixed(1) + '%',
      scanCoverage: ((metadata.scannedPages / metadata.cleanedSitemapSize) * 100).toFixed(1) + '%'
    },

    // Résultats de scan
    results: {
      pages: {
        total: scanResults.stats.pagesScanned,
        successful: scanResults.stats.pagesSuccessful,
        failed: scanResults.stats.pagesError,
        successRate: ((scanResults.stats.pagesSuccessful / scanResults.stats.pagesScanned) * 100).toFixed(1) + '%'
      },
      links: {
        total: scanResults.stats.linksChecked,
        internal: scanResults.stats.linksInternal,
        external: scanResults.stats.linksExternal,
        errors404: scanResults.summary.errors404.length,
        errorsOther: scanResults.summary.errorsOther.length,
        warnings: scanResults.summary.warnings.length,
        timeouts: scanResults.stats.timeouts,
        successRate: (((scanResults.stats.linksChecked - scanResults.summary.errors404.length - scanResults.summary.errorsOther.length) / scanResults.stats.linksChecked) * 100).toFixed(1) + '%'
      }
    },

    // Performance
    performance: {
      avgPageTime: Math.round(scanResults.duration / scanResults.stats.pagesScanned),
      avgLinkTime: Math.round((scanResults.duration / scanResults.stats.linksChecked) * 1000), // en ms
      throughput: {
        pagesPerMinute: Math.round((scanResults.stats.pagesScanned / (scanResults.duration / 1000)) * 60),
        linksPerMinute: Math.round((scanResults.stats.linksChecked / (scanResults.duration / 1000)) * 60)
      }
    },

    // Tendances (pour analyses futures)
    health: {
      status: scanResults.summary.errors404.length === 0 ? 'healthy' : 'issues-detected',
      errorRate: ((scanResults.summary.errors404.length / scanResults.stats.linksChecked) * 100).toFixed(2) + '%',
      criticalIssues: scanResults.summary.errors404.length,
      minorIssues: scanResults.summary.warnings.length
    }
  };

  return analysis;
}

/**
 * Détecte à quelle étape l'erreur s'est produite
 * @param {Error} error - Erreur capturée
 * @returns {string} - Stage où l'erreur s'est produite
 */
function detectErrorStage(error) {
  const message = error.message.toLowerCase();
  
  if (message.includes('sitemap') || message.includes('xml')) {
    return 'sitemap-fetch';
  } else if (message.includes('clean') || message.includes('épuration')) {
    return 'sitemap-cleaning';
  } else if (message.includes('scan') || message.includes('link')) {
    return 'link-scanning';
  } else if (message.includes('slack') || message.includes('notification')) {
    return 'notification';
  } else if (message.includes('timeout') || message.includes('vercel')) {
    return 'infrastructure';
  }
  
  return 'unknown';
}

/**
 * Méthode utilitaire pour logging structuré en cron
 * @param {string} level - Niveau de log
 * @param {string} message - Message
 * @param {Object} data - Données additionnelles
 */
function cronLog(level, message, data = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    source: 'cron-daily',
    message,
    ...data
  };
  
  if (level === 'error') {
    console.error(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
}
