// Background service worker for BSC Quick Trade

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_POPUP') {
    // Open extension popup - note: this doesn't work directly,
    // but we can open the options page or a new tab
    chrome.action.openPopup?.() || chrome.windows.create({
      url: chrome.runtime.getURL('src/popup/index.html'),
      type: 'popup',
      width: 380,
      height: 520,
    });
  }

  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get(['bsc_trade_settings'], (result) => {
      sendResponse(result.bsc_trade_settings || null);
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set({ bsc_trade_settings: message.settings }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Extension install/update handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('BSC Quick Trade installed');

    // Set default settings
    chrome.storage.local.get(['bsc_trade_settings'], (result) => {
      if (!result.bsc_trade_settings) {
        chrome.storage.local.set({
          bsc_trade_settings: {
            buyAmounts: [0.05, 0.1, 0.2, 0.5],
            sellPercentages: [25, 50, 75, 100],
            slippage: 12,
            gasPriceGwei: 5,
            rpcUrl: 'https://bsc-dataseed1.binance.org',
          },
        });
      }
    });
  }
});

// Keep service worker alive
chrome.runtime.onConnect.addListener((port) => {
  console.log('Port connected:', port.name);
});

export {};
