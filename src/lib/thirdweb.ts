import { createThirdwebClient } from 'thirdweb';
import { darkTheme, lightTheme } from 'thirdweb/react';
import { createWallet, inAppWallet, walletConnect } from 'thirdweb/wallets';

export const thirdwebClient = createThirdwebClient({
  clientId: import.meta.env.VITE_THIRDWEB_CLIENT_ID ?? '',
});

export const wallets = [
  createWallet('com.coinbase.wallet'),
  createWallet('io.metamask'),
  walletConnect(),
  inAppWallet({
    auth: {
      options: ['google', 'apple', 'email', 'phone', 'discord'],
      mode: 'redirect',
    },
  }),
];

export const getConnectTheme = (mode: 'light' | 'dark') =>
  mode === 'dark'
    ? darkTheme({
        colors: {
          accentText: '#09111f',
          connectedButtonBg: '#e8f1ff',
          connectedButtonBgHover: '#d7e6fb',
          primaryButtonBg: '#92f4cf',
          primaryButtonText: '#102037',
          primaryText: '#f6f8fc',
          secondaryText: '#b4c2dd',
          modalBg: '#0f1728',
          separatorLine: '#223250',
        },
      })
    : lightTheme({
        colors: {
          accentText: '#0b2340',
          connectedButtonBg: '#f9fdff',
          connectedButtonBgHover: '#ebf5ff',
          primaryButtonBg: '#0f6bff',
          primaryButtonText: '#f8fbff',
          primaryText: '#102037',
          secondaryText: '#4f607d',
          modalBg: '#ffffff',
          separatorLine: '#dce7f6',
        },
      });
