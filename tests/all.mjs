// Faehrt alle Testreihen nacheinander. Erwartet einen laufenden Server:
//   npx http-server -p 8099 -s .
//   node tests/all.mjs
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const hier=path.dirname(fileURLToPath(import.meta.url));
const reihen=["e2e","offline","cloud","sync","mobile","optional"];
const ergebnis=[];

for(const name of reihen){
  process.stdout.write(`\n=== ${name} ===\n`);
  const code=await new Promise(resolve=>{
    const kind=spawn(process.execPath,[path.join(hier,`${name}.mjs`),...process.argv.slice(2)],{stdio:'inherit'});
    kind.on('close',resolve);
  });
  ergebnis.push({name,ok:code===0});
}

console.log('\n--- Gesamt ---');
for(const r of ergebnis)console.log(`${r.ok?'OK  ':'FEHL'} ${r.name}`);
const fehler=ergebnis.filter(r=>!r.ok).length;
console.log(fehler?`\n${fehler} Testreihe(n) fehlgeschlagen.`:'\nAlle Testreihen bestanden.');
process.exit(fehler?1:0);
