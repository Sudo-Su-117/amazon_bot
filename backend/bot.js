const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const cron = require('node-cron');
require('dotenv').config();
const { sendEmailAlert } = require('./utils/email');
const Product = require('./models/Product');
const logger = require('./utils/logger');

const scheduleTime = process.env.SCHEDULE_TIME || '0 9 * * *';

if (!cron.validate(scheduleTime)) {
  logger.error('CRON', `❌ Invalid cron pattern specified: ${scheduleTime}`);
  process.exit(1);
}

/**
 * Scrapes the price of a product from Amazon URL with selector fallbacks.
 */
async function scrapeProductPrice(page, url) {
  logger.info('SCRAPER', `Opening webpage context to scrape URL: ${url}`);
  
  // Enable request interception to block heavy assets and speed up page load
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const resourceType = req.resourceType();
    if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });
  
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      logger.warn('SCRAPER', `Page navigation timed out for ${url} (60s), attempting to proceed to selectors...`);
    } else {
      logger.error('SCRAPER', `Page navigation error for ${url}`, err);
      throw err;
    }
  }

  const selectors = [
    'span.a-price span.a-offscreen',
    '.a-price-whole',
    '.priceToPay span.a-offscreen',
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '#priceblock_saleprice',
    '.apexPriceToPay span.a-offscreen',
    '#corePrice_desktop .a-price-whole'
  ];

  let priceText = null;
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 3000 });
      const text = await page.$eval(selector, el => el.innerText || el.textContent);
      if (text && text.trim()) {
        priceText = text.trim();
        logger.info('SCRAPER', `Selector matches: "${selector}" -> Value: ${priceText}`);
        break;
      }
    } catch (e) {
      // Continue to next selector
    }
  }

  if (!priceText) {
    const pageTitle = await page.title().catch(() => 'Unknown Title');
    const textLength = await page.evaluate(() => document.body.textContent.length).catch(() => 0);
    const bodyTextSnippet = await page.evaluate(() => document.body.textContent.slice(0, 500)).catch(() => 'Could not retrieve body text');
    const elementCounts = await page.evaluate(() => {
      const priceClassCount = document.querySelectorAll('[class*="price"]').length;
      const wholeClassCount = document.querySelectorAll('[class*="whole"]').length;
      return { priceClassCount, wholeClassCount };
    }).catch(() => ({ priceClassCount: -1, wholeClassCount: -1 }));
    
    logger.warn('SCRAPER', `Standard selectors failed. Page Title: "${pageTitle}". Text Length: ${textLength}. Snippet: "${bodyTextSnippet.replace(/\n/g, ' ')}"`);
    logger.warn('SCRAPER', `Price-related element counts -> class*="price": ${elementCounts.priceClassCount}, class*="whole": ${elementCounts.wholeClassCount}`);
    logger.warn('SCRAPER', 'Attempting body text regex parsing fallback...');
    try {
      const bodyText = await page.evaluate(() => document.body.textContent);
      const matches = bodyText.match(/(?:₹|Rs\.|Rs|USD|\$)\s?([0-9,]+(?:\.[0-9]{2})?)/i);
      if (matches && matches[1]) {
        priceText = matches[1];
        logger.info('SCRAPER', `Regex match fallback price value: ${priceText}`);
      }
    } catch (e) {
      logger.error('SCRAPER', 'Fallback body text regex parse failed', e);
    }
  }

  if (!priceText) {
    throw new Error('Price not found on the page using standard selectors or body fallbacks.');
  }

  const cleanText = priceText.replace(/[^0-9.]/g, '');
  const numericPrice = parseFloat(cleanText);

  if (isNaN(numericPrice)) {
    throw new Error(`Failed to parse price string "${priceText}" into a valid float.`);
  }

  return numericPrice;
}

/**
 * Checks all active products and alerts users if the price drops.
 */
async function checkPrices() {
  logger.info('SCRAPER', 'Starting global scan cycle...');
  let products;
  try {
    products = await Product.find({ isActive: true });
    logger.info('DB', `Fetched ${products.length} active products from database`);
  } catch (err) {
    logger.error('DB', 'Failed to retrieve active products list', err);
    return;
  }

  if (products.length === 0) {
    logger.info('SCRAPER', 'No active products configured. Scan complete.');
    return;
  }
  
  let browser;
  try {
    logger.info('SCRAPER', 'Launching browser thread...');
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || null;
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    for (const product of products) {
      const { url, targetPrice, _id, name, email } = product;
      logger.info('SCRAPER', `Initiating scrape for product: "${name}" (${_id})`);

      let page;
      try {
        page = await browser.newPage();
        const numericPrice = await scrapeProductPrice(page, url);

        logger.info('SCRAPER', `Price resolved for "${name}": ₹${numericPrice} (Target threshold: ₹${targetPrice})`);

        // Update database log
        await Product.findByIdAndUpdate(_id, {
          lastCheckedPrice: numericPrice,
          currentPrice: numericPrice,
          lastChecked: new Date(),
          $push: {
            priceHistory: {
              price: numericPrice,
              date: new Date()
            }
          }
        });
        logger.info('DB', `Updated price history data for "${name}" (${_id})`);

        // Check target threshold condition
        if (numericPrice <= targetPrice) {
          logger.info('MAIL', `💥 Target Met for "${name}". Sending price drop alert to ${email}...`);
          await sendEmailAlert(email, name, numericPrice, url);
          await Product.findByIdAndUpdate(_id, { lastNotified: new Date() });
          logger.info('DB', `Updated notification timestamp for "${name}" (${_id})`);
        }
      } catch (err) {
        logger.error('SCRAPER', `Checking failed for item: "${name}"`, err);
      } finally {
        if (page) {
          await page.close();
          logger.info('SCRAPER', 'Page context closed.');
        }
      }
    }
  } catch (err) {
    logger.error('SCRAPER', 'Fatal Puppeteer browser execution error', err);
  } finally {
    if (browser) {
      await browser.close();
      logger.info('SCRAPER', 'Browser thread terminated.');
    }
  }
}

/**
 * Triggers scraping for a single product immediately.
 */
async function checkSingleProductPrice(productId) {
  logger.info('SCRAPER', `Triggering single scan request for product ID: ${productId}`);
  const product = await Product.findById(productId);
  if (!product) {
    throw new Error(`Product not found in database: ${productId}`);
  }

  let browser;
  try {
    logger.info('SCRAPER', 'Launching browser thread...');
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || null;
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    const numericPrice = await scrapeProductPrice(page, product.url);

    logger.info('SCRAPER', `Single scan price resolved for "${product.name}": ₹${numericPrice}`);

    // Update database log
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      {
        lastCheckedPrice: numericPrice,
        currentPrice: numericPrice,
        lastChecked: new Date(),
        $push: {
          priceHistory: {
            price: numericPrice,
            date: new Date()
          }
        }
      },
      { new: true }
    );
    logger.info('DB', `Updated price history data for single product "${product.name}"`);

    // Check alert
    if (numericPrice <= product.targetPrice) {
      logger.info('MAIL', `💥 Target Met for single product "${product.name}". Sending alert to ${product.email}...`);
      await sendEmailAlert(product.email, product.name, numericPrice, product.url);
      await Product.findByIdAndUpdate(productId, { lastNotified: new Date() });
      logger.info('DB', 'Updated notification timestamp');
    }

    return updatedProduct;
  } catch (err) {
    logger.error('SCRAPER', `Single scan scrape thread execution failed for product "${product.name}"`, err);
    throw err;
  } finally {
    if (browser) {
      await browser.close();
      logger.info('SCRAPER', 'Browser thread terminated.');
    }
  }
}

// Set up cron daemon
cron.schedule(scheduleTime, () => {
  logger.info('CRON', `Cron job triggered: price scanner starting checking sequence at ${new Date().toLocaleTimeString()}`);
  checkPrices();
});
logger.info('CRON', `Scheduled daily scan cycle daemon with interval: "${scheduleTime}"`);

async function checkPriceNow() {
  await checkPrices();
}

module.exports = { 
  checkPriceNow,
  checkSingleProductPrice 
};
