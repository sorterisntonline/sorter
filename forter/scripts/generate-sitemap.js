import { SitemapStream, streamToPromise } from 'sitemap';
import { Readable } from 'stream';
import { createWriteStream } from 'fs';
import { format } from 'date-fns';

// Fetch all tags and items from the API
async function fetchAllData() {
  try {
    const tagsResponse = await fetch('https://sorter.social/api/tags');
    const tags = await tagsResponse.json();
    
    // Fetch items for each tag
    const tagItems = await Promise.all(
      tags.map(async (tag) => {
        const itemsResponse = await fetch(`https://sorter.social/api/tags/${tag.id}/items`);
        const items = await itemsResponse.json();
        return {
          tag,
          items
        };
      })
    );
    
    return tagItems;
  } catch (error) {
    console.error('Error fetching data:', error);
    return [];
  }
}

async function generateSitemap() {
  const stream = new SitemapStream({ hostname: 'https://sorter.social' });
  const data = await fetchAllData();

  // Add static pages
  stream.write({
    url: '/',
    changefreq: 'daily',
    priority: 1.0,
    lastmod: format(new Date(), 'yyyy-MM-dd')
  });

  stream.write({
    url: '/faq',
    changefreq: 'monthly',
    priority: 0.5,
    lastmod: format(new Date(), 'yyyy-MM-dd')
  });

  // Add tag pages with their items
  data.forEach(({ tag, items }) => {
    // Tag page
    stream.write({
      url: `/${tag.id}/${tag.slug}`,
      changefreq: 'daily',
      priority: 0.8,
      lastmod: format(new Date(tag.updated_at), 'yyyy-MM-dd'),
      img: tag.image ? [{
        url: tag.image,
        caption: tag.title,
        title: tag.title
      }] : undefined
    });

    // Item pages within tag
    items.forEach(item => {
      stream.write({
        url: `/${tag.id}/${tag.slug}?item=${item.id}`,
        changefreq: 'weekly',
        priority: 0.6,
        lastmod: format(new Date(item.updated_at), 'yyyy-MM-dd'),
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