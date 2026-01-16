const AppleGiftCardChecker = require('./apple_gift_card_checker');
const fs = require('fs');
const readline = require('readline');

/**
 * CSV批量处理器 - 真实Apple礼品卡查询
 * CSV Batch Processor - Real Apple Gift Card Checker
 */

async function processCSV(csvFile) {
  console.log('🎯 Apple礼品卡批量查询系统');
  console.log('═══════════════════════════════════════\n');
  
  // 读取CSV文件
  const codes = [];
  const fileStream = fs.createReadStream(csvFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber++;
    
    // 跳过空行和标题行
    if (lineNumber === 1 || !line.trim()) continue;
    
    // 解析CSV (只需要一个字段: 兑换码)
    const code = line.split(',')[0].trim().replace(/"/g, '');
    
    if (code && code.length > 8) {
      codes.push(code);
    }
  }
  
  console.log(`📋 已加载 ${codes.length} 张礼品卡\n`);
  
  if (codes.length === 0) {
    console.error('❌ CSV文件中没有有效的兑换码');
    process.exit(1);
  }
  
  // 初始化查询器
  const checker = new AppleGiftCardChecker({
    headless: true, // 生产环境使用headless模式
    delayBetweenCards: 5000, // 5秒延迟,避免被封
    retryAttempts: 3,
    region: 'cn' // 中国区
  });
  
  try {
    // 初始化浏览器
    await checker.initialize();
    
    // 批量处理
    const results = await checker.processBatch(codes);
    
    // 保存结果
    const timestamp = new Date().toISOString().split('T')[0];
    checker.saveResults(`apple_results_${timestamp}.json`);
    
    console.log('\n✅ 处理完成!');
    
  } catch (error) {
    console.error('\n❌ 处理失败:', error.message);
    process.exit(1);
  } finally {
    await checker.close();
  }
}

// 命令行参数
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Apple礼品卡批量查询系统');
  console.log('═══════════════════════════════════════\n');
  console.log('使用方法:');
  console.log('  node csv_processor.js <CSV文件>\n');
  console.log('CSV文件格式:');
  console.log('  code');
  console.log('  XXXX-XXXX-XXXX-XXXX');
  console.log('  YYYY-YYYY-YYYY-YYYY\n');
  console.log('示例:');
  console.log('  node csv_processor.js gift_cards.csv\n');
  process.exit(0);
}

const csvFile = args[0];

if (!fs.existsSync(csvFile)) {
  console.error(`❌ 文件不存在: ${csvFile}`);
  process.exit(1);
}

// 开始处理
processCSV(csvFile).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
