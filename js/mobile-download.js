(() => {
  const capacitor = window.Capacitor;
  if (capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform()) return;

  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  if (!ios && !android) return;

  const offer = document.querySelector('#mobileDownloadOffer');
  const link = document.querySelector('#mobileDownloadLink');
  const filename = ios ? 'PesoPath-unsigned.ipa' : 'PesoPath.apk';
  link.setAttribute('href', `./downloads/${filename}`);
  link.setAttribute('download', filename);
  link.textContent = ios ? 'Download unsigned iOS IPA' : 'Download Android APK';
  document.querySelector('#mobileDownloadDescription').textContent = ios
    ? 'This IPA is unsigned. Sign it with your Apple Account using a compatible sideloading tool, usually on a computer. Downloading it alone will not install the app.'
    : 'Allow Install unknown apps for your browser when Android asks. Back up your data before changing signing keys.';
  document.querySelector('#mobileDownloadPwa').textContent = ios
    ? 'Alternatively, in Safari choose Share > Add to Home Screen.'
    : 'Alternatively, use your browser\'s Install app option.';
  document.querySelector('#mobileDownloadDismiss').onclick = () => { offer.hidden = true; };

  fetch(link.href, { method: 'HEAD', cache: 'no-store' }).then((response) => {
    const type = response.headers.get('content-type') || '';
    if (!response.ok || /text\/html/i.test(type)) {
      console.warn(`Mobile download unavailable: ${response.status} ${type}`);
      return;
    }
    offer.hidden = false;
  }).catch((error) => { console.warn('Mobile download unavailable:', error); });
})();
