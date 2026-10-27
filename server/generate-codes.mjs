// 관리자 PC에서 한 번 실행합니다. 생성 파일은 GitHub에 올리지 마세요.
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const codes=Object.fromEntries(Array.from({length:27},(_,i)=>[String(2101+i),randomBytes(12).toString('base64url')]));
// wx prevents accidental replacement of already-distributed student codes.
writeFileSync('student-codes.local.json',JSON.stringify(codes,null,2),{flag:'wx',mode:0o600});
writeFileSync('access-codes.csv','학번,개인 조회 코드\n'+Object.entries(codes).map(([id,code])=>`${id},${code}`).join('\n'),{flag:'wx',mode:0o600});
console.log('student-codes.local.json 및 access-codes.csv 생성 완료. 각 학생에게 본인 코드만 전달하세요.');
