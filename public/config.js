// 배포된 Cloudflare 앱과 연결합니다. 파일을 직접 열면 실제 웹앱으로 이동합니다.
const classroomURL = 'https://classroom-21-api.ssyyjeong2012.workers.dev';
if (window.location.protocol === 'file:') window.location.replace(classroomURL);
window.CLASSROOM_CONFIG = Object.freeze({API_BASE: classroomURL, CACHE_MS: 60000});
