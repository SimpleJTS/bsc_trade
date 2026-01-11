// BSC Chain Configuration
export const BSC_CHAIN_ID = 56;
export const BSC_RPC_URL = 'https://bsc-dataseed1.binance.org';

// 交易专用 RPC（仅用于发送交易，不用于查询）
export const TRANSACTION_RPC_URL = 'https://falling-radial-flower.bsc.quiknode.pro/ef3bb65ed44e46da1cc8d6ec74b123fcde75f7a0/';

// 多个可靠的 BSC RPC 节点（按优先级排序，使用免费的公共节点，用于查询操作）
export const BSC_RPC_URLS = [
  'https://bsc-dataseed1.binance.org',
  'https://bsc-dataseed2.binance.org',
  'https://bsc-dataseed3.binance.org',
  'https://bsc-dataseed4.binance.org',
  'https://bsc-dataseed1.defibit.io',
  'https://bsc-dataseed2.defibit.io',
  'https://bsc.publicnode.com',
  'https://rpc.ankr.com/bsc',
  'https://1rpc.io/bnb',
  'https://bsc-mainnet.public.blastapi.io'
];

// Token Addresses
export const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
export const BUSD_ADDRESS = '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56';
export const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';

// PancakeSwap Addresses
// 注意：使用用户测试过的 Router 地址
export const PANCAKE_ROUTER_V2 = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
export const PANCAKE_ROUTER_V3 = '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4';
export const PANCAKE_FACTORY_V2 = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';
export const PANCAKE_FACTORY_V3 = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
export const PANCAKE_QUOTER_V3 = '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997';

// Four.meme Launchpad Addresses
export const FOURMEME_LAUNCHPAD = '0x5c952063c7fc8610ffdb798152D69F0B9550762b';
// 阈值：如果 launchpad 持有的 token > 这个值 → 未毕业（调整根据 token totalSupply，通常 1e8+ 安全）
export const UNGRADUATED_THRESHOLD = 100000000n; // 1e8 BigInt

// Default Settings
export const DEFAULT_SLIPPAGE = 12; // 12%
export const DEFAULT_GAS_LIMIT = 500000;
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
  // 读取函数
  'function getAmountsOut(uint256 amountIn, address[] memory path) public view returns (uint256[] memory amounts)',
  'function getAmountsIn(uint256 amountOut, address[] memory path) public view returns (uint256[] memory amounts)',
  
  // 标准交易函数（参考 buy_meme.js，适用于大多数代币）
  'function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
  
  // 支持转账税的函数（用于有转账税的代币，备用）
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

export const PANCAKE_FACTORY_V2_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
];

// Four.meme Launchpad ABI
export const FOURMEME_LAUNCHPAD_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'funds', type: 'uint256' },
      { internalType: 'uint256', name: 'minAmount', type: 'uint256' },
    ],
    name: 'buyTokenAMAP',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'sellToken',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];
