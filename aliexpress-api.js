// AliExpress Product API Backend
// Deploy to Render.com or similar hosting
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import { JSDOM } from 'jsdom';

const app = express();
app.use(cors());
app.use(express.json());

// Helper function to extract product ID from URL
function extractProductId(url) {
    if (!url) return null;
    const cleanUrl = url.split('?')[0]; // Remove query parameters
    
    // Pattern 1: /item/product-name-1234567890.html or /item/1234567890.html
    const match1 = cleanUrl.match(/\/item\/[^\/]*?(\d+)\.html/);
    if (match1) return match1[1];
    
    // Pattern 2: Direct number before .html
    const match2 = cleanUrl.match(/\/(\d+)\.html/);
    if (match2) return match2[1];
    
    // Pattern 3: Store product format
    const match3 = cleanUrl.match(/\/store\/product\/[^\/]*?(\d+)\.html/);
    if (match3) return match3[1];
    
    return null;
}

// Fetch and parse AliExpress product data
async function fetchAliExpressProduct(url) {
    try {
        const productId = extractProductId(url);
        if (!productId) {
            throw new Error('Could not extract product ID from URL');
        }

        // Fetch the product page with proper headers
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 30000 // 30 seconds timeout
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        const dom = new JSDOM(html);
        const document = dom.window.document;

        // Extract product data
        const productData = {};

        // Extract title
        const titleSelectors = [
            'h1[data-pl="product-title"]',
            '.product-title-text',
            'h1.pdp-product-name',
            'h1'
        ];
        let titleEl = null;
        for (const selector of titleSelectors) {
            titleEl = document.querySelector(selector);
            if (titleEl) break;
        }
        productData.title = titleEl ? titleEl.textContent.trim() : 'Product';

        // Extract price - try multiple selectors
        const priceSelectors = [
            '.price-current',
            '.notranslate',
            '[data-pl="main-price"]',
            '.price',
            '.pdp-price',
            '.product-price-value'
        ];
        let priceEl = null;
        for (const selector of priceSelectors) {
            priceEl = document.querySelector(selector);
            if (priceEl) break;
        }
        if (priceEl) {
            const priceText = priceEl.textContent.trim();
            const priceMatch = priceText.match(/[\d.]+/);
            if (priceMatch) {
                productData.salePrice = parseFloat(priceMatch[0]);
            }
        }

        // Extract original price
        const originalPriceSelectors = [
            '.price-original',
            '.price-was',
            '[data-pl="origin-price"]',
            '.price-before',
            '.original-price'
        ];
        let originalPriceEl = null;
        for (const selector of originalPriceSelectors) {
            originalPriceEl = document.querySelector(selector);
            if (originalPriceEl) break;
        }
        if (originalPriceEl) {
            const priceText = originalPriceEl.textContent.trim();
            const priceMatch = priceText.match(/[\d.]+/);
            if (priceMatch) {
                productData.originalPrice = parseFloat(priceMatch[0]);
            }
        }

        // Calculate discount
        if (productData.originalPrice && productData.salePrice && productData.originalPrice > productData.salePrice) {
            productData.discount = Math.round(((productData.originalPrice - productData.salePrice) / productData.originalPrice) * 100);
        }

        // Extract images
        productData.images = [];
        const imageSelectors = [
            '.images-view img',
            '.product-images img',
            '.pdp-product-img-container img',
            '[data-src]',
            '[data-image]'
        ];
        
        for (const selector of imageSelectors) {
            const images = document.querySelectorAll(selector);
            images.forEach(img => {
                let src = img.getAttribute('data-src') || img.getAttribute('src') || img.getAttribute('data-image');
                if (src) {
                    // Convert relative URLs to absolute
                    if (src.startsWith('//')) {
                        src = 'https:' + src;
                    } else if (src.startsWith('/')) {
                        src = 'https://www.aliexpress.com' + src;
                    }
                    // Filter out small placeholder images
                    if (src.includes('http') && !src.includes('placeholder') && !productData.images.includes(src)) {
                        productData.images.push(src);
                    }
                }
            });
            if (productData.images.length > 0) break;
        }

        // Extract rating
        const ratingSelectors = [
            '[data-pl="rating-score"]',
            '.overview-rating-average',
            '.rating-value',
            '.pdp-review-score'
        ];
        let ratingEl = null;
        for (const selector of ratingSelectors) {
            ratingEl = document.querySelector(selector);
            if (ratingEl) break;
        }
        if (ratingEl) {
            const ratingText = ratingEl.textContent.trim();
            const ratingMatch = ratingText.match(/[\d.]+/);
            if (ratingMatch) {
                productData.rating = parseFloat(ratingMatch[0]);
            }
        }

        // Extract review count
        const reviewSelectors = [
            '[data-pl="reviews-count"]',
            '.reviews-count',
            '.review-count',
            '.pdp-review-count'
        ];
        let reviewEl = null;
        for (const selector of reviewSelectors) {
            reviewEl = document.querySelector(selector);
            if (reviewEl) break;
        }
        if (reviewEl) {
            const reviewText = reviewEl.textContent.trim();
            const reviewMatch = reviewText.match(/[\d,]+/);
            if (reviewMatch) {
                productData.reviews = parseInt(reviewMatch[0].replace(/,/g, ''));
            }
        }

        // Extract description
        const descSelectors = [
            '.product-description',
            '.detail-desc',
            '[data-pl="description"]',
            '.product-detail-desc'
        ];
        let descEl = null;
        for (const selector of descSelectors) {
            descEl = document.querySelector(selector);
            if (descEl) break;
        }
        if (descEl) {
            productData.description = descEl.textContent.trim().substring(0, 1000); // Limit length
        }

        // Extract specifications
        productData.specs = [];
        const specSelectors = [
            '.product-prop',
            '.props-item',
            '.spec-item',
            '.product-parameter-item'
        ];
        for (const selector of specSelectors) {
            const specEls = document.querySelectorAll(selector);
            if (specEls.length > 0) {
                specEls.forEach(el => {
                    const label = el.querySelector('.props-name, .spec-label, dt, .product-parameter-name')?.textContent.trim();
                    const value = el.querySelector('.props-value, .spec-value, dd, .product-parameter-value')?.textContent.trim();
                    if (label && value) {
                        productData.specs.push({ label, value });
                    }
                });
                break;
            }
        }

        // Try to extract from JSON-LD structured data
        const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
            try {
                const json = JSON.parse(script.textContent);
                if (json['@type'] === 'Product') {
                    if (!productData.title && json.name) productData.title = json.name;
                    if (!productData.rating && json.aggregateRating?.ratingValue) {
                        productData.rating = parseFloat(json.aggregateRating.ratingValue);
                    }
                    if (!productData.reviews && json.aggregateRating?.reviewCount) {
                        productData.reviews = parseInt(json.aggregateRating.reviewCount);
                    }
                    if (!productData.description && json.description) {
                        productData.description = json.description.substring(0, 1000);
                    }
                    if (json.image && !productData.images.length) {
                        if (Array.isArray(json.image)) {
                            productData.images = json.image;
                        } else {
                            productData.images = [json.image];
                        }
                    }
                }
            } catch (e) {
                // Skip invalid JSON
            }
        }

        // Ensure minimum required fields
        if (!productData.salePrice) productData.salePrice = 0;
        if (!productData.originalPrice) productData.originalPrice = productData.salePrice;
        if (!productData.rating) productData.rating = 0;
        if (!productData.reviews) productData.reviews = 0;
        if (!productData.images || productData.images.length === 0) {
            productData.images = ['https://via.placeholder.com/600x600/eeeeee/333333?text=No+Image'];
        }
        if (!productData.description) productData.description = '';
        if (!productData.specs) productData.specs = [];

        return productData;
    } catch (error) {
        console.error('Error fetching product:', error);
        throw new Error(`Failed to fetch product: ${error.message}`);
    }
}

// API Routes

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'AliExpress Product API',
        version: '1.0.0',
        endpoints: {
            fetchProduct: 'POST /api/aliexpress/product',
            health: 'GET /healthz'
        }
    });
});

app.get('/healthz', (req, res) => {
    res.send('ok');
});

// Fetch product by URL
app.post('/api/aliexpress/product', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({
                error: 'URL is required',
                message: 'Please provide a valid AliExpress product URL'
            });
        }

        // Validate URL
        if (!url.includes('aliexpress.com') || !url.includes('/item/')) {
            return res.status(400).json({
                error: 'Invalid URL',
                message: 'Please provide a valid AliExpress product URL'
            });
        }

        console.log(`Fetching product from: ${url}`);
        const productData = await fetchAliExpressProduct(url);
        
        res.json({
            success: true,
            data: productData
        });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch product data'
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`AliExpress API server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

