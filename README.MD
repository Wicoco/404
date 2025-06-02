# 🔍 Stereolabs Link Checker

Système automatisé de vérification des liens pour le site Stereolabs.com. Détecte et notifie uniquement les erreurs 404 via Slack.

## 🎯 Fonctionnalités

- ✅ **Récupération automatique** du sitemap public Stereolabs
- 🧹 **Épuration intelligente** des variantes linguistiques et médias
- 🔍 **Scan exhaustif** de tous les liens (internes + externes)
- 🎯 **Détection précise** des erreurs 404 avec localisation HTML
- 📱 **Notifications Slack** uniquement en cas d'erreurs 404
- ⏰ **Automatisation quotidienne** via cron Vercel

## 🏗️ Architecture

```
api/
├── check-links.js    # Endpoint scan manuel
├── cron.js          # Automation quotidienne (8h UTC)
lib/
├── SitemapFetcher.js   # Récupération sitemap public
├── SitemapCleaner.js   # Épuration langue/docs/images
├── LinkChecker.js     # Scanner principal avec métadonnées
├── LinkExtractor.js   # Extraction liens HTML précise
├── SlackNotifier.js   # Notifications 404 uniquement
└── utils.js          # Utilitaires communs
```

## 🚀 Installation

### 1. Cloner et installer
```bash
git clone <repo-url>
cd stereolabs-link-checker
npm install
```

### 2. Configuration environnement
```bash
cp .env.example .env
# Éditer .env avec vos vraies valeurs
```

### 3. Configuration Slack
1. Créer webhook Slack: https://api.slack.com/messaging/webhooks
2. Ajouter URL dans `SLACK_WEBHOOK_URL`

### 4. Déploiement Vercel
```bash
npm run deploy
```

## 📊 Workflow Complet

### Processus Automatique (Quotidien à 8h UTC)

1. **📡 Récupération** → `https://www.stereolabs.com/sitemap.xml`
2. **🧹 Épuration** → Supprime `/en/`, `/fr/`, `.pdf`, images, etc.
3. **🔍 Extraction** → Tous liens de chaque page avec position HTML
4. **✅ Vérification** → Test HTTP de chaque lien
5. **📱 Notification** → Slack SI et SEULEMENT SI erreurs 404

### Épuration Sitemap

- 🌍 **Langues**: Supprime `/en/`, `/fr/`, `/de/`, etc. → garde version canonique
- 📄 **Documents**: Exclut `.pdf`, `.doc`, `.xls`, etc.  
- 🖼️ **Médias**: Exclut images, vidéos, CSS, JS
- 🔄 **Déduplication**: URLs normalisées et uniques

### Détection Links

- 🔗 **Elements**: `<a href>`, `<img src>`, `<iframe src>`
- 📍 **Localisation**: Numéro ligne, contexte HTML, attributs
- ⚡ **Performance**: Concurrent processing, timeouts intelligents
- 🎯 **Précision**: Status codes exacts, redirections trackées

## 🔧 Utilisation

### Interface Manuelle
```
https://your-deployment.vercel.app/api/manual
```

### API Programmatique
```bash
# Scan complet
curl https://your-deployment.vercel.app/api/check-links

# Scan pages spécifiques
curl -X POST https://your-deployment.vercel.app/api/check-links \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://www.stereolabs.com/page1", "https://www.stereolabs.com/page2"]}'
```

### Logs Cron
```bash
# Via Vercel CLI
vercel logs --follow
```

## 📱 Notifications Slack

### Format Notification 404
```
🚨 LIEN(S) CASSÉ(S) DÉTECTÉ(S) - Stereolabs.com

📊 Résumé:
• 3 erreurs 404 critiques
• 45 pages scannées  
• 1,247 liens vérifiés
• Temps: 2m 34s

🔗 Détails erreurs:
❌ https://stereolabs.com/broken-page
   └📍 Trouvé sur: /products/cameras
   └📍 Ligne ~45: <a href="/broken-page">Voir détails</a>

❌ https://external-site.com/missing
   └📍 Trouvé sur: /partners  
   └📍 Ligne ~78: <a href="https://external-site.com/missing">Partenaire</a>

🔗 Interface: https://your-app.vercel.app/api/manual
```

### Pas de Notification Si
- ✅ Aucune erreur 404 détectée
- ⚠️ Seulement erreurs 5xx, timeouts ou warnings
- 🔄 Redirections (3xx) considérées OK
