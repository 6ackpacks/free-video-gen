import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

let configured = false;

export function configureNetwork() {
  if (configured) return;
  configured = true;
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY) {
    setGlobalDispatcher(new EnvHttpProxyAgent());
  }
}
