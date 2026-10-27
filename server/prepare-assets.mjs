// 공개 폴더에는 화면 파일만 복사합니다. 서버 설정과 비밀 파일은 포함하지 않습니다.
import {mkdirSync,copyFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
mkdirSync(resolve(root,'public'),{recursive:true});
for (const file of ['index.html','style.css','app.js','config.js','favicon.svg']) copyFileSync(resolve(root,file),resolve(root,'public',file));
writeFileSync(resolve(root,'public/_headers'),`/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Robots-Tag: noindex, nofollow\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://classroom-21-api.ssyyjeong2012.workers.dev; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'\n`);
console.log('화면 파일만 public/에 준비했습니다.');
