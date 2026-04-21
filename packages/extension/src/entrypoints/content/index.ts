export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    // Content Script: translation overlay を Shadow DOM でマウントする予定
    console.log('[perapera] content script loaded');
  },
});
