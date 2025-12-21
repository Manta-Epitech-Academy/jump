import type { Handle } from '@sveltejs/kit';
import { createInstance } from '$lib/pocketbase';

export const handle: Handle = async ({ event, resolve }) => {
	// 1. Instancier PocketBase pour cette requête spécifique
	event.locals.pb = createInstance();

	// 2. Charger le cookie d'auth depuis la requête
	// S'il n'y a pas de cookie, loadFromCookie gère une chaîne vide proprement.
	event.locals.pb.authStore.loadFromCookie(event.request.headers.get('cookie') || '');

	// 3. Valider le token et rafraîchir l'état si nécessaire
	try {
		// isValid vérifie la structure du token et l'expiration locale
		if (event.locals.pb.authStore.isValid) {
			// Optionnel mais recommandé : authRefresh() vérifie auprès de la DB si l'user est toujours valide (pas banni, etc.)
			await event.locals.pb.collection('users').authRefresh();
			event.locals.user = event.locals.pb.authStore.record;
		} else {
			event.locals.user = null;
		}
	} catch (_) {
		// Si authRefresh échoue (token invalide côté serveur), on nettoie
		event.locals.pb.authStore.clear();
		event.locals.user = null;
	}

	// 4. Résoudre la réponse (le rendu de la page se fait ici)
	const response = await resolve(event);

	// 5. Mettre à jour le cookie côté client
	// "httpOnly: false" permet au SDK JS client (si utilisé dans les pages) de lire le token aussi.
	// C'est nécessaire si tu veux utiliser pb.collection(...).subscribe côté client.
	response.headers.set(
		'set-cookie',
		event.locals.pb.authStore.exportToCookie({ httpOnly: false, secure: false })
		// Note: mets secure: true en production
	);

	return response;
};
