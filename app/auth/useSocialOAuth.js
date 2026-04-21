import { useState } from 'react';

import { useOAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';

const PROVIDERS = {
  facebook: 'oauth_facebook',
  google: 'oauth_google',
};

const getProviderLabel = (provider) => (provider === 'facebook' ? 'Facebook' : 'Google');

const useSocialOAuth = () => {
  const router = useRouter();
  const [activeProvider, setActiveProvider] = useState(null);
  const { startOAuthFlow: startGoogleOAuthFlow } = useOAuth({ strategy: PROVIDERS.google });
  const { startOAuthFlow: startFacebookOAuthFlow } = useOAuth({ strategy: PROVIDERS.facebook });

  const startOAuth = async (provider) => {
    const startOAuthFlow =
      provider === 'facebook' ? startFacebookOAuthFlow : startGoogleOAuthFlow;

    setActiveProvider(provider);

    try {
      const { createdSessionId, setActive } = await startOAuthFlow();

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace('/');
      }
    } catch (error) {
      console.error(`Failed to complete ${getProviderLabel(provider)} OAuth flow:`, error);
    } finally {
      setActiveProvider(null);
    }
  };

  return {
    activeProvider,
    startOAuth,
  };
};

export default useSocialOAuth;