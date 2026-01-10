// BSC Chain Configuration
export const BSC_CHAIN_ID = 56;
export const BSC_RPC_URL = 'https://bsc-dataseed1.binance.org';
export const BSC_RPC_URLS = [
  'https://bsc-dataseed1.binance.org',
  'https://bsc-dataseed2.binance.org',
  'https://bsc-dataseed3.binance.org',
  'https://bsc-dataseed4.binance.org',
];

// Token Addresses
export const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
export const BUSD_ADDRESS = '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56';
export const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';

// PancakeSwap Addresses
export const PANCAKE_ROUTER_V2 = '0x10ED43C718714eb63d5aA57B78B54917d185c6F';
export const PANCAKE_ROUTER_V3 = '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4';
export const PANCAKE_FACTORY_V2 = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';
export const PANCAKE_FACTORY_V3 = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
export const PANCAKE_QUOTER_V3 = '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997';

// Default Settings
export const DEFAULT_SLIPPAGE = 12; // 12%
export const DEFAULT_GAS_LIMIT = 300000;
export const DEFAULT_BUY_AMOUNTS = [0.05, 0.1, 0.2, 0.5];
export const DEFAULT_SELL_PERCENTAGES = [25, 50, 75, 100];
export const DEFAULT_GAS_PRICE_GWEI = 5;

// ABI Fragments
export const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

export const PANCAKE_ROUTER_V2_ABI = [
  'function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)',
  'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable',
  'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)',
];

export const PANCAKE_QUOTER_V3_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

export const PANCAKE_ROUTER_V3_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
  'function multicall(uint256 deadline, bytes[] calldata data) payable returns (bytes[] memory)',
  'function unwrapWETH9(uint256 amountMinimum, address recipient)',
];
