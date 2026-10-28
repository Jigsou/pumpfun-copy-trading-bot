# Simulateur (paper trading)

Ce script NE SIGNE RIEN et N'ENVOIE AUCUNE TRANSACTION. Il n'a pas besoin de cle privee.
Si quelque chose te demande une cle privee ici, arrete.

## Lancer
1. A la racine du projet : `npm install`
2. `cp paper/.env.example paper/.env` puis ouvre paper/.env et colle ta cle Helius.
3. `node paper/paper-trader.mjs`
4. Laisse tourner. Ctrl+C affiche le resume. Les logs sont dans paper/logs/ (events.jsonl, trades.jsonl).

## Ce qu'il fait
- Ecoute le wallet cible (Helius WebSocket gratuit).
- Quand la cible achete un token Pump.fun, il attend EXTRA_DELAY_MS (ton delai suppose), lit le prix reel de la courbe, et calcule ce que TU aurais paye (frais 1 % et couts inclus).
- Quand la cible vend, il simule ta vente apres le meme delai. Sinon, sortie apres TIMEOUT_MIN minutes.

## Limites
- Les tokens deja passes sur PumpSwap ne sont pas simules.
- Le prix de la cible est approximatif (frais et loyer de compte inclus dans son depense SOL).
- Teste avec EXTRA_DELAY_MS=1000, 2000 et 3000 pour voir la sensibilite au delai.
