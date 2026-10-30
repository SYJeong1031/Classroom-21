// 공개 폴더에는 화면 파일만 복사합니다. 서버 설정과 비밀 파일은 포함하지 않습니다.
import {mkdirSync,copyFileSync,writeFileSync,appendFileSync,readdirSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// PDF 링크가 실제 원본 파일과 일치하는지 먼저 확인합니다.
for (const match of readFileSync(resolve(root,'rules.html'),'utf8').matchAll(/href="([^"]+\.pdf)"/g)) {
  const target=decodeURIComponent(match[1]);
  if (!target.startsWith('documents/') || !existsSync(resolve(root,target))) throw new Error('PDF 링크와 파일명이 다릅니다: '+target);
}
mkdirSync(resolve(root,'public'),{recursive:true});
for (const file of ['index.html','style.css','app.js','config.js','favicon.svg','rules.html','rules.css','theme.js','theme.css']) copyFileSync(resolve(root,file),resolve(root,'public',file));
mkdirSync(resolve(root,'public/assets'),{recursive:true});
for (const file of ['chiikawa-background.png','chiikawa-characters.png']) copyFileSync(resolve(root,'assets',file),resolve(root,'public/assets',file));
// 빌드 산출물만 재생성하여 이전 파일명의 PDF가 남지 않도록 합니다.
rmSync(resolve(root,'public/documents'),{recursive:true,force:true});
mkdirSync(resolve(root,'public/documents'),{recursive:true});
for (const entry of readdirSync(resolve(root,'documents'),{withFileTypes:true})) {
  if (entry.isFile() && /\.(pdf|png)$/i.test(entry.name)) copyFileSync(resolve(root,'documents',entry.name),resolve(root,'public/documents',entry.name.normalize('NFC')));
}
writeFileSync(resolve(root,'public/_headers'),`/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Robots-Tag: noindex, nofollow\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://classroom-21-api.ssyyjeong2012.workers.dev; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'\n`);
// PDF 파일명은 ASCII fallback과 RFC 5987 UTF-8 filename*로 전달합니다.
for (const entry of readdirSync(resolve(root,'documents'),{withFileTypes:true})) {
  if (!entry.isFile() || !/\.pdf$/i.test(entry.name)) continue;
  const name=entry.name.normalize('NFC');
  const encoded=encodeURIComponent(name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
  const fallback=name.includes('ようやく') ? 'class-rules-summary.pdf' : 'class-rules.pdf';
  appendFileSync(resolve(root,'public/_headers'),`/documents/${encoded}\n  Content-Disposition: inline; filename="${fallback}"; filename*=UTF-8''${encoded}\n`);
}
console.log('화면 파일만 public/에 준비했습니다.');
