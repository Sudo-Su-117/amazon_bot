const nodemailer = require('nodemailer');
require('dotenv').config();
const logger = require('./logger');

async function sendEmailAlert(toEmail, productTitle, numericPrice, url) {
  logger.info('MAIL', `Initiating email dispatch alert configuration for: "${productTitle}"`);

  const recipient = toEmail || process.env.RECEIVER_EMAIL;
  if (!recipient) {
    const error = new Error('No recipient email specified.');
    logger.error('MAIL', 'Failed to send alert: no recipient configured', error);
    throw error;
  }

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1a202c;">
      <div style="text-align: center; border-bottom: 2px solid #edf2f7; padding-bottom: 15px; margin-bottom: 20px;">
        <h1 style="color: #007aff; font-size: 24px; margin: 0; font-weight: 700;">🛒 Price Drop Alert!</h1>
      </div>
      <p style="font-size: 16px; line-height: 1.6; margin-top: 0;">Good news! A product you are tracking on Amazon has dropped below your target price.</p>
      
      <div style="background-color: #f7fafc; border-left: 4px solid #007aff; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
        <h2 style="font-size: 18px; margin: 0 0 8px 0; color: #2d3748;">${productTitle || 'Tracked Product'}</h2>
        <p style="font-size: 20px; font-weight: bold; margin: 0; color: #38a169;">Current Price: ₹${numericPrice}</p>
      </div>

      <div style="text-align: center; margin: 30px 0 10px 0;">
        <a href="${url}" target="_blank" style="background-color: #007aff; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0, 122, 255, 0.2);">
          View on Amazon
        </a>
      </div>
      
      <p style="font-size: 12px; color: #a0aec0; text-align: center; margin-top: 30px; border-top: 1px solid #edf2f7; padding-top: 15px;">
        This is an automated message from your Amazon Price Tracker.
      </p>
    </div>
  `;

  // Option 1: Use Resend API (HTTP-based, works on Render Free Tier)
  if (process.env.RESEND_API_KEY) {
    logger.info('MAIL', 'RESEND_API_KEY detected. Dispatching via Resend HTTP API...');
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Amazon Price Bot <onboarding@resend.dev>',
          to: recipient,
          subject: `💥 Price Drop: ${productTitle || 'Product'} is now ₹${numericPrice}!`,
          html: htmlContent
        })
      });

      const data = await response.json();
      if (response.ok) {
        logger.info('MAIL', `📧 Email alert successfully dispatched via Resend to ${recipient}. ID: ${data.id}`);
        return;
      } else {
        throw new Error(data.message || JSON.stringify(data));
      }
    } catch (error) {
      logger.error('MAIL', `Failed to send email alert via Resend to ${recipient}`, error);
      logger.warn('MAIL', 'Attempting fallback to SMTP...');
    }
  }

  // Option 2: Fallback to SMTP
  if (!process.env.EMAIL || !process.env.PASSWORD) {
    const error = new Error('Missing email credentials in env configuration.');
    logger.error('MAIL', 'Failed to configure mailer transport', error);
    throw error;
  }

  try {
    logger.info('MAIL', 'Creating transport node transporter...');
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD
      }
    });

    const mailOptions = {
      from: `"Amazon Price Bot" <${process.env.EMAIL}>`,
      to: recipient,
      subject: `💥 Price Drop: ${productTitle || 'Product'} is now ₹${numericPrice}!`,
      text: `The price of "${productTitle}" dropped to Rs. ${numericPrice}! Check it now: ${url}`,
      html: htmlContent
    };

    if (process.env.RECEIVER_EMAIL && process.env.RECEIVER_EMAIL !== recipient) {
      mailOptions.cc = process.env.RECEIVER_EMAIL;
      logger.info('MAIL', `CC included for administrator destination: ${process.env.RECEIVER_EMAIL}`);
    }

    logger.info('MAIL', `Sending message body to ${recipient}...`);
    await transporter.sendMail(mailOptions);
    logger.info('MAIL', `📧 Email alert successfully dispatched to ${recipient}.`);
  } catch (error) {
    logger.error('MAIL', `Failed to send email alert to ${recipient} via SMTP`, error);
  }
}

module.exports = { sendEmailAlert };