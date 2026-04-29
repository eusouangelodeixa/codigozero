import { chromium } from 'playwright';

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const query = "Restaurantes";
    const city = "Maputo";
    const searchQuery = encodeURIComponent(`${query} em ${city}`);
    console.log("Acessando:", `https://www.google.com/maps/search/${searchQuery}/`);
    await page.goto(`https://www.google.com/maps/search/${searchQuery}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    console.log("Esperando links de places...");
    await page.waitForSelector('a[href*="/maps/place/"]', { timeout: 15000 }).catch(() => console.log("Timeout esperando a[href*='/maps/place/']"));

    const html = await page.content();
    console.log("Tamanho do HTML:", html.length);
    
    // Check if consent page
    if (html.includes('consent.google.com')) {
       console.log("Apareceu página de consentimento do Google!");
       // Pressionar aceitar se existir
       await page.click('button:has-text("Accept all"), button:has-text("Aceitar tudo")').catch(() => {});
       await page.waitForTimeout(3000);
    }

    const placeLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="/maps/place/"]')).map(a => (a as HTMLAnchorElement).href);
    });

    console.log("Encontrou links de places:", placeLinks.length);
    if (placeLinks.length > 0) {
        console.log("Primeiro link:", placeLinks[0]);
    } else {
        // Maybe the selector is different now?
        const allLinks = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => a.href).filter(h => h.includes('place')));
        console.log("Outros links com 'place':", allLinks.length);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
}
test();
