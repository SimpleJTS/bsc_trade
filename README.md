# BSC Quick Trade

A Chrome extension for fast meme coin trading on BSC (Binance Smart Chain).

## Features

- **Quick Buy**: One-click buy with preset BNB amounts
- **Quick Sell**: One-click sell with preset percentages
- **Floating Panel**: Always visible in the bottom-right corner
- **Private Key Wallet**: Secure AES-256 encrypted storage
- **Auto DEX Routing**: Automatically selects best route (PancakeSwap V2/V3)
- **Customizable Presets**: Set your own buy amounts and sell percentages

## Installation

### Development Build

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

### Development Mode

```bash
npm run dev
```

This will watch for file changes and rebuild automatically.

## Usage

1. **Import Wallet**: Click extension icon → Enter private key and password
2. **Configure Presets**: Go to Trading tab to customize buy/sell amounts
3. **Trade**:
   - Navigate to BSCScan, DexScreener, or Axiom
   - Paste token contract address in the floating panel
   - Click buy/sell buttons to trade

## Supported Websites

- BSCScan (bscscan.com)
- DexScreener (dexscreener.com)
- DexTools (dextools.io)
- Axiom (axiom.trade)

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Buy Amounts | Preset BNB amounts for quick buy | 0.05, 0.1, 0.2, 0.5 |
| Sell Percentages | Preset % for quick sell | 25%, 50%, 75%, 100% |
| Slippage | Slippage tolerance | 12% |
| Gas Price | Gas price in Gwei | 5 |
| RPC URL | BSC RPC endpoint | bsc-dataseed1.binance.org |

## Security

- Private keys are encrypted with AES-256-GCM
- Keys are never stored in plain text
- Password required to unlock wallet
- All data stored locally in Chrome storage

## Tech Stack

- Preact + TypeScript
- Vite
- ethers.js v6
- Chrome Extension Manifest V3

## License

MIT
