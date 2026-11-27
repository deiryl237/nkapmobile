# NkapSDK v1.2 — Multi-Channel Linguistic & Visual Overlay SDK

Couche SDK légère (**0 dépendance**) qui consomme le protocole canonique `NkapTurn v1.2` (`docs/02-architecture-interfaces.md`) et s'adapte à tout canal financier : **Web Banking**, **Mobile Banking**, **USSD (`*123#`)**, **GAB/ATM** et **SMS**.

## Intégration en 3 lignes (Web / WebView / Simulateur)

```html
<script src="https://13.51.168.107.sslip.io/sdk/nkap-sdk.js"></script>
<script>
  const nkap = NkapSDK.mount({
    channel: "auto", // "web" | "mobile" | "ussd" | "atm" | "sms"
    lang: "ewo",
    apiUrl: "https://13.51.168.107.sslip.io",
    onChoice: (choice) => console.log("Clarification choisie:", choice),
  });
</script>
```

## Architecture découplée

| Couche | Fichiers | Rôle |
|---|---|---|
| **Core (0 DOM)** | `src/core/{geometry,layout,rules,protocol}.js` | Géométrie manuscrite, placeur anti-collision (`findBestSpot`), `AmountGuard v1.2`, budget `≤ 3` marques, normaliseur `actions[]`/`beats[]` |
| **HostAdapter** | `src/adapters/dom-adapter.js` | Détection auto de canal, extraction `ScreenContext` sans aucun champ de saisie/PIN, résolution `node_id` & `match_text` |
| **SurfaceRenderer** | `src/renderers/svg-renderer.js` | Gestes `circle`, `box`, `underline`, `arrow`, `frame`, `write`, `callout`, `num`, `highlight`, `strike`, `check`, `cross`, `edit` + Ardoise 5 modes (`lines`, `flow`, `bars`, `table`, `choices`) |
| **TextRenderer** | `src/renderers/text-renderer.js` | Projection GSM-7 stricte (`≤ 182` septets USSD / `≤ 160` septets SMS) |

## Build & synchronisation

```bash
node nkap-sdk/build.mjs
```

Génère automatiquement :
- `nkap-sdk/dist/nkap-sdk.js`
- `nkap-extension/vendor/nkap-sdk.js` (injecté par l'extension Chrome sans modifier le code source cible)
- `cerveau/static/sdk/nkap-sdk.js` (servi en HTTPS sur `/sdk/nkap-sdk.js`)
