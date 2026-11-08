/**
 * Opens a tab synchronously, inside the click, then points it at a URL that is minted after an
 * await. Opening only after the await is a popup the browser blocks without telling anyone.
 */
export async function openSignedPdf(mint: () => Promise<string | null>): Promise<boolean> {
  const tab = window.open('', '_blank');
  try {
    const url = await mint();
    if (!url) {
      tab?.close();
      return false;
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener');
    }
    return true;
  } catch (err) {
    tab?.close();
    throw err;
  }
}
