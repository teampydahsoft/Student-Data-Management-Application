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

  const uniqueSuffix = `_prnt${Math.random().toString(36).substring(2, 8)}`;
  const idMap = new Map();

  clone.querySelectorAll('[id]').forEach((el) => {
    const oldId = el.getAttribute('id');
    if (!oldId) return;

    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    const isSvgResource = el.closest('defs') || ['lineargradient', 'radialgradient', 'clippath', 'pattern', 'filter', 'mask', 'stop', 'svg'].includes(tag);

    if (isSvgResource) {
      const newId = `${oldId}${uniqueSuffix}`;
      idMap.set(oldId, newId);
      el.setAttribute('id', newId);
    } else {
      el.removeAttribute('id');
    }
  });

  if (idMap.size > 0) {
    let html = clone.innerHTML;
    idMap.forEach((newId, oldId) => {
      const escapedOldId = oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`url\\((['"]?)#${escapedOldId}\\1\\)`, 'g');
      html = html.replace(regex, `url(#${newId})`);
    });
    clone.innerHTML = html;
  }

  clone.style.removeProperty('min-height');
  clone.style.removeProperty('aspect-ratio');
  clone.style.removeProperty('transform');
  clone.style.removeProperty('box-shadow');
  clone.style.removeProperty('border-radius');
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
 * @param {{ backOrientation?: 'straight' | 'rotate180' }} options
 * @returns {{ pages: number, students: number }}
 */
export function printIdCardFrontAndBack(
  frontSelector = '.id-card-print-front',
  backSelector = '.id-card-print-back',
  options = {}
) {
  const { backOrientation = 'straight' } = options;
  let fronts = Array.from(document.querySelectorAll(frontSelector));
  let backs = Array.from(document.querySelectorAll(backSelector));
  if (!fronts.length) {
    fronts = Array.from(document.querySelectorAll('.id-card-print-front, .id-card-batch-front'));
  }
  if (!backs.length) {
    backs = Array.from(document.querySelectorAll('.id-card-print-back, .id-card-batch-back'));
  }
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
    if (backOrientation === 'rotate180') {
      backPage.classList.add('rotate-back-180');
    }
    const clonedBack = cloneCard(backs[i]);
    if (backOrientation === 'rotate180') {
      clonedBack.classList.add('rotate-back-180');
    }
    backPage.appendChild(clonedBack);
    mount.appendChild(backPage);
  }

  runPrint(mount);
  return { pages: studentCount * 2, students: studentCount };
}
