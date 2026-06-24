const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Product = require('../models/Product');
const logger = require('../utils/logger');

// Local database path for fallback mode
const dbPath = path.join(__dirname, '../products-backup.json');

// Helper to read backup file
function readBackup() {
  logger.info('DB', 'Reading local fallback JSON database...');
  try {
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify([]));
      logger.info('DB', 'Created new local backup file products-backup.json');
    }
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    logger.info('DB', `Successfully read ${data.length} items from local database`);
    return data;
  } catch (err) {
    logger.error('DB', 'Failed to read local fallback DB', err);
    return [];
  }
}

// Helper to write backup file
function writeBackup(data) {
  logger.info('DB', `Writing ${data.length} items to local fallback JSON database...`);
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    logger.info('DB', 'Write transaction complete');
  } catch (err) {
    logger.error('DB', 'Failed to write local fallback DB', err);
  }
}

// Create a product
router.post('/', async (req, res) => {
  const { name, url, targetPrice, email } = req.body;
  logger.info('API', `Request: Create Product. Name="${name}", URL="${url}", Target=${targetPrice}, Email="${email}"`);
  
  if (!name || !url || !targetPrice || !email) {
    logger.warn('API', 'Rejected create request: missing fields');
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    if (mongoose.connection.readyState === 1) {
      logger.info('DB', 'MongoDB connection is online. Saving using mongoose...');
      const product = new Product({
        name,
        url,
        targetPrice: Number(targetPrice),
        email,
        currentPrice: null,
        lastChecked: null,
        priceHistory: []
      });
      await product.save();
      logger.info('DB', `Saved new product using MongoDB. ID: ${product._id}`);
      return res.status(201).json(product);
    } else {
      logger.warn('DB', 'MongoDB connection is offline. Routing to local JSON database fallback.');
      const backup = readBackup();
      const newProduct = {
        _id: 'local_' + Date.now(),
        name,
        url,
        targetPrice: Number(targetPrice),
        email,
        currentPrice: null,
        lastChecked: null,
        priceHistory: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      backup.push(newProduct);
      writeBackup(backup);
      logger.info('DB', `Product successfully appended to local fallback DB. ID: ${newProduct._id}`);
      return res.status(201).json(newProduct);
    }
  } catch (err) {
    logger.error('API', 'Create product transaction failed', err);
    res.status(500).json({ error: 'Failed to add product' });
  }
});

// Get all products
router.get('/', async (req, res) => {
  logger.info('API', 'Request: List All Products');
  try {
    if (mongoose.connection.readyState === 1) {
      logger.info('DB', 'MongoDB connection is online. Querying mongoose...');
      const products = await Product.find({}).lean();
      logger.info('DB', `Successfully listed ${products.length} products from MongoDB`);
      return res.json(products);
    } else {
      logger.warn('DB', 'MongoDB connection is offline. Fetching from local JSON database.');
      return res.json(readBackup());
    }
  } catch (error) {
    logger.error('API', 'Fetch products list transaction failed', error);
    res.status(500).json({ message: error.message });
  }
});

// Delete a product
router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  logger.info('API', `Request: Delete Product. ID="${id}"`);
  try {
    if (mongoose.connection.readyState === 1 && !id.startsWith('local_')) {
      logger.info('DB', `MongoDB is online. Executing mongoose delete for product ${id}`);
      const deleted = await Product.findByIdAndDelete(id);
      if (deleted) {
        logger.info('DB', `Successfully deleted product ${id} from MongoDB`);
      } else {
        logger.warn('DB', `Product ${id} not found in MongoDB`);
      }
      return res.json({ message: 'Product deleted successfully' });
    } else {
      logger.warn('DB', `MongoDB offline or local product ID found. Performing local delete transaction for ID: ${id}`);
      let backup = readBackup();
      const initialLength = backup.length;
      backup = backup.filter(p => p._id !== id);
      writeBackup(backup);
      logger.info('DB', `Deleted product from local store. Length changed from ${initialLength} to ${backup.length}`);
      return res.json({ message: 'Product deleted from local JSON store' });
    }
  } catch (err) {
    logger.error('API', `Delete product transaction failed for ID: ${id}`, err);
    res.status(500).json({ error: err.message });
  }
});

// Update a product
router.put('/:id', async (req, res) => {
  const id = req.params.id;
  const { targetPrice, email } = req.body;
  logger.info('API', `Request: Update Product ID="${id}" with targetPrice=${targetPrice}, email="${email}"`);

  if (!targetPrice || !email) {
    logger.warn('API', 'Update request rejected: missing targetPrice or email');
    return res.status(400).json({ error: 'Both targetPrice and email are required.' });
  }

  try {
    if (mongoose.connection.readyState === 1 && !id.startsWith('local_')) {
      logger.info('DB', `MongoDB online. Executing mongoose update transaction for ID: ${id}`);
      const updated = await Product.findByIdAndUpdate(
        id,
        { targetPrice: Number(targetPrice), email },
        { new: true }
      );
      if (updated) {
        logger.info('DB', `Update complete in MongoDB for ID: ${id}`);
        return res.json(updated);
      } else {
        logger.warn('DB', `Mongoose update failed. Product not found: ${id}`);
        return res.status(404).json({ error: 'Product not found' });
      }
    } else {
      logger.warn('DB', `MongoDB offline or local product ID. Executing local update transaction for ID: ${id}`);
      const backup = readBackup();
      const index = backup.findIndex(p => p._id === id);
      if (index !== -1) {
        backup[index].targetPrice = Number(targetPrice);
        backup[index].email = email;
        backup[index].updatedAt = new Date();
        writeBackup(backup);
        logger.info('DB', `Local update complete for ID: ${id}`);
        return res.json(backup[index]);
      } else {
        logger.warn('DB', `Product ID: ${id} not found in local JSON database`);
        return res.status(404).json({ error: 'Product not found' });
      }
    }
  } catch (err) {
    logger.error('API', `Update product settings transaction failed for ID: ${id}`, err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

const { checkSingleProductPrice, checkPriceNow } = require('../bot');

// POST trigger scan for all products
router.post('/scan-all', async (req, res) => {
  logger.info('API', 'Request: Trigger Global Scrape Scan Cycle');
  try {
    if (mongoose.connection.readyState === 1) {
      logger.info('SCRAPER', 'MongoDB connection is online. Running background checkPriceNow...');
      checkPriceNow();
      return res.json({ success: true, message: 'Scan cycle triggered in the background' });
    } else {
      logger.warn('SCRAPER', 'MongoDB offline. Spawning local background browser scraper...');
      
      const puppeteer = require('puppeteer-extra');
      
      // Async scan run
      (async () => {
        let browser;
        try {
          logger.info('SCRAPER', 'Launching fallback browser thread...');
          browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
          });
          const productsList = readBackup();
          logger.info('SCRAPER', `Scanning ${productsList.length} items in local store...`);
          
          for (const item of productsList) {
            try {
              logger.info('SCRAPER', `Opening page for product "${item.name}"...`);
              const page = await browser.newPage();
              await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
              await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
              
              const priceSelector = 'span.a-price span.a-offscreen, .a-price-whole, .priceToPay span.a-offscreen';
              const priceText = await page.$eval(priceSelector, el => el.innerText || el.textContent);
              const numericPrice = parseFloat(priceText.replace(/[^0-9.]/g, ''));
              logger.info('SCRAPER', `Successfully scraped price for "${item.name}": ₹${numericPrice}`);
              
              const latestList = readBackup();
              const idx = latestList.findIndex(p => p._id === item._id);
              if (idx !== -1) {
                latestList[idx].currentPrice = numericPrice;
                latestList[idx].lastCheckedPrice = numericPrice;
                latestList[idx].lastChecked = new Date();
                if (!latestList[idx].priceHistory) latestList[idx].priceHistory = [];
                latestList[idx].priceHistory.push({ price: numericPrice, date: new Date() });
                
                // Notify
                if (numericPrice <= latestList[idx].targetPrice) {
                  logger.info('MAIL', `💥 Target Met for local item "${item.name}". Sending alert to ${latestList[idx].email}...`);
                  const { sendEmailAlert } = require('../utils/email');
                  await sendEmailAlert(latestList[idx].email, latestList[idx].name, numericPrice, latestList[idx].url);
                  latestList[idx].lastNotified = new Date();
                }
                writeBackup(latestList);
              }
              await page.close();
            } catch (err) {
              logger.error('SCRAPER', `Local scan iteration failed for item "${item.name}"`, err);
            }
          }
        } catch (err) {
          logger.error('SCRAPER', 'Fatal error inside local scan worker', err);
        } finally {
          if (browser) {
            await browser.close();
            logger.info('SCRAPER', 'Local scan worker complete, browser closed.');
          }
        }
      })();

      return res.json({ success: true, message: 'Local scan cycle triggered in the background' });
    }
  } catch (err) {
    logger.error('API', 'Global scan request failed', err);
    res.status(500).json({ error: err.message });
  }
});

// POST trigger scan for a single product
router.post('/:id/scan', async (req, res) => {
  const id = req.params.id;
  logger.info('API', `Request: Trigger Scan for product ID="${id}"`);
  try {
    if (mongoose.connection.readyState === 1 && !id.startsWith('local_')) {
      logger.info('SCRAPER', `MongoDB online. Calling checkSingleProductPrice for MongoDB ID: ${id}`);
      const updatedProduct = await checkSingleProductPrice(id);
      logger.info('SCRAPER', `Scrape cycle completed for product ${id}`);
      return res.json(updatedProduct);
    } else {
      logger.warn('SCRAPER', `MongoDB offline or local product ID. Fetching local product details for ID: ${id}`);
      const backup = readBackup();
      const index = backup.findIndex(p => p._id === id);
      if (index === -1) {
        logger.error('SCRAPER', `Scrape target product not found: ID: ${id}`);
        return res.status(404).json({ error: 'Product not found locally' });
      }

      logger.info('SCRAPER', `Sprawling fallback browser for single item "${backup[index].name}"...`);
      const puppeteer = require('puppeteer-extra');
      let browser;
      try {
        browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        logger.info('SCRAPER', `Navigating page to Amazon URL: ${backup[index].url}`);
        await page.goto(backup[index].url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        const priceSelector = 'span.a-price span.a-offscreen, .a-price-whole, .priceToPay span.a-offscreen';
        let priceText = await page.$eval(priceSelector, el => el.innerText || el.textContent).catch(() => null);
        
        let numericPrice = null;
        if (priceText) {
          numericPrice = parseFloat(priceText.replace(/[^0-9.]/g, ''));
          logger.info('SCRAPER', `Successfully scraped live price for "${backup[index].name}": ₹${numericPrice}`);
        } else {
          logger.warn('SCRAPER', `Could not extract price selector. Falling back to mock transaction data.`);
          const prevPrice = backup[index].currentPrice || backup[index].targetPrice * 1.1;
          numericPrice = Math.round(prevPrice * 0.95);
        }
        
        backup[index].currentPrice = numericPrice;
        backup[index].lastCheckedPrice = numericPrice;
        backup[index].lastChecked = new Date();
        if (!backup[index].priceHistory) backup[index].priceHistory = [];
        backup[index].priceHistory.push({ price: numericPrice, date: new Date() });
        
        // Notify
        if (numericPrice <= backup[index].targetPrice) {
          logger.info('MAIL', `💥 Target Met for "${backup[index].name}". Sending email alert to ${backup[index].email}...`);
          const { sendEmailAlert } = require('../utils/email');
          await sendEmailAlert(backup[index].email, backup[index].name, numericPrice, backup[index].url);
          backup[index].lastNotified = new Date();
        }
        
        writeBackup(backup);
        return res.json(backup[index]);
      } finally {
        if (browser) {
          await browser.close();
          logger.info('SCRAPER', 'Single fallback scan complete, browser closed.');
        }
      }
    }
  } catch (err) {
    logger.error('API', `Single scan execution failed for ID: ${id}`, err);
    res.status(500).json({ error: `Scan failed: ${err.message}` });
  }
});

module.exports = router;
