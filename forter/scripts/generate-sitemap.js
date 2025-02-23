import { SitemapStream, streamToPromise } from 'sitemap';
import { Readable } from 'stream';
import { createWriteStream } from 'fs';
import { format } from 'date-fns';

// Get the base URL based on environment
const BASE_URL = (() => {
  const url = (() => {
    switch (process.env.ENVIRONMENT) {
      case 'development':
        return 'http://localhost:3000';
      case 'staging':
        return 'https://staging.sorter.social';
      case 'production':
        return 'https://sorter.social';
      default:
        return 'http://localhost:3000'; // Default to development
    }
  })();
  console.log(`Using BASE_URL: ${url} (ENVIRONMENT=${process.env.ENVIRONMENT})`);
  return url;
})();

// Fetch all tags and items from the API
async function fetchAllData() {
  try {
    const tagsUrl = `${BASE_URL}/api/tag`;
    console.log(`Fetching tags from: ${tagsUrl}`);
    
    const tagsResponse = await fetch(tagsUrl);
    console.log(`Tags response status: ${tagsResponse.status}`);
    
    if (!tagsResponse.ok) {
      const text = await tagsResponse.text();
      console.error('Failed response body:', text);
      throw new Error(`Failed to fetch tags: ${tagsResponse.status} ${tagsResponse.statusText}`);
    }
    
    const tagsData = await tagsResponse.json();
    console.log(`Found ${tagsData.public?.length || 0} public tags`);
    
    const tags = tagsData.public;
    
    // Fetch items for each tag
    const tagItems = await Promise.all(
      tags.map(async (tag) => {
        const itemsUrl = `${BASE_URL}/api/tag/page?id=${tag.id}&slug=${tag.slug}`;
        console.log(`Fetching items for tag ${tag.id} from: ${itemsUrl}`);
        
        const itemsResponse = await fetch(itemsUrl);
        console.log(`Items response status for tag ${tag.id}: ${itemsResponse.status}`);
        
        if (!itemsResponse.ok) {
          const text = await itemsResponse.text();
          console.error(`Failed response body for tag ${tag.id}:`, text);
          throw new Error(`Failed to fetch items for tag ${tag.id}: ${itemsResponse.status} ${itemsResponse.statusText}`);
        }
        
        const items = await itemsResponse.json();
        console.log(`Found ${items.items?.length || 0} items for tag ${tag.id}`);
        
        return {
          tag,
          items: items.items || []
        };
      })
    );
    
    return tagItems;
  } catch (error) {
    console.error('Error details:', {
      message: error.message,
      stack: error.stack
    });
    return [];
  }
}

async function generateSitemap() {
  // Remove the protocol (http:// or https://) from BASE_URL for the hostname
  const hostname = BASE_URL.replace(/^https?:\/\//, '');
  console.log(`Generating sitemap with hostname: ${hostname}`);
  
  const stream = new SitemapStream({ hostname: BASE_URL });
  const data = await fetchAllData();
  const currentDate = new Date();

  // Add static pages
  stream.write({
    url: '/',
    changefreq: 'daily',
    priority: 1.0,
    lastmod: format(currentDate, 'yyyy-MM-dd')
  });

  stream.write({
    url: '/faq',
    changefreq: 'monthly',
    priority: 0.5,
    lastmod: format(currentDate, 'yyyy-MM-dd')
  });

  // Add tag pages with their items
  data.forEach(({ tag, items }) => {
    // Safely parse the date or use current date as fallback
    const tagDate = tag.updated_at ? new Date(tag.updated_at) : currentDate;
    const safeTagDate = isNaN(tagDate.getTime()) ? currentDate : tagDate;

    // Tag page
    stream.write({
      url: `/${tag.id}/${tag.slug}`,
      changefreq: 'daily',
      priority: 0.8,
      lastmod: format(safeTagDate, 'yyyy-MM-dd'),
      img: tag.image ? [{
        url: tag.image,
        caption: tag.title,
        title: tag.title
      }] : undefined
    });

    // Item pages within tag
    items.forEach(item => {
      // Safely parse the date or use current date as fallback
      const itemDate = item.updated_at ? new Date(item.updated_at) : currentDate;
      const safeItemDate = isNaN(itemDate.getTime()) ? currentDate : itemDate;

      stream.write({
        url: `/${tag.id}/${tag.slug}?item=${item.id}`,
        changefreq: 'weekly',
        priority: 0.6,
        lastmod: format(safeItemDate, 'yyyy-MM-dd'),
        img: item.image ? [{
          url: item.image,
          caption: item.title,
          title: item.title
        }] : undefined,
        video: item.video ? [{
          content_loc: item.video,
          title: item.title,
          description: item.description || item.title
        }] : undefined
      });
    });
  });

  stream.end();

  // Convert stream to XML and save
  const xml = await streamToPromise(Readable.from([await streamToPromise(stream)]));
  
  // Save to public directory
  const writeStream = createWriteStream('./public/sitemap.xml');
  writeStream.write(xml);
  writeStream.end();

  console.log('Sitemap generated successfully!');
}

generateSitemap().catch(console.error); 