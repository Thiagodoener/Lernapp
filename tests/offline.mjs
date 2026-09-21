// Prueft Abnahmekriterium 18 aus Kapitel 35 und die Sichtbarkeit des
// Offline-Zustands aus Kapitel 27: Die App muss ohne Netz aus dem
// Service-Worker-Cache starten und sagen, was pausiert.
//
// Aufruf:
//   npx http-server -p 8099 -s .
//   node tests/offline.mjs [http://127.0.0.1:8099]
import {chromium} from 'playwright';

const BASE=process.argv[2]||'http://127.0.0.1:8099';
let failures=0;
const step=(name,ok,extra='')=>{if(!ok)failures++;console.log(`${ok?'OK  ':'FEHL'} ${name}${extra?' · '+extra:''}`);};

const browser=await chromium.launch();
const ctx=await browser.newContext();
const page=await ctx.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});

await page.goto(BASE,{waitUntil:'networkidle'});
step('Mit Netz kein Offline-Hinweis',!(await page.isVisible('#connection-status')));

await ctx.setOffline(true);
await page.waitForTimeout(400);
step('Offline-Hinweis erscheint',await page.isVisible('#connection-status'),
  (await page.textContent('#connection-status')||'').slice(0,50)+'…');

await page.reload({waitUntil:'domcontentloaded'});
await page.waitForTimeout(1500);
step('Neustart ohne Netz aus dem Cache',await page.isVisible('[data-tab="learn"]'));
for(const tab of ['library','learn','progress','profile']){
  await page.click(`[data-tab="${tab}"]`);
  await page.waitForTimeout(400);
}
step('Alle Bereiche offline bedienbar',await page.isVisible('[data-tab="today"]'));

await ctx.setOffline(false);
await page.waitForTimeout(400);
step('Hinweis verschwindet mit der Verbindung',!(await page.isVisible('#connection-status')));

if(errors.length){failures++;console.log('\nKonsolenfehler: '+JSON.stringify(errors,null,1));}
else console.log('\nKonsolenfehler: keine');
await browser.close();
console.log(failures?`\n${failures} Pruefung(en) fehlgeschlagen.`:'\nAlle Pruefungen bestanden.');
process.exit(failures?1:0);
