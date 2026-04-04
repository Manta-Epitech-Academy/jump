import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { resolve } from '$app/paths';

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
  const expectedState = cookies.get('camper_state');
  const expectedVerifier = cookies.get('camper_verifier');

  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');

  const redirectURL = new URL(resolve('/camper/oauth/callback'), url).href;
  const loginPath = resolve('/camper/login');

  if (!state || !expectedState || state !== expectedState) {
    throw redirect(303, `${loginPath}?error=OAuthStateMismatch`);
  }

  const authMethods = await locals.studentPb
    .collection('students')
    .listAuthMethods();
  const providers = authMethods.oauth2?.providers || [];
  const provider = providers.find((p) => p.name === 'microsoft');

  if (!provider) {
    throw redirect(303, `${loginPath}?error=ProviderMissing`);
  }

  try {
    const authData = await locals.studentPb
      .collection('students')
      .authWithOAuth2Code(
        provider.name,
        code!,
        expectedVerifier!,
        redirectURL,
        // Placeholder values for required fields when PocketBase auto-creates a student record
        {
          nom: '_pending',
          prenom: '_pending',
        },
      );

    // Defense in depth: verify domain even if Azure is single-tenant
    const email = authData.record.email || authData.meta?.email || '';

    if (!email.endsWith('@epitech.eu')) {
      try {
        await locals.systemPb.collection('students').delete(authData.record.id);
      } catch (delErr) {
        console.error('Failed to delete unauthorized student record:', delErr);
      }
      locals.studentPb.authStore.clear();
      throw redirect(303, `${loginPath}?error=UnauthorizedDomain`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    const raw = authData.meta?.rawUser;

    // Replace placeholders with real Microsoft Graph values
    if (
      raw?.surname &&
      (!authData.record.nom || authData.record.nom === '_pending')
    ) {
      updateData.nom = raw.surname;
    }
    if (
      raw?.givenName &&
      (!authData.record.prenom || authData.record.prenom === '_pending')
    ) {
      updateData.prenom = raw.givenName;
    }

    // Fetch avatar from Microsoft Graph API
    if (!authData.record.avatar) {
      try {
        const response = await fetch(
          'https://graph.microsoft.com/v1.0/me/photo/$value',
          {
            headers: {
              Authorization: `Bearer ${authData.meta?.accessToken}`,
            },
          },
        );

        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const type = response.headers.get('content-type') || 'image/jpeg';
          const ext = type.includes('png') ? 'png' : 'jpg';
          updateData.avatar = new File([buffer], `avatar.${ext}`, { type });
        }
      } catch (imgErr) {
        console.error('Failed to download Microsoft avatar:', imgErr);
      }
    }

    if (Object.keys(updateData).length > 0) {
      await locals.studentPb
        .collection('students')
        .update(authData.record.id, updateData);
    }
  } catch (err) {
    if (err instanceof Response) throw err;

    console.error('Student OAuth Exchange Failed:', err);
    throw redirect(303, `${loginPath}?error=OAuthFailed`);
  }

  const clearOptions = { path: '/', secure: !dev, sameSite: 'lax' as const };
  cookies.delete('camper_state', clearOptions);
  cookies.delete('camper_verifier', clearOptions);

  throw redirect(303, resolve('/camper'));
};
