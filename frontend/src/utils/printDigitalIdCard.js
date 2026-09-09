/**
 * Print Digital ID Card(s) for Evolis CR80.
 * Clones source node(s) into a body-level mount so parent transforms can't blank the preview.
 */

const MOUNT_ID = 'id-card-print-mount';

function ensureMount() {
  let mount = document.getElementById(MOUNT_ID);
  if (!mount) {
    mount = document.createElement('div');
    mount.id = MOUNT_ID;
    document.body.appendChild(mount);
  }
  return mount;
}

function cloneCard(source) {
  const clone = source.cloneNode(true);
  clone.classList.add('id-card-print-root');
  clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  // Screen preview uses aspect-ratio + minHeight:520px — those clip the footer in CR80 print
  clone.style.removeProperty('min-height');
  clone.style.removeProperty('aspect-ratio');
  clone.style.height = '85.6mm';
  clone.style.width = '54mm';
  clone.style.maxWidth = '54mm';
  clone.style.minHeight = '0';
  clone.style.overflow = 'hidden';
  return clone;
}

function runPrint(mount) {
  const cleanup = () => {
    document.body.classList.remove('printing-id-card');
    mount.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };

  window.removeEventListener('afterprint', cleanup);
  window.addEventListener('afterprint', cleanup);
  document.body.classList.add('printing-id-card');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
    });
  });
}

/**
 * Print a single card face (front or back).
 * @param {string} rootSelector
 */
export function printDigitalIdCard(rootSelector = '.id-card-print-root') {
  const source = document.querySelector(rootSelector);
  if (!source) {
    throw new Error('ID card not found — preview the card first');
  }

  const mount = ensureMount();
  mount.innerHTML = '';
  const page = document.createElement('div');
  page.className = 'id-card-print-page';
  page.appendChild(cloneCard(source));
  mount.appendChild(page);
  runPrint(mount);
}

/**
 * Print front + back as CR80 pages.
 * Supports one student or many (N fronts + N backs → 2N pages).
 * @param {string} frontSelector
 * @param {string} backSelector
 * @returns {{ pages: number, students: number }}
 */
export function printIdCardFrontAndBack(
  frontSelector = '.id-card-print-front',
  backSelector = '.id-card-print-back'
) {
  const fronts = Array.from(document.querySelectorAll(frontSelector));
  const backs = Array.from(document.querySelectorAll(backSelector));
  if (!fronts.length) {
    throw new Error('ID card front not found — select a student first');
  }
  if (!backs.length) {
    throw new Error('ID card back not found');
  }

  const studentCount = Math.min(fronts.length, backs.length);
  const mount = ensureMount();
  mount.innerHTML = '';

  for (let i = 0; i < studentCount; i += 1) {
    const frontPage = document.createElement('div');
    frontPage.className = 'id-card-print-page';
    frontPage.setAttribute('data-print-side', 'front');
    frontPage.setAttribute('data-print-index', String(i + 1));
    frontPage.appendChild(cloneCard(fronts[i]));
    mount.appendChild(frontPage);

    const backPage = document.createElement('div');
    backPage.className = 'id-card-print-page';
    backPage.setAttribute('data-print-side', 'back');
    backPage.setAttribute('data-print-index', String(i + 1));
    backPage.appendChild(cloneCard(backs[i]));
    mount.appendChild(backPage);
  }

  runPrint(mount);
  return { pages: studentCount * 2, students: studentCount };
}
