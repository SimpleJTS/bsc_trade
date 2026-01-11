const { ethers } = require('ethers');

// 配置部分 - 只需修改这里👇
const config = {
    // 🔐 你的私钥（去掉0x前缀）
    PRIVATE_KEY: '',
    
    // 🌐 BSC RPC端点
    RPC_URL: 'https://bsc.publicnode.com',
    
    // 🪙 要购买的Meme代币合约地址（这里用BSC上的PEPE示例）
    MEME_TOKEN_ADDRESS: '0x1a5f9d77ca46646cd4937fd8d093f460b66f4444',
    
    // 💰 购买金额（BNB数量）
    BUY_AMOUNT_BNB: '0.01', // 购买0.01 BNB的Meme币
    
    // 📉 滑点容忍度（%）
    SLIPPAGE: 2.0 // 2%
};

async function buyMeme() {
    console.log('🚀 开始购买Meme币...\n');
    
    try {
        // 1. 连接到BSC
        const provider = new ethers.JsonRpcProvider(config.RPC_URL);
        const wallet = new ethers.Wallet(config.PRIVATE_KEY, provider);
        
        console.log(`✅ 连接成功`);
        console.log(`👛 地址: ${wallet.address}`);
        
        // 2. 检查BNB余额
        const balance = await provider.getBalance(wallet.address);
        console.log(`💰 BNB余额: ${ethers.formatEther(balance)} BNB\n`);
        
        // 3. PancakeSwap V2路由器地址（BSC主网）
        const pancakeRouterAddress = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
        
        // 4. PancakeSwap Router ABI（只包含需要的函数）
        // 完整的 PancakeSwap Router ABI（包含getAmountsOut函数）
        const PANCAKE_ROUTER_ABI = [
            // 读取函数
            "function getAmountsOut(uint256 amountIn, address[] memory path) public view returns (uint256[] memory amounts)",
            "function getAmountsIn(uint256 amountOut, address[] memory path) public view returns (uint256[] memory amounts)",
            
            // 交易函数
            "function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)",
            "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
            "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
            
            // WETH函数
            "function WETH() external pure returns (address)",
            
            // 添加流动性
            "function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)"
        ];
        
        // 创建路由器合约实例
        const router = new ethers.Contract(
            pancakeRouterAddress, 
            PANCAKE_ROUTER_ABI, 
            wallet
        );
        
        // 5. 交易路径：BNB -> WBNB -> MEME代币
        const path = [
            '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB地址
            config.MEME_TOKEN_ADDRESS                     // Meme代币地址
        ];
        
        // 6. 获取预估能得到的代币数量
        const amounts = await router.getAmountsOut(
            ethers.parseEther(config.BUY_AMOUNT_BNB),
            path
        );
        
        const expectedTokens = amounts[1];
        console.log(`🎯 预计收到: ${ethers.formatUnits(expectedTokens, 18)} 代币`);
        
        // 7. 计算最小输出（考虑滑点）
        const minTokens = expectedTokens * 97n / 100n;
        console.log(`📉 最小接收（${config.SLIPPAGE}%滑点）: ${ethers.formatUnits(minTokens, 18)} 代币\n`);
        
        // 8. 设置交易截止时间（当前时间+10分钟）
        const deadline = Math.floor(Date.now() / 1000) + 600;
        
        // 9. 发送交易
        console.log('🔄 正在发送交易...');
        const tx = await router.swapExactETHForTokens(
            minTokens,              // 最小输出代币数量
            path,                   // 交易路径
            wallet.address,         // 接收地址
            deadline,               // 截止时间
            {
                value: ethers.parseEther(config.BUY_AMOUNT_BNB),
                gasLimit: 300000,    // Gas限制
                gasPrice: await provider.getFeeData().gasPrice // Gas价格
            }
        );
        
        console.log(`✅ 交易已发送！`);
        console.log(`📊 交易哈希: ${tx.hash}`);
        console.log(`🔗 BscScan: https://bscscan.com/tx/${tx.hash}\n`);
        
        console.log('⏳ 等待确认...');
        const receipt = await tx.wait();
        
        console.log(`🎉 购买成功！`);
        console.log(`📈 区块: ${receipt.blockNumber}`);
        console.log(`⛽ Gas费用: ${ethers.formatEther(receipt.gasUsed.mul(receipt.effectiveGasPrice))} BNB`);
        
    } catch (error) {
        console.error('❌ 购买失败:', error.message);
        console.error('详细错误:', error);
    }
}

// 运行购买函数
buyMeme();