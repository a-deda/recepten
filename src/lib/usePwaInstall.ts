import { useEffect, useState } from 'react';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Install-prompt (§9). Manifest plus deze knop, meer niet — geen service
 * worker en geen offline in v1: dat is een aparte klus met eigen bugs.
 *
 * Op iOS bestaat dit event niet; daar is "Zet op beginscherm" de weg, en dan
 * verschijnt de knop gewoon niet.
 */
export function usePwaInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    function vang(e: Event) {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    }
    window.addEventListener('beforeinstallprompt', vang);
    return () => window.removeEventListener('beforeinstallprompt', vang);
  }, []);

  return {
    kanInstalleren: prompt !== null,
    installeer: async () => {
      if (!prompt) return;
      await prompt.prompt();
      await prompt.userChoice;
      setPrompt(null);
    },
  };
}
