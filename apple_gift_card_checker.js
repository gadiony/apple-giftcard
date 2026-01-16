const puppeteer = require('puppeteer');
const fs = require('fs');

/**
 * 真实的Apple礼品卡批量查询系统
 * Real Apple Gift Card Batch Checker
 * 
 * 使用Apple官方网站: https://secure.store.apple.com/cn/shop/gift-cards/balance
 * Uses Apple's official website for balance checking
 */

class AppleGiftCardChecker {
  constructor(config = {}) {
    this.config = {
      headless: config.headless !== false,
      delayBetweenCards: config.delayBetweenCards || 3000,
      retryAttempts: config.retryAttempts || 3,
      timeout: config.timeout || 30000,
      region: config.region || 'cn', // cn, us, etc.
      screenshotOnError: config.screenshotOnError !== false
    };
    
    this.browser = null;
    this.results = [];
  }

  async initialize() {
    console.log('🚀 启动浏览器...');
    
    this.browser = await puppeteer.launch({
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080'
      ]
    });
    
    console.log('✅ 浏览器已启动');
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('🔒 浏览器已关闭');
    }
  }

  /**
   * 查询单张礼品卡余额
   * Check single gift card balance
   * @param {string} code - 16位兑换码 (16-character redemption code)
   */
  async checkBalance(code, attempt = 1) {
    const page = await this.browser.newPage();
    
    try {
      console.log(`\n🔍 查询卡片: ${this.maskCode(code)} (尝试 ${attempt}/${this.config.retryAttempts})`);
      
      // 设置用户代理
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // 访问Apple礼品卡余额查询页面
      const url = `https://secure.store.apple.com/${this.config.region}/shop/gift-cards/balance`;
      console.log(`📱 访问: ${url}`);
      
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: this.config.timeout
      });
      
      // 等待页面加载
      await page.waitForTimeout(2000);
      
      // 查找输入框
      console.log('🔎 查找输入框...');
      
      // Apple使用的可能选择器
      const possibleSelectors = [
        'input[name="giftCardNumber"]',
        'input[id="giftCardNumber"]',
        'input[type="text"]',
        'input[placeholder*="code"]',
        'input[placeholder*="卡"]',
        'input[aria-label*="card"]'
      ];
      
      let inputField = null;
      for (const selector of possibleSelectors) {
        try {
          inputField = await page.$(selector);
          if (inputField) {
            console.log(`✅ 找到输入框: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!inputField) {
        // 尝试通过页面内容查找
        const inputs = await page.$$('input[type="text"]');
        if (inputs.length > 0) {
          inputField = inputs[0];
          console.log('✅ 使用第一个文本输入框');
        }
      }
      
      if (!inputField) {
        throw new Error('无法找到礼品卡输入框');
      }
      
      // 输入兑换码
      console.log('⌨️ 输入兑换码...');
      await inputField.click();
      await page.waitForTimeout(500);
      await inputField.type(code, { delay: 100 });
      
      // 查找并点击查询按钮
      console.log('🔘 查找查询按钮...');
      const submitSelectors = [
        'button[type="submit"]',
        'button:contains("查询")',
        'button:contains("Check")',
        'button:contains("余额")',
        '.button-submit',
        '#submit-button'
      ];
      
      let submitted = false;
      for (const selector of submitSelectors) {
        try {
          const button = await page.$(selector);
          if (button) {
            await button.click();
            console.log(`✅ 点击按钮: ${selector}`);
            submitted = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!submitted) {
        // 尝试按回车提交
        console.log('⏎ 按回车提交...');
        await page.keyboard.press('Enter');
      }
      
      // 等待结果
      console.log('⏳ 等待结果...');
      await page.waitForTimeout(3000);
      
      // 获取页面内容进行分析
      const pageText = await page.evaluate(() => document.body.innerText);
      const pageHTML = await page.content();
      
      // 解析结果
      const result = this.parseBalanceResult(pageText, pageHTML, code);
      
      console.log(`📊 结果: ${result.status} - 余额: ${result.balance || 'N/A'}`);
      
      // 调试截图
      if (this.config.screenshotOnError || !this.config.headless) {
        await page.screenshot({ 
          path: `screenshots/check_${Date.now()}.png`,
          fullPage: true 
        });
      }
      
      await page.close();
      return result;
      
    } catch (error) {
      console.error(`❌ 错误: ${error.message}`);
      
      // 错误截图
      if (this.config.screenshotOnError) {
        try {
          await page.screenshot({ 
            path: `screenshots/error_${Date.now()}.png`,
            fullPage: true 
          });
        } catch (e) {
          console.error('截图失败');
        }
      }
      
      await page.close();
      
      // 重试逻辑
      if (attempt < this.config.retryAttempts) {
        console.log(`🔄 ${this.config.retryDelay}ms后重试...`);
        await this.delay(5000);
        return this.checkBalance(code, attempt + 1);
      }
      
      return {
        code: this.maskCode(code),
        status: '错误',
        balance: null,
        currency: null,
        message: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 解析余额查询结果
   */
  parseBalanceResult(pageText, pageHTML, code) {
    const result = {
      code: this.maskCode(code),
      status: '未知',
      balance: null,
      currency: null,
      message: null,
      timestamp: new Date().toISOString()
    };
    
    // 检查错误消息
    const errorPatterns = [
      /无效|invalid|incorrect/i,
      /不存在|not found/i,
      /已.*兑换|already.*redeemed/i,
      /过期|expired/i,
      /错误|error/i
    ];
    
    for (const pattern of errorPatterns) {
      if (pattern.test(pageText)) {
        if (/已.*兑换|already.*redeemed/i.test(pageText)) {
          result.status = '已兑换';
          result.message = '此礼品卡已被兑换';
        } else {
          result.status = '无效';
          result.message = '卡号无效或有误';
        }
        return result;
      }
    }
    
    // 检查余额
    // 中文格式: ¥100.00, 100元, 100.00元
    const cnBalancePatterns = [
      /¥\s*(\d+\.?\d*)/,
      /(\d+\.?\d*)\s*元/,
      /余额.*?(\d+\.?\d*)/,
      /balance.*?(\d+\.?\d*)/i
    ];
    
    // 美元格式: $100.00, USD 100.00
    const usBalancePatterns = [
      /\$\s*(\d+\.?\d*)/,
      /USD\s*(\d+\.?\d*)/i,
      /(\d+\.?\d*)\s*USD/i
    ];
    
    // 尝试中文格式
    for (const pattern of cnBalancePatterns) {
      const match = pageText.match(pattern);
      if (match) {
        result.status = '有效';
        result.balance = match[1];
        result.currency = '¥';
        result.message = `余额: ¥${match[1]}`;
        return result;
      }
    }
    
    // 尝试美元格式
    for (const pattern of usBalancePatterns) {
      const match = pageText.match(pattern);
      if (match) {
        result.status = '有效';
        result.balance = match[1];
        result.currency = '$';
        result.message = `余额: $${match[1]}`;
        return result;
      }
    }
    
    // 检查HTML中的金额
    const htmlMatch = pageHTML.match(/[\$¥]\s*(\d+\.?\d*)/);
    if (htmlMatch) {
      result.status = '有效';
      result.balance = htmlMatch[1];
      result.currency = htmlMatch[0].charAt(0);
      result.message = `余额: ${htmlMatch[0]}`;
      return result;
    }
    
    // 如果都没找到，返回未知状态
    result.status = '未知';
    result.message = '无法解析查询结果';
    
    return result;
  }

  /**
   * 批量查询礼品卡
   */
  async processBatch(codes) {
    console.log(`\n🎯 开始批量处理 ${codes.length} 张卡片\n`);
    
    // 创建截图目录
    if (!fs.existsSync('screenshots')) {
      fs.mkdirSync('screenshots', { recursive: true });
    }
    
    this.results = [];
    
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📌 处理进度: ${i + 1}/${codes.length}`);
      
      const result = await this.checkBalance(code);
      this.results.push(result);
      
      // 延迟
      if (i < codes.length - 1) {
        console.log(`⏱️ 等待 ${this.config.delayBetweenCards}ms...`);
        await this.delay(this.config.delayBetweenCards);
      }
    }
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    this.printSummary();
    
    return this.results;
  }

  /**
   * 兑换礼品卡到Apple账户
   * Redeem gift card to Apple account
   */
  async redeemCard(code, appleId, password, attempt = 1) {
    const page = await this.browser.newPage();
    
    try {
      console.log(`\n💳 兑换卡片: ${this.maskCode(code)}`);
      
      // 访问兑换页面
      const redeemUrl = `https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/freeProductCodeWizard`;
      console.log(`📱 访问: ${redeemUrl}`);
      
      await page.goto(redeemUrl, {
        waitUntil: 'networkidle2',
        timeout: this.config.timeout
      });
      
      await page.waitForTimeout(2000);
      
      // 检查是否需要登录
      const needsLogin = await this.checkIfLoginRequired(page);
      
      if (needsLogin) {
        console.log('🔐 需要登录，正在登录...');
        await this.loginToApple(page, appleId, password);
      }
      
      // 输入兑换码
      console.log('⌨️ 输入兑换码...');
      
      const codeInputSelectors = [
        'input[name="code"]',
        'input[id="redemptionCode"]',
        'input[placeholder*="code"]',
        'input[type="text"]'
      ];
      
      let codeInput = null;
      for (const selector of codeInputSelectors) {
        try {
          codeInput = await page.$(selector);
          if (codeInput) {
            console.log(`✅ 找到输入框: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!codeInput) {
        throw new Error('无法找到兑换码输入框');
      }
      
      // 清空并输入兑换码
      await codeInput.click();
      await page.waitForTimeout(500);
      await codeInput.type(code, { delay: 100 });
      
      // 查找并点击兑换按钮
      console.log('🔘 查找兑换按钮...');
      const redeemButtonSelectors = [
        'button:contains("兑换")',
        'button:contains("Redeem")',
        'button[type="submit"]',
        'input[type="submit"]',
        '.button-redeem',
        '#redeem-button'
      ];
      
      let submitted = false;
      for (const selector of redeemButtonSelectors) {
        try {
          const button = await page.$(selector);
          if (button) {
            await button.click();
            console.log(`✅ 点击兑换按钮: ${selector}`);
            submitted = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!submitted) {
        console.log('⏎ 按回车提交...');
        await page.keyboard.press('Enter');
      }
      
      // 等待兑换结果
      console.log('⏳ 等待兑换结果...');
      await page.waitForTimeout(5000);
      
      // 检查成功/错误消息
      const pageText = await page.evaluate(() => document.body.innerText);
      const pageHTML = await page.content();
      
      const result = this.parseRedemptionResult(pageText, pageHTML, code);
      
      console.log(`📊 兑换结果: ${result.status}`);
      
      // 截图验证
      if (this.config.screenshotOnError || !this.config.headless) {
        await page.screenshot({ 
          path: `screenshots/redeem_${Date.now()}.png`,
          fullPage: true 
        });
      }
      
      await page.close();
      return result;
      
    } catch (error) {
      console.error(`❌ 兑换失败: ${error.message}`);
      
      // 错误截图
      if (this.config.screenshotOnError) {
        try {
          await page.screenshot({ 
            path: `screenshots/redeem_error_${Date.now()}.png`,
            fullPage: true 
          });
        } catch (e) {
          console.error('截图失败');
        }
      }
      
      await page.close();
      
      // 重试逻辑
      if (attempt < this.config.retryAttempts) {
        console.log(`🔄 5秒后重试兑换...`);
        await this.delay(5000);
        return this.redeemCard(code, appleId, password, attempt + 1);
      }
      
      return {
        code: this.maskCode(code),
        status: '兑换失败',
        message: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 检查是否需要Apple ID登录
   */
  async checkIfLoginRequired(page) {
    const loginIndicators = [
      'input[name="accountName"]',
      'input[id="account_name_text_field"]',
      'input[type="email"]',
      '#signIn',
      '.sign-in'
    ];
    
    for (const selector of loginIndicators) {
      try {
        const element = await page.$(selector);
        if (element) {
          return true;
        }
      } catch (e) {
        continue;
      }
    }
    
    return false;
  }

  /**
   * 登录Apple ID
   */
  async loginToApple(page, appleId, password) {
    try {
      console.log(`🔐 登录账号: ${appleId}`);
      
      // 查找邮箱输入框
      const emailSelectors = [
        'input[name="accountName"]',
        'input[id="account_name_text_field"]',
        'input[type="email"]'
      ];
      
      let emailInput = null;
      for (const selector of emailSelectors) {
        emailInput = await page.$(selector);
        if (emailInput) break;
      }
      
      if (!emailInput) {
        throw new Error('无法找到Apple ID邮箱输入框');
      }
      
      // 输入邮箱
      await emailInput.click();
      await page.waitForTimeout(500);
      await emailInput.type(appleId, { delay: 100 });
      
      // 点击继续或查找密码框
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
      
      // 查找密码输入框
      const passwordSelectors = [
        'input[name="password"]',
        'input[id="password_text_field"]',
        'input[type="password"]'
      ];
      
      let passwordInput = null;
      for (const selector of passwordSelectors) {
        passwordInput = await page.$(selector);
        if (passwordInput) break;
      }
      
      if (!passwordInput) {
        throw new Error('无法找到密码输入框');
      }
      
      // 输入密码
      await passwordInput.click();
      await page.waitForTimeout(500);
      await passwordInput.type(password, { delay: 100 });
      
      // 提交登录
      await page.keyboard.press('Enter');
      
      // 等待登录完成
      console.log('⏳ 等待登录完成...');
      await page.waitForTimeout(5000);
      
      // 检查双因素认证
      const pageText = await page.evaluate(() => document.body.innerText);
      if (/two.?factor|verification|code|双重|验证/i.test(pageText)) {
        console.log('⚠️ 检测到双因素认证!');
        console.log('📱 请手动完成2FA或提供验证码');
        // 等待更长时间以完成手动2FA
        await page.waitForTimeout(30000);
      }
      
      console.log('✅ 登录成功');
      
    } catch (error) {
      console.error(`❌ 登录失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 解析兑换结果
   */
  parseRedemptionResult(pageText, pageHTML, code) {
    const result = {
      code: this.maskCode(code),
      status: '未知',
      message: null,
      timestamp: new Date().toISOString()
    };
    
    // 检查成功模式
    const successPatterns = [
      /success|redeemed|added.*account|credited/i,
      /已.*兑换|成功/i
    ];
    
    for (const pattern of successPatterns) {
      if (pattern.test(pageText)) {
        result.status = '已兑换';
        result.message = '成功兑换到Apple账户';
        return result;
      }
    }
    
    // 检查错误模式
    const errorPatterns = [
      { pattern: /already.*used|already.*redeemed|已.*使用|已.*兑换/i, message: '兑换码已被使用' },
      { pattern: /invalid|incorrect|无效/i, message: '无效的兑换码' },
      { pattern: /expired|过期/i, message: '兑换码已过期' },
      { pattern: /region|country|地区/i, message: '兑换码在此地区无效' },
      { pattern: /error|错误/i, message: '兑换时发生错误' }
    ];
    
    for (const { pattern, message } of errorPatterns) {
      if (pattern.test(pageText)) {
        result.status = '失败';
        result.message = message;
        return result;
      }
    }
    
    // 默认未知
    result.status = '未知';
    result.message = '无法确定兑换状态';
    return result;
  }

  /**
   * 批量兑换多张卡到一个Apple账户
   */
  async redeemBatch(codes, appleId, password) {
    console.log(`\n🎯 开始批量兑换 ${codes.length} 张卡到 ${appleId}\n`);
    
    const redemptionResults = [];
    
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📌 兑换进度: ${i + 1}/${codes.length}`);
      
      const result = await this.redeemCard(code, appleId, password);
      redemptionResults.push(result);
      
      // 兑换间延迟
      if (i < codes.length - 1) {
        console.log(`⏱️ 等待 ${this.config.delayBetweenCards}ms 进行下一次兑换...`);
        await this.delay(this.config.delayBetweenCards);
      }
    }
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    this.printRedemptionSummary(redemptionResults);
    
    return redemptionResults;
  }

  /**
   * 打印兑换汇总
   */
  printRedemptionSummary(results) {
    const stats = {
      total: results.length,
      redeemed: results.filter(r => r.status === '已兑换').length,
      failed: results.filter(r => r.status === '失败' || r.status === '兑换失败').length,
      unknown: results.filter(r => r.status === '未知').length
    };
    
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║         兑换结果汇总                   ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║ 总卡片数:     ${stats.total.toString().padEnd(24)}║`);
    console.log(`║ ✅ 已兑换:     ${stats.redeemed.toString().padEnd(24)}║`);
    console.log(`║ ❌ 失败:       ${stats.failed.toString().padEnd(24)}║`);
    console.log(`║ ❓ 未知:       ${stats.unknown.toString().padEnd(24)}║`);
    console.log('╚════════════════════════════════════════╝\n');
  }

  maskCode(code) {
    if (!code || code.length < 8) return '****-****';
    // 格式: XXXX-****-****-XXXX
    return `${code.substring(0, 4)}-****-****-${code.substring(code.length - 4)}`;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  saveResults(filename = 'apple_gift_card_results.json') {
    const output = {
      metadata: {
        生成时间: new Date().toISOString(),
        总卡片数: this.results.length,
        有效卡片: this.results.filter(r => r.status === '有效').length,
        无效卡片: this.results.filter(r => r.status === '无效').length,
        已兑换卡片: this.results.filter(r => r.status === '已兑换').length,
        错误: this.results.filter(r => r.status === '错误').length
      },
      results: this.results
    };
    
    fs.writeFileSync(filename, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`\n💾 结果已保存: ${filename}`);
    
    // 保存CSV
    this.saveCSV(filename.replace('.json', '.csv'));
  }

  saveCSV(filename) {
    let csv = '兑换码,状态,余额,货币,消息,时间\n';
    this.results.forEach(r => {
      csv += `"${r.code}","${r.status}","${r.balance || ''}","${r.currency || ''}","${r.message || ''}","${r.timestamp}"\n`;
    });
    
    fs.writeFileSync(filename, csv, 'utf-8');
    console.log(`💾 CSV已保存: ${filename}`);
  }

  printSummary() {
    const stats = {
      total: this.results.length,
      valid: this.results.filter(r => r.status === '有效').length,
      invalid: this.results.filter(r => r.status === '无效').length,
      redeemed: this.results.filter(r => r.status === '已兑换').length,
      error: this.results.filter(r => r.status === '错误').length,
      unknown: this.results.filter(r => r.status === '未知').length
    };
    
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║         批量处理结果汇总               ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║ 总卡片数:     ${stats.total.toString().padEnd(24)}║`);
    console.log(`║ ✅ 有效:       ${stats.valid.toString().padEnd(24)}║`);
    console.log(`║ ❌ 无效:       ${stats.invalid.toString().padEnd(24)}║`);
    console.log(`║ ♻️  已兑换:     ${stats.redeemed.toString().padEnd(24)}║`);
    console.log(`║ ⚠️  错误:       ${stats.error.toString().padEnd(24)}║`);
    console.log(`║ ❓ 未知:       ${stats.unknown.toString().padEnd(24)}║`);
    console.log('╚════════════════════════════════════════╝\n');
  }
}

module.exports = AppleGiftCardChecker;

// 命令行使用示例
if (require.main === module) {
  const checker = new AppleGiftCardChecker({
    headless: false, // 设置为true可隐藏浏览器
    delayBetweenCards: 5000, // 每张卡之间延迟5秒
    region: 'cn' // 中国区
  });
  
  // 测试卡片 (请替换为真实的兑换码)
  const testCodes = [
    'XXXX-XXXX-XXXX-XXXX', // 替换为真实兑换码
  ];
  
  (async () => {
    try {
      await checker.initialize();
      await checker.processBatch(testCodes);
      checker.saveResults();
    } catch (error) {
      console.error('处理失败:', error);
    } finally {
      await checker.close();
    }
  })();
}
