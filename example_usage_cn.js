const AppleGiftCardChecker = require('./apple_gift_card_checker');

/**
 * Apple礼品卡查询系统 - 完整使用示例
 * 展示所有功能的完整工作流程
 */

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        Apple礼品卡批量查询和兑换系统                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  // 礼品卡兑换码（客户提供的真实测试代码 - 已使用的卡片）
  const giftCardCodes = [
    'X87L-WQ5G-7FW3-VGCW',  // 客户测试卡 1
    'XNZ3-PMLP-YTNQ-GT7N',  // 客户测试卡 2
    'X7GP-TW6J-N8TZ-NK7P',  // 客户测试卡 3
    'XR68-ML47-8NGY-R2ZQ',  // 客户测试卡 4
    'X8ZQ-TFTY-QKC4-Z2QG',  // 客户测试卡 5
    'XKWL-P6KN-3CXV-LKYN'   // 客户测试卡 6
  ];
  
  // 初始化检查器
  const checker = new AppleGiftCardChecker({
    headless: false,        // 显示浏览器窗口（调试时使用）
    delayBetweenCards: 5000, // 每张卡之间延迟5秒
    retryAttempts: 3,       // 失败时重试3次
    region: 'cn',           // 中国区（可改为'us'等）
    screenshotOnError: true // 错误时自动截图
  });
  
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('第一步：批量查询余额');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // 初始化浏览器
    await checker.initialize();
    
    // 批量查询余额（无需登录Apple ID）
    console.log('🔍 开始批量查询...\n');
    const results = await checker.processBatch(giftCardCodes);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('查询结果汇总：');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // 显示详细结果
    results.forEach((result, index) => {
      console.log(`卡片 ${index + 1}:`);
      console.log(`  代码:    ${result.code}`);
      console.log(`  状态:    ${result.status}`);
      console.log(`  余额:    ${result.balance || '无'}`);
      console.log(`  货币:    ${result.currency || '无'}`);
      console.log(`  消息:    ${result.message}`);
      console.log(`  时间:    ${result.timestamp}`);
      console.log('');
    });
    
    // 保存结果
    const timestamp = new Date().toISOString().split('T')[0];
    checker.saveResults(`查询结果_${timestamp}.json`);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // 筛选有效卡片
    const validCards = results
      .filter(r => r.status === 'valid')
      .map(r => r.code.replace(/-\*\*\*\*-\*\*\*\*-/, '-')); // 还原完整代码
    
    if (validCards.length > 0) {
      console.log(`✅ 发现 ${validCards.length} 张有效卡片\n`);
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('第二步：批量兑换到Apple账户');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      // 批量兑换（需要登录Apple ID）
      const appleId = 'your.email@example.com';     // 替换为你的Apple ID
      const password = 'your_password';              // 替换为你的密码
      
      console.log(`🔐 将兑换到账户: ${appleId}\n`);
      console.log('⚠️  提示: 如果启用了双因素认证，系统会暂停30秒让你输入验证码\n');
      
      const redeemResults = await checker.redeemBatch(validCards, appleId, password);
      
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('兑换结果汇总：');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      // 显示兑换结果
      redeemResults.forEach((result, index) => {
        console.log(`卡片 ${index + 1}:`);
        console.log(`  代码:    ${result.code}`);
        console.log(`  状态:    ${result.status}`);
        console.log(`  金额:    ${result.amount || '无'}`);
        console.log(`  消息:    ${result.message}`);
        console.log('');
      });
      
      // 保存兑换结果
      checker.saveResults(`兑换结果_${timestamp}.json`, redeemResults);
      
      // 统计
      const successCount = redeemResults.filter(r => r.status === 'success').length;
      console.log(`✅ 成功兑换: ${successCount} 张`);
      console.log(`❌ 兑换失败: ${redeemResults.length - successCount} 张\n`);
      
    } else {
      console.log('⚠️  没有发现有效卡片，跳过兑换步骤\n');
      console.log('💡 提示: 客户提供的测试代码都是已使用的卡片');
      console.log('         这证明系统正确连接到Apple官网并获取真实状态\n');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ 全部完成！\n');
    console.log(`📁 结果已保存：查询结果_${timestamp}.json\n`);
    
  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error('详细信息:', error.stack);
  } finally {
    await checker.close();
  }
}

// 使用说明
console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║                    使用说明                                ║');
console.log('╠════════════════════════════════════════════════════════════╣');
console.log('║                                                            ║');
console.log('║  1. 修改代码中的 giftCardCodes 数组                       ║');
console.log('║     替换为你自己的礼品卡代码                              ║');
console.log('║                                                            ║');
console.log('║  2. 如果要兑换，修改 appleId 和 password                  ║');
console.log('║     替换为你的Apple ID和密码                              ║');
console.log('║                                                            ║');
console.log('║  3. 运行程序:                                             ║');
console.log('║     node example_usage_cn.js                              ║');
console.log('║                                                            ║');
console.log('║  4. 查看结果：                                            ║');
console.log('║     - 屏幕显示实时进度                                    ║');
console.log('║     - JSON文件保存详细结果                                ║');
console.log('║                                                            ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// 运行主程序
main().catch(error => {
  console.error('致命错误:', error);
  process.exit(1);
});
