/**
 * "Versículo do dia" — a daily Bible verse for the member dashboard.
 *
 * Source: a public, token-free Bible API (bible-api.com, Portuguese "Almeida"
 * translation) is the PRIMARY source. Each verse also carries the Almeida text
 * inline as a fallback, so if the API is unreachable / rate-limited / missing a
 * verse, the dashboard still shows the correct verse. One upstream call per day
 * (cached), so rate limits never bite in production.
 *
 * The reference is chosen DETERMINISTICALLY from the date, so everyone sees the
 * same verse on a given day and it rotates day to day (never static). On
 * Saturdays it draws from a Sabbath-keeping set; the rest of the week it rotates
 * through work/diligence, loving God above all, reading the Word, perseverance
 * and trust in God.
 *
 * Dates use CAT (UTC+2, Mozambique) so "today" / "Saturday" match the user.
 */

interface VerseRef {
  en: string; // English reference for the API (bible-api.com parses English book names)
  pt: string; // Portuguese label shown in the UI
  text: string; // Almeida text — fallback when the API is unavailable
  theme: string;
}

const WEEKDAY_POOL: VerseRef[] = [
  { en: 'Colossians 3:23', pt: 'Colossenses 3:23', theme: 'trabalho', text: 'E, tudo quanto fizerdes, fazei-o de todo o coração, como ao Senhor e não aos homens.' },
  { en: 'Proverbs 16:3', pt: 'Provérbios 16:3', theme: 'trabalho', text: 'Confia ao Senhor as tuas obras, e teus pensamentos serão estabelecidos.' },
  { en: 'Proverbs 14:23', pt: 'Provérbios 14:23', theme: 'trabalho', text: 'Em todo o trabalho há proveito, mas a palavra dos lábios só encaminha para a pobreza.' },
  { en: 'Ecclesiastes 9:10', pt: 'Eclesiastes 9:10', theme: 'trabalho', text: 'Tudo quanto te vier à mão para fazer, faze-o conforme as tuas forças.' },
  { en: 'Proverbs 13:4', pt: 'Provérbios 13:4', theme: 'trabalho', text: 'A alma do preguiçoso deseja, e nada tem, mas a alma dos diligentes se fartará.' },
  { en: 'Matthew 6:33', pt: 'Mateus 6:33', theme: 'amor a Deus', text: 'Mas buscai primeiro o reino de Deus, e a sua justiça, e todas estas coisas vos serão acrescentadas.' },
  { en: 'Matthew 22:37', pt: 'Mateus 22:37', theme: 'amor a Deus', text: 'E Jesus disse-lhe: Amarás o Senhor teu Deus de todo o teu coração, e de toda a tua alma, e de todo o teu pensamento.' },
  { en: 'Deuteronomy 6:5', pt: 'Deuteronômio 6:5', theme: 'amor a Deus', text: 'Amarás, pois, o Senhor teu Deus de todo o teu coração, e de toda a tua alma, e de todas as tuas forças.' },
  { en: 'Mark 12:30', pt: 'Marcos 12:30', theme: 'amor a Deus', text: 'Amarás, pois, ao Senhor teu Deus de todo o teu coração, e de toda a tua alma, e de todo o teu entendimento, e de todas as tuas forças; este é o primeiro mandamento.' },
  { en: 'Joshua 1:8', pt: 'Josué 1:8', theme: 'leitura da Palavra', text: 'Não se aparte da tua boca o livro desta lei; antes medita nele dia e noite, para que tenhas cuidado de fazer conforme tudo quanto nele está escrito.' },
  { en: 'Psalm 119:105', pt: 'Salmos 119:105', theme: 'leitura da Palavra', text: 'Lâmpada para os meus pés é a tua palavra, e luz para o meu caminho.' },
  { en: '2 Timothy 3:16', pt: '2 Timóteo 3:16', theme: 'leitura da Palavra', text: 'Toda a Escritura é divinamente inspirada, e proveitosa para ensinar, para redarguir, para corrigir, para instruir em justiça.' },
  { en: 'Psalm 1:2', pt: 'Salmos 1:2', theme: 'leitura da Palavra', text: 'Antes tem o seu prazer na lei do Senhor, e na sua lei medita de dia e de noite.' },
  { en: 'Galatians 6:9', pt: 'Gálatas 6:9', theme: 'perseverança', text: 'E não nos cansemos de fazer o bem, porque a seu tempo ceifaremos, se não houvermos desfalecido.' },
  { en: 'James 1:12', pt: 'Tiago 1:12', theme: 'perseverança', text: 'Bem-aventurado o homem que suporta a tentação; porque, quando for provado, receberá a coroa da vida, a qual o Senhor tem prometido aos que o amam.' },
  { en: 'Philippians 4:13', pt: 'Filipenses 4:13', theme: 'perseverança', text: 'Posso todas as coisas naquele que me fortalece.' },
  { en: 'Isaiah 40:31', pt: 'Isaías 40:31', theme: 'perseverança', text: 'Mas os que esperam no Senhor renovarão as suas forças; subirão com asas como águias; correrão, e não se cansarão; caminharão, e não se fatigarão.' },
  { en: '1 Corinthians 15:58', pt: '1 Coríntios 15:58', theme: 'perseverança', text: 'Portanto, meus amados irmãos, sede firmes e constantes, sempre abundantes na obra do Senhor, sabendo que o vosso trabalho não é vão no Senhor.' },
  { en: 'Romans 12:11', pt: 'Romanos 12:11', theme: 'perseverança', text: 'Não sejais vagarosos no cuidado; sede fervorosos no espírito, servindo ao Senhor.' },
  { en: 'Jeremiah 29:11', pt: 'Jeremias 29:11', theme: 'confiança em Deus', text: 'Porque eu bem sei os pensamentos que tenho a vosso respeito, diz o Senhor; pensamentos de paz, e não de mal, para vos dar o fim que esperais.' },
  { en: 'Proverbs 3:5-6', pt: 'Provérbios 3:5-6', theme: 'confiança em Deus', text: 'Confia no Senhor de todo o teu coração, e não te estribes no teu próprio entendimento. Reconhece-o em todos os teus caminhos, e ele endireitará as tuas veredas.' },
  { en: 'Psalm 37:5', pt: 'Salmos 37:5', theme: 'confiança em Deus', text: 'Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.' },
];

const SABBATH_POOL: VerseRef[] = [
  { en: 'Exodus 20:8', pt: 'Êxodo 20:8', theme: 'guardar o sábado', text: 'Lembra-te do dia do sábado, para o santificar.' },
  { en: 'Deuteronomy 5:12', pt: 'Deuteronômio 5:12', theme: 'guardar o sábado', text: 'Guarda o dia de sábado, para o santificar, como te ordenou o Senhor teu Deus.' },
  { en: 'Isaiah 58:13', pt: 'Isaías 58:13', theme: 'guardar o sábado', text: 'Se desviares o teu pé do sábado, de fazeres a tua vontade no meu santo dia, e se chamares ao sábado deleitoso, e santo dia do Senhor, digno de honra.' },
  { en: 'Leviticus 23:3', pt: 'Levítico 23:3', theme: 'guardar o sábado', text: 'Seis dias trabalho se fará, mas o sétimo dia será o sábado do descanso, santa convocação; nenhum trabalho fareis; sábado do Senhor é em todas as vossas habitações.' },
  { en: 'Exodus 31:16', pt: 'Êxodo 31:16', theme: 'guardar o sábado', text: 'Guardarão, pois, o sábado os filhos de Israel, celebrando-o nas suas gerações por aliança perpétua.' },
  { en: 'Ezekiel 20:12', pt: 'Ezequiel 20:12', theme: 'guardar o sábado', text: 'E também lhes dei os meus sábados, para que servissem de sinal entre mim e eles, para que soubessem que eu sou o Senhor que os santifica.' },
  { en: 'Mark 2:27', pt: 'Marcos 2:27', theme: 'guardar o sábado', text: 'E disse-lhes: O sábado foi feito por causa do homem, e não o homem por causa do sábado.' },
];

export interface VerseOfDay {
  reference: string;
  text: string;
  theme: string;
  isSabbath: boolean;
  translation: string;
}

let cache: { key: string; data: VerseOfDay } | null = null;

export async function getVerseOfTheDay(): Promise<VerseOfDay> {
  // Shift to CAT (UTC+2) and read UTC fields → local Mozambique date/day.
  const local = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const isSabbath = local.getUTCDay() === 6; // Saturday
  const dateKey = `${y}-${m + 1}-${d}`;

  if (cache && cache.key === dateKey) return cache.data;

  const dayOfYear = Math.floor((Date.UTC(y, m, d) - Date.UTC(y, 0, 0)) / 86_400_000);
  const ref = isSabbath
    ? SABBATH_POOL[Math.floor(dayOfYear / 7) % SABBATH_POOL.length]
    : WEEKDAY_POOL[dayOfYear % WEEKDAY_POOL.length];

  // Built-in Almeida text is the default; the live API refines it when available.
  const data: VerseOfDay = {
    reference: ref.pt,
    text: ref.text,
    theme: ref.theme,
    isSabbath,
    translation: 'João Ferreira de Almeida',
  };

  try {
    const url = `https://bible-api.com/${encodeURIComponent(ref.en)}?translation=almeida`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const j: any = await r.json();
      const apiText = String(j?.text ?? '').replace(/\s+/g, ' ').trim();
      if (apiText && !j?.error) {
        data.text = apiText;
        if (j?.reference) data.reference = j.reference;
        if (j?.translation_name) data.translation = j.translation_name;
      }
    }
  } catch (e: any) {
    console.warn('[VERSE] live fetch failed, using built-in text:', e?.message || e);
  }

  cache = { key: dateKey, data };
  return data;
}
