'use strict';
(() => {
  const KEY = 'classroom-21-theme';
  const validThemes = new Set(['default', 'chiikawa']);
  const selector = document.querySelector('#theme-select');
  const studentList = document.querySelector('#students');
  // 원본 PNG를 수정하지 않고 SVG viewBox로 세 캐릭터를 나누어 표시합니다.
  const characters = [
    {name: '치이카와', viewBox: '35 235 335 330'},
    {name: '하치와레', viewBox: '385 190 355 365'},
    {name: '우사기', viewBox: '755 35 370 440'}
  ];
  function decorateAvatars() {
    if (document.documentElement.dataset.theme !== 'chiikawa' || !studentList) return;
    studentList.querySelectorAll('.avatar-character').forEach(slot => {
      if (slot.firstElementChild) return;
      const character = characters[Number(slot.dataset.character) % characters.length];
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', character.viewBox);
      svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
      svg.setAttribute('aria-hidden', 'true');
      const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      img.setAttribute('href', 'assets/chiikawa-characters.png');
      img.setAttribute('width', '1126');
      img.setAttribute('height', '660');
      svg.append(img);
      slot.append(svg);
    });
  }
  function applyTheme(value, save = false) {
    const theme = validThemes.has(value) ? value : 'default';
    document.documentElement.dataset.theme = theme;
    if (selector) selector.value = theme;
    decorateAvatars();
    if (save) {
      try { localStorage.setItem(KEY, theme); } catch { /* 저장이 막혀도 현재 화면에는 적용 */ }
    }
  }
  let initial = 'default';
  try { initial = localStorage.getItem(KEY) || initial; } catch { /* 기본 테마 사용 */ }
  applyTheme(initial);
  selector?.addEventListener('change', () => applyTheme(selector.value, true));
  if (studentList) new MutationObserver(decorateAvatars).observe(studentList, {childList: true});
  window.addEventListener('storage', event => {if (event.key === KEY) applyTheme(event.newValue);});
})();
