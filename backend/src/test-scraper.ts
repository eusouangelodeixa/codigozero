import { chromium } from 'playwright';

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const query = "Restaurantes";
    const city = "Maputo";
    const searchQuery = encodeURIComponent(`${query} em ${city}`);
    await page.goto(`https://www.google.com/maps/search/${searchQuery}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('a[href*="/maps/place/"]', { timeout: 15000 }).catch(() => {});

    const placeLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="/maps/place/"]')).map(a => (a as any).href);
    });

    console.log("Encontrou links de places:", placeLinks.length);
    if (placeLinks.length > 0) {
        console.log("Visitando:", placeLinks[0]);
        await page.goto(placeLinks[0], { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000); // Dar tempo para renderizar os campos
        
        const details = await page.evaluate(() => {
            const nameEl = document.querySelector('h1');
            const name = nameEl ? nameEl.innerText : 'Desconhecido';
            
            const phoneEl = document.querySelector('button[data-item-id^="phone:"]');
            const phone = phoneEl ? (phoneEl as HTMLElement).innerText : null;
            
            const websiteEl = document.querySelector('a[data-item-id^="authority:"]');
            const website = websiteEl ? (websiteEl as HTMLAnchorElement).href : null;
            
            const addressEl = document.querySelector('button[data-item-id^="address:"]');
            const address = addressEl ? (addressEl as HTMLElement).innerText : null;

            return { name, phone, website, address };
        });
        console.log("Detalhes extraídos:", details);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
}
test();
