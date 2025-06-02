import axios from 'axios';

/**
 * Notificateur Slack pour erreurs 404
 * Envoie des notifications uniquement en cas d'erreurs 404 détectées
 */
export class SlackNotifier {
  constructor() {
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL;
    this.channel = process.env.SLACK_CHANNEL || '#tech-alerts';
    this.username = 'Stereolabs Link Checker';
    this.iconEmoji = ':broken_link:';
  }

  /**
   * Envoie une notification des erreurs 404 détectées
   * @param {Array<Object>} errors404 - Liste des erreurs 404
   * @param {Object} scanStats - Statistiques du scan
   * @returns {Promise<boolean>} - Succès de l'envoi
   */
  async notifyErrors404(errors404, scanStats) {
    if (!this.webhookUrl) {
      console.warn('⚠️ SLACK_WEBHOOK_URL non configuré - notification ignorée');
      return false;
    }

    if (!errors404 || errors404.length === 0) {
      console.log('✅ Aucune erreur 404 à notifier');
      return false;
    }

    console.log(`📱 Envoi notification Slack - ${errors404.length} erreurs 404`);

    try {
      const message = this.buildMessage(errors404, scanStats);
      
      await axios.post(this.webhookUrl, {
        channel: this.channel,
        username: this.username,
        icon_emoji: this.iconEmoji,
        ...message
      });

      console.log('✅ Notification Slack envoyée avec succès');
      return true;

    } catch (error) {
      console.error('❌ Erreur envoi notification Slack:', error.message);
      return false;
    }
  }

  /**
   * Construit le message Slack formaté
   * @param {Array<Object>} errors404 - Erreurs 404
   * @param {Object} scanStats - Statistiques du scan
   * @returns {Object} - Message Slack formaté
   */
  buildMessage(errors404, scanStats) {
    const internalErrors = errors404.filter(e => e.isInternal);
    const externalErrors = errors404.filter(e => !e.isInternal);
    
    // Message principal
    const text = `🚨 *${errors404.length} liens morts détectés* sur Stereolabs.com`;
    
    // Construction des blocs de contenu
    const blocks = [
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": "🔍 Rapport Link Checker Stereolabs"
        }
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `🚨 *${errors404.length} erreurs 404 détectées*\n📊 Pages scannées: ${scanStats.pagesScanned}\n🔗 Liens vérifiés: ${scanStats.linksChecked}\n⏱️ Durée: ${scanStats.duration || 'N/A'}`
        }
      },
      {
        "type": "divider"
      }
    ];

    // Section erreurs internes
    if (internalErrors.length > 0) {
      blocks.push({
        "type": "section",
        "text": {
          "type": "mrkdwn", 
          "text": `*🏠 Erreurs internes: ${internalErrors.length}*`
        }
      });

      // Limite à 5 erreurs internes max pour éviter le spam
      const displayedInternal = internalErrors.slice(0, 5);
      displayedInternal.forEach(error => {
        blocks.push({
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": `• <${error.url}|${this.truncateUrl(error.url)}>\n  📍 Trouvé sur: <${error.foundOn}|${this.getPageTitle(error.foundOn)}>\n  📝 Texte: "${error.linkText || 'N/A'}"\n  📍 Ligne: ${error.position?.line || 'N/A'}`
          }
        });
      });

      if (internalErrors.length > 5) {
        blocks.push({
          "type": "context",
          "elements": [
            {
              "type": "plain_text", 
              "text": `... et ${internalErrors.length - 5} autres erreurs internes`
            }
          ]
        });
      }
    }

    // Section erreurs externes
    if (externalErrors.length > 0) {
      blocks.push({
        "type": "divider"
      });
      
      blocks.push({
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `*🌍 Erreurs externes: ${externalErrors.length}*`
        }
      });

      // Groupement par domaine pour les externes
      const externalByDomain = this.groupByDomain(externalErrors);
      
      Object.entries(externalByDomain).slice(0, 3).forEach(([domain, domainErrors]) => {
        const errorList = domainErrors.slice(0, 3).map(error => 
          `• <${error.url}|${this.truncateUrl(error.url)}>`
        ).join('\n');
        
        blocks.push({
          "type": "section", 
          "text": {
            "type": "mrkdwn",
            "text": `*${domain}* (${domainErrors.length})\n${errorList}`
          }
        });
      });
    }

    // Footer avec actions
    blocks.push({
      "type": "divider"
    });
    
    blocks.push({
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "🌐 Voir le site"
          },
          "url": "https://www.stereolabs.com"
        },
        {
          "type": "button", 
          "text": {
            "type": "plain_text",
            "text": "📊 Dashboard Vercel"
          },
          "url": "https://vercel.com/dashboard"
        }
      ]
    });

    blocks.push({
      "type": "context",
      "elements": [
        {
          "type": "plain_text",
          "text": `🤖 Scan automatique • ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`
        }
      ]
    });

    return {
      text,
      blocks
    };
  }

  /**
   * Envoie un message de test vers Slack
   * @returns {Promise<boolean>} - Succès du test
   */
  async sendTestMessage() {
    if (!this.webhookUrl) {
      throw new Error('SLACK_WEBHOOK_URL non configuré');
    }

    try {
      await axios.post(this.webhookUrl, {
        channel: this.channel,
        username: this.username,
        icon_emoji: this.iconEmoji,
        text: '✅ Test de connexion Stereolabs Link Checker',
        blocks: [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "✅ *Test de connexion réussi!*\n\nLe Link Checker Stereolabs est correctement configuré et peut envoyer des notifications."
            }
          }
        ]
      });

      return true;
    } catch (error) {
      throw new Error(`Test Slack échoué: ${error.message}`);
    }
  }

  /**
   * Utilitaires pour le formatage
   */
  
  truncateUrl(url, maxLength = 60) {
    if (url.length <= maxLength) return url;
    const urlObj = new URL(url);
    return urlObj.hostname + urlObj.pathname.substring(0, maxLength - urlObj.hostname.length - 3) + '...';
  }

  getPageTitle(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.split('/').filter(Boolean).pop() || 'accueil';
    } catch {
      return 'page inconnue';
    }
  }

  groupByDomain(errors) {
    const grouped = {};
    errors.forEach(error => {
      try {
        const domain = new URL(error.url).hostname;
        if (!grouped[domain]) grouped[domain] = [];
        grouped[domain].push(error);
      } catch {}
    });
    return grouped;
  }

  /**
   * Envoie un récapitulatif périodique (usage futur)
   * @param {Object} weeklySummary - Résumé hebdomadaire
   * @returns {Promise<boolean>}
   */
  async sendWeeklySummary(weeklySummary) {
    if (!this.webhookUrl) return false;

    const message = {
      channel: this.channel,
      username: this.username,
      icon_emoji: ':chart_with_upwards_trend:',
      text: '📊 Résumé hebdomadaire Link Checker',
      blocks: [
        {
          "type": "header",
          "text": {
            "type": "plain_text", 
            "text": "📊 Résumé Hebdomadaire - Link Checker"
          }
        },
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": `🔍 Scans effectués: ${weeklySummary.totalScans}\n🔗 Liens vérifiés: ${weeklySummary.totalLinksChecked}\n❌ Erreurs 404 totales: ${weeklySummary.total404Errors}\n📈 Taux de succès moyen: ${weeklySummary.averageSuccessRate}`
          }
        }
      ]
    };

    try {
      await axios.post(this.webhookUrl, message);
      return true;
    } catch (error) {
      console.error('❌ Erreur envoi résumé hebdomadaire:', error.message);
      return false;
    }
  }
}
