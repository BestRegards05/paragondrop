(() => {
  'use strict';

  const ITEMS = window.PARAGON_ITEMS || [];
  const BY_ID = new Map(ITEMS.map(value => [value.id, value]));
  const KEY = 'paragondrop-save-v1';
  const PAGE_SIZE = 15;
  const MAX_CHANCE = 75;
  const selected = new Set();
  const $ = id => document.getElementById(id);
  const item = id => BY_ID.get(Number(id));
  const icon = name => window.PARAGON_ICONS?.[name] || '';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const fmt = value => Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const random = () => {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] / 4294967296;
  };

  function initial() {
    const starters = ITEMS.filter(value => value.value === 2);
    return {
      balance: 3,
      inventory: [starters[Math.floor(random() * starters.length)].id],
      clickRemainder: 0,
      totalClicks: 0,
      clickEarned: 0,
      wins: 0,
      losses: 0,
      sound: true,
    };
  }

  function valid(value) {
    return value && Number.isFinite(value.balance) && value.balance >= 0 &&
      Array.isArray(value.inventory) && value.inventory.length <= 100000 &&
      value.inventory.every(id => item(id)) &&
      ['clickRemainder', 'totalClicks', 'clickEarned', 'wins', 'losses'].every(key => Number.isInteger(value[key]) && value[key] >= 0) &&
      value.clickRemainder < 10 && typeof value.sound === 'boolean';
  }

  let state;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
    state = valid(stored) ? stored : initial();
  } catch {
    state = initial();
  }

  let targetId = null;
  let spinning = false;
  let spinSnapshot = null;
  let lastResult = null;
  let leftMode = 'inventory';
  let leftPage = 0;
  let targetPage = 0;
  let targetAsc = false;
  let activeMultiplier = null;
  let clickTimes = [];
  let audioContext;
  let noiseBuffer;
  let storageWarning = false;
  let pendingStorage = false;
  let rotation = 0;
  let lastSoundTime = 0;

  function toast(message, type = '') {
    const element = document.createElement('div');
    element.className = 'toast ' + type;
    element.textContent = message;
    $('toastStack').append(element);
    while ($('toastStack').children.length > 3) $('toastStack').firstChild.remove();
    setTimeout(() => element.remove(), 3200);
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch {
      if (!storageWarning) {
        toast('Сохранение недоступно в этом браузере', 'bad');
        storageWarning = true;
      }
      return false;
    }
  }

  function save() {
    persist();
    renderHeader();
  }

  function loadCurrentSave() {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!valid(stored)) return false;
      state = stored;
      return true;
    } catch {
      return false;
    }
  }

  function getAudio() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return null;
    if (!audioContext) {
      audioContext = new Audio();
      noiseBuffer = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * 0.3), audioContext.sampleRate);
      const channel = noiseBuffer.getChannelData(0);
      for (let n = 0; n < channel.length; n++) channel[n] = Math.random() * 2 - 1;
    }
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
  }

  function sound(type) {
    if (!state.sound || document.hidden) return;
    try {
      const context = getAudio();
      if (!context) return;
      const time = context.currentTime;
      if ((type === 'click' || type === 'tick') && time - lastSoundTime < 0.065) return;
      lastSoundTime = time;

      const noise = (delay, duration, volume, frequency) => {
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        source.buffer = noiseBuffer;
        filter.type = 'bandpass';
        filter.frequency.value = frequency;
        filter.Q.value = 0.7;
        gain.gain.setValueAtTime(volume, time + delay);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + delay + duration);
        source.connect(filter).connect(gain).connect(context.destination);
        source.start(time + delay);
        source.stop(time + delay + duration);
        source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
      };

      const note = (frequency, delay, duration, volume) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const filter = context.createBiquadFilter();
        oscillator.type = 'triangle';
        oscillator.frequency.value = frequency;
        filter.type = 'lowpass';
        filter.frequency.value = 1600;
        gain.gain.setValueAtTime(0.0001, time + delay);
        gain.gain.linearRampToValueAtTime(volume, time + delay + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + delay + duration);
        oscillator.connect(filter).connect(gain).connect(context.destination);
        oscillator.start(time + delay);
        oscillator.stop(time + delay + duration);
        oscillator.onended = () => { oscillator.disconnect(); filter.disconnect(); gain.disconnect(); };
      };

      if (type === 'click') noise(0, 0.03, 0.025, 1100);
      else if (type === 'tick') noise(0, 0.017, 0.018, 2100);
      else if (type === 'buy') {
        noise(0, 0.025, 0.04, 2900);
        note(740, 0, 0.09, 0.018);
        note(1110, 0.045, 0.15, 0.016);
      } else if (type === 'win') {
        noise(0, 0.12, 0.045, 3700);
        [440, 554.37, 659.25, 880].forEach((frequency, index) => note(frequency, index * 0.045, 0.55, 0.022));
      } else if (type === 'lose') {
        noise(0, 0.16, 0.055, 300);
        note(146.83, 0, 0.32, 0.025);
        note(110, 0.035, 0.42, 0.022);
      }
    } catch {
      // Audio is optional; a denied audio device must not stop the game.
    }
  }

  function renderHeader() {
    $('balance').textContent = fmt(state.balance);
    $('soundToggle').innerHTML = icon(state.sound ? 'sound' : 'soundOff');
    $('soundToggle').setAttribute('aria-label', state.sound ? 'Выключить звук' : 'Включить звук');
    $('soundToggle').setAttribute('aria-pressed', String(state.sound));
    $('soundSetting').querySelector('span').textContent = state.sound ? 'Включён' : 'Выключен';
  }

  function selectedEntries() {
    return [...selected].sort((a, b) => a - b).map(index => ({ index, skin: item(state.inventory[index]) })).filter(entry => entry.skin);
  }

  function stakeTotal() {
    return money(selectedEntries().reduce((sum, entry) => sum + entry.skin.value, 0));
  }

  function eligible(total, target) {
    return total > 0 && target && total / target.value * 100 <= MAX_CHANCE + 1e-9;
  }

  function finalChance(total, target) {
    if (!eligible(total, target)) return 0;
    const probability = total / target.value * 100;
    return probability > 30 ? probability - 5 : probability;
  }

  function invalidateTarget() {
    if (targetId !== null && !eligible(stakeTotal(), item(targetId))) targetId = null;
  }

  function clearResult() {
    lastResult = null;
    $('resultLabel').textContent = '';
    $('machine').classList.remove('win', 'lose');
  }

  function clearButton(kind) {
    return '<button class="clear-pick" aria-label="Убрать ' + (kind === 'stake' ? 'ставку' : 'цель') + '"' + (spinning ? ' disabled' : '') + '>' + icon('close') + '</button>';
  }

  function skinHero(skin, kind) {
    if (!skin) return '<div class="empty-symbol">' + icon(kind === 'stake' ? 'stack' : 'chevrons') + '</div><h2>' + (kind === 'stake' ? 'Выбери скины' : 'Выбери скин') + '</h2>';
    return clearButton(kind) + '<span class="eyebrow">' + esc(skin.stand) + '</span><h2>' + esc(skin.code) + '</h2><span class="full-name">' + esc(skin.name) + '</span><img src="' + skin.image + '" alt="' + esc(skin.name) + '"><div class="hero-price">' + fmt(skin.value) + ' ' + icon('arrow') + '</div>';
  }

  function stakeHero(entries, total) {
    if (entries.length < 2) return skinHero(entries[0]?.skin, 'stake');
    const shown = entries.slice(0, 4);
    const suffix = entries.length % 100 >= 11 && entries.length % 100 <= 14 ? 'скинов' : entries.length % 10 === 1 ? 'скин' : entries.length % 10 >= 2 && entries.length % 10 <= 4 ? 'скина' : 'скинов';
    return clearButton('stake') + '<span class="eyebrow">ТВОЯ СТАВКА</span><h2>' + entries.length + ' ' + suffix + '</h2><div class="stake-collage">' + shown.map(({ skin }) => '<img src="' + skin.image + '" alt="' + esc(skin.name) + '">').join('') + '</div><div class="hero-price">' + fmt(total) + ' ' + icon('arrow') + '</div>';
  }

  function renderHero() {
    const activeEntries = selectedEntries();
    const shown = spinning ? spinSnapshot : lastResult && !activeEntries.length && targetId === null ? lastResult : null;
    const entries = shown ? shown.entries : activeEntries;
    const total = shown ? shown.total : stakeTotal();
    const target = shown ? shown.target : item(targetId);
    const probability = shown ? shown.probability : finalChance(total, target);
    const stakeCard = $('stakeCard');
    const targetCard = $('targetCard');
    stakeCard.classList.toggle('hero-empty', entries.length === 0);
    targetCard.classList.toggle('hero-empty', !target);
    stakeCard.innerHTML = stakeHero(entries, total);
    targetCard.innerHTML = skinHero(target, 'target');
    stakeCard.querySelector('.clear-pick')?.addEventListener('click', () => {
      if (spinning) return;
      selected.clear();
      targetId = null;
      activeMultiplier = null;
      clearResult();
      renderAll();
    });
    targetCard.querySelector('.clear-pick')?.addEventListener('click', () => {
      if (spinning) return;
      targetId = null;
      activeMultiplier = null;
      clearResult();
      renderAll();
    });
    $('chanceValue').innerHTML = fmt(probability) + '<span>%</span>';
    $('chanceArc').style.background = 'conic-gradient(var(--accent) ' + probability * 3.6 + 'deg, transparent ' + probability * 3.6 + 'deg)';
    $('multiplier').textContent = total && target ? '×' + fmt(target.value / total) : '';
    $('upgradeBtn').disabled = spinning || !finalChance(stakeTotal(), item(targetId));
    $('clickOrb').disabled = spinning;
    document.querySelectorAll('[data-multiplier]').forEach(button => {
      button.classList.toggle('active', Number(button.dataset.multiplier) === activeMultiplier);
      button.setAttribute('aria-pressed', String(Number(button.dataset.multiplier) === activeMultiplier));
      button.disabled = spinning || !stakeTotal();
    });
  }

  function tile(skin, mode, index) {
    const selectedSkin = mode === 'target' ? targetId === skin.id : mode === 'inventory' && selected.has(index);
    const disabled = spinning || mode === 'shop' && state.balance < skin.value;
    return '<article class="item-card ' + (selectedSkin ? 'selected' : '') + '" style="--item-color:' + skin.colors[1] + '"><button class="item-pick" data-mode="' + mode + '" data-id="' + skin.id + '" data-index="' + index + '" title="' + esc(skin.name + ' · ' + skin.stand + ' · ' + fmt(skin.value) + ' LA') + '" aria-pressed="' + selectedSkin + '"' + (disabled ? ' disabled' : '') + '><span class="item-price">' + fmt(skin.value) + ' ' + icon('arrow') + '</span><img loading="lazy" src="' + skin.image + '" alt="' + esc(skin.name) + '"><span class="item-name">' + esc(skin.code) + '</span><span class="item-stand">' + esc(skin.stand) + '</span>' + (selectedSkin ? '<span class="item-check">' + icon('check') + '</span>' : '') + '</button>' + (mode === 'inventory' ? '<button class="item-sell" data-sell="' + index + '"' + (spinning ? ' disabled' : '') + '>Продать · ' + fmt(skin.value) + '</button>' : '') + '</article>';
  }

  function paging(prefix, page, total) {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    $(prefix + 'Page').textContent = page + 1 + ' / ' + pages;
    $(prefix + 'Prev').disabled = page === 0;
    $(prefix + 'Next').disabled = page >= pages - 1;
  }

  function renderLeft() {
    const search = $('leftSearch').value.trim().toLowerCase();
    const inventory = spinning ? spinSnapshot.inventory : state.inventory;
    let entries = leftMode === 'inventory' ? inventory.map((id, index) => ({ skin: item(id), index })) : ITEMS.map(skin => ({ skin, index: -1 })).sort((a, b) => a.skin.value - b.skin.value);
    if (search) entries = entries.filter(({ skin }) => (skin.name + ' ' + skin.code + ' ' + skin.stand).toLowerCase().includes(search));
    leftPage = Math.min(leftPage, Math.max(0, Math.ceil(entries.length / PAGE_SIZE) - 1));
    $('leftTitle').textContent = leftMode === 'inventory' ? 'Мой инвентарь' : 'Магазин';
    if ($('inventoryCount')) $('inventoryCount').textContent = leftMode === 'inventory' ? inventory.length : ITEMS.length;
    if ($('inventoryWorth')) $('inventoryWorth').innerHTML = leftMode === 'inventory' ? fmt(inventory.reduce((sum, id) => sum + item(id).value, 0)) + ' ' + icon('arrow') : '';
    $('leftGrid').innerHTML = entries.slice(leftPage * PAGE_SIZE, (leftPage + 1) * PAGE_SIZE).map(({ skin, index }) => tile(skin, leftMode, index)).join('');
    $('leftEmpty').hidden = entries.length > 0;
    $('leftEmpty').textContent = search ? 'Ничего не найдено' : 'Инвентарь пуст';
    paging('left', leftPage, entries.length);
    for (const mode of ['inventory', 'shop']) {
      $(mode + 'Tab').classList.toggle('active', leftMode === mode);
      $(mode + 'Tab').setAttribute('aria-pressed', String(leftMode === mode));
    }
  }

  function renderTargets() {
    const search = $('targetSearch').value.trim().toLowerCase();
    const min = $('priceMin').value === '' ? 0 : Math.max(0, Number($('priceMin').value) || 0);
    const max = $('priceMax').value === '' ? Infinity : Number($('priceMax').value);
    const total = spinning ? spinSnapshot.total : stakeTotal();
    const entries = ITEMS.filter(skin => (!total || eligible(total, skin)) && skin.value >= min && skin.value <= max && (skin.name + ' ' + skin.code + ' ' + skin.stand).toLowerCase().includes(search)).sort((a, b) => targetAsc ? a.value - b.value : b.value - a.value);
    targetPage = Math.min(targetPage, Math.max(0, Math.ceil(entries.length / PAGE_SIZE) - 1));
    $('targetGrid').innerHTML = entries.slice(targetPage * PAGE_SIZE, (targetPage + 1) * PAGE_SIZE).map(skin => tile(skin, 'target', -1)).join('');
    if ($('targetCount')) $('targetCount').textContent = entries.length;
    $('targetEmpty').hidden = entries.length > 0;
    $('sortTargets').innerHTML = icon(targetAsc ? 'sortUp' : 'sortDown');
    $('sortTargets').setAttribute('aria-label', targetAsc ? 'Сначала дорогие' : 'Сначала дешёвые');
    paging('target', targetPage, entries.length);
  }

  function renderClicker() {
    $('clickProgress').textContent = state.clickRemainder;
    $('clickBar').style.width = state.clickRemainder * 10 + '%';
    if ($('totalClicks')) $('totalClicks').textContent = fmt(state.totalClicks);
    if ($('clickEarned')) $('clickEarned').textContent = fmt(state.clickEarned);
  }

  function renderAll() {
    renderHeader();
    renderHero();
    renderLeft();
    renderTargets();
    renderClicker();
  }

  function buy(id) {
    if (spinning) return;
    const skin = item(id);
    if (!skin || state.balance < skin.value) return;
    state.balance = money(state.balance - skin.value);
    state.inventory.push(skin.id);
    save();
    renderAll();
    sound('buy');
    toast(skin.code + ' куплен', 'good');
  }

  function sell(index) {
    if (spinning || !Number.isInteger(index) || index < 0) return;
    const skin = item(state.inventory[index]);
    if (!skin) return;
    state.inventory.splice(index, 1);
    state.balance = money(state.balance + skin.value);
    const nextSelection = [...selected].filter(value => value !== index).map(value => value > index ? value - 1 : value);
    selected.clear();
    nextSelection.forEach(value => selected.add(value));
    activeMultiplier = null;
    invalidateTarget();
    clearResult();
    save();
    renderAll();
    sound('buy');
  }

  function pickMultiplier(multiplier) {
    if (spinning || !stakeTotal()) return;
    const total = stakeTotal();
    const minimum = money(total * multiplier);
    const target = ITEMS.filter(skin => eligible(total, skin) && skin.value >= minimum).sort((a, b) => a.value - b.value)[0];
    activeMultiplier = multiplier;
    $('priceMin').value = minimum;
    $('priceMax').value = '';
    $('targetSearch').value = '';
    targetAsc = true;
    targetPage = 0;
    targetId = target?.id ?? null;
    clearResult();
    renderAll();
    if (!target) toast('Нет скина на такой множитель');
  }

  document.addEventListener('click', event => {
    const sellButton = event.target.closest('[data-sell]');
    if (sellButton) { sell(Number(sellButton.dataset.sell)); return; }
    const multiplierButton = event.target.closest('[data-multiplier]');
    if (multiplierButton && !multiplierButton.disabled) { pickMultiplier(Number(multiplierButton.dataset.multiplier)); return; }
    const button = event.target.closest('[data-mode]');
    if (!button || spinning || button.disabled) return;
    const id = Number(button.dataset.id);
    if (button.dataset.mode === 'shop') { buy(id); return; }
    if (button.dataset.mode === 'inventory') {
      const index = Number(button.dataset.index);
      if (!item(state.inventory[index])) return;
      if (selected.has(index)) selected.delete(index);
      else selected.add(index);
      activeMultiplier = null;
      invalidateTarget();
      targetPage = 0;
    } else {
      if (stakeTotal() && !eligible(stakeTotal(), item(id))) return;
      targetId = id;
      activeMultiplier = null;
    }
    clearResult();
    sound('click');
    renderAll();
  });

  function playTicks(duration) {
    const started = performance.now();
    const next = () => {
      const elapsed = performance.now() - started;
      if (!spinning || elapsed >= duration - 60) return;
      sound('tick');
      const fraction = elapsed / duration;
      setTimeout(next, 55 + 230 * fraction * fraction);
    };
    next();
  }

  async function upgrade() {
    const entries = selectedEntries();
    const total = stakeTotal();
    const target = item(targetId);
    const probability = finalChance(total, target);
    if (spinning || !entries.length || !probability || !target) return;

    const roll = random() * 100;
    const win = roll < probability;
    const refund = money(total * 0.1);
    spinSnapshot = { entries, total, target, probability, inventory: state.inventory.slice(), win, refund };
    spinning = true;
    renderAll();
    const removed = new Set(entries.map(entry => entry.index));
    state.inventory = state.inventory.filter((id, index) => !removed.has(index));
    if (win) {
      state.inventory.push(target.id);
      state.wins++;
    } else {
      state.balance = money(state.balance + refund);
      state.losses++;
    }
    // Save the single settled transaction before the visual spin starts.
    persist();

    $('machine').classList.remove('win', 'lose');
    $('resultLabel').textContent = '';
    $('upgradeBtn').setAttribute('aria-busy', 'true');
    const duration = reducedMotion.matches ? 150 : 3100;
    rotation = (Math.floor(rotation / 360) + 5) * 360 + roll * 3.6;
    $('needle').style.transition = 'transform ' + duration + 'ms cubic-bezier(.1,.62,.17,1)';
    $('needle').style.transform = 'rotate(' + rotation + 'deg)';
    if (!reducedMotion.matches) playTicks(duration);
    await new Promise(resolve => setTimeout(resolve, duration));

    selected.clear();
    targetId = null;
    activeMultiplier = null;
    lastResult = spinSnapshot;
    spinSnapshot = null;
    spinning = false;
    if (pendingStorage) {
      pendingStorage = false;
      loadCurrentSave();
    }
    $('machine').classList.add(win ? 'win' : 'lose');
    $('resultLabel').textContent = win ? 'УСПЕХ' : 'НЕУДАЧА';
    $('upgradeBtn').removeAttribute('aria-busy');
    renderAll();
    sound(win ? 'win' : 'lose');
    if (win) toast(target.code + ' получен', 'good');
    else toast('+' + fmt(refund) + ' LA', 'bad');
  }

  function doClick() {
    if (spinning) return;
    const now = performance.now();
    clickTimes = clickTimes.filter(time => now - time < 1000);
    if (clickTimes.length >= 10) return;
    clickTimes.push(now);
    state.totalClicks++;
    state.clickRemainder++;
    if (state.clickRemainder === 10) {
      state.clickRemainder = 0;
      state.clickEarned++;
      state.balance = money(state.balance + 1);
      sound('buy');
      renderLeft();
      $('clickOrb').classList.remove('reward');
      requestAnimationFrame(() => $('clickOrb').classList.add('reward'));
    }
    save();
    renderClicker();
  }

  function switchLeft(mode) {
    leftMode = mode;
    leftPage = 0;
    $('leftSearch').value = '';
    renderLeft();
  }

  const feedNames = ['xX_Den4ik_Xx', 'Maxim_204', 'daniil0079', 'N1kitaPro_12', 'Kirill0613', 'Timur_548', 'Artem1k2020', 'Vladik_4207', 'ilya8542', 'm1shanya_09', 'jojo_fan781', 'alex_kun17', 's0nik_12345', 'qwerty7720', 'matvey_903', 'zhora0987', 'Andrey_684', 'bobr123_77', 'Roma2284', 'yba_tryhard52', 'Kostya_719', 'player_63481', 'vamp1re_480', 'gojo7192', 'xxdanil_908', 'Yarik0_121', 'Fedor_4216', 'zephyr_089', 'stand_user004', 'DI0_9472'];
  const feedPool = ITEMS.filter(skin => skin.value >= 5);
  let previousName = '';
  function feedCard() {
    const skin = feedPool[Math.floor(random() * feedPool.length)];
    const availableNames = feedNames.filter(name => name !== previousName);
    const name = availableNames[Math.floor(random() * availableNames.length)];
    previousName = name;
    const element = document.createElement('div');
    element.className = 'feed-card feed-entry';
    element.style.setProperty('--item-color', skin.colors[1]);
    element.innerHTML = '<img src="' + skin.image + '" alt=""><div class="feed-copy"><b>' + esc(skin.code) + '</b><small>' + name + '</small></div><span class="feed-price">' + fmt(skin.value) + ' ' + icon('arrow') + '</span>';
    return element;
  }

  function makeFeed() {
    const feed = $('liveFeed');
    for (let index = 0; index < 15; index++) feed.append(feedCard());
    const update = () => {
      if (document.hidden) return;
      const fresh = feedCard();
      feed.prepend(fresh);
      while (feed.children.length > 15) feed.lastChild.remove();
      if (!reducedMotion.matches && feed.animate) {
        const style = getComputedStyle(fresh);
        const height = fresh.getBoundingClientRect().height + (parseFloat(style.marginBottom) || 0);
        feed.animate([{ transform: 'translateY(-' + height + 'px)' }, { transform: 'translateY(0)' }], { duration: 660, easing: 'cubic-bezier(.2,.6,.35,1)' });
      }
    };
    const schedule = () => setTimeout(() => { update(); schedule(); }, reducedMotion.matches ? 3200 : 950);
    schedule();
  }

  $('inventoryTab').onclick = () => switchLeft('inventory');
  $('shopTab').onclick = () => switchLeft('shop');
  $('openInventory').onclick = () => {
    switchLeft('inventory');
    $('inventoryPanel').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'center' });
    $('inventoryTab').focus({ preventScroll: true });
  };
  $('openClicker').onclick = () => $('clickerDialog').showModal();
  $('settingsBtn').onclick = () => $('settingsDialog').showModal();
  if ($('rulesBtn')) $('rulesBtn').onclick = () => {
    const details = $('settingsDialog').querySelector('details');
    if (details) details.open = true;
    $('settingsDialog').showModal();
  };
  document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
  $('leftSearch').oninput = () => { leftPage = 0; renderLeft(); };
  for (const id of ['targetSearch', 'priceMin', 'priceMax']) $(id).oninput = () => {
    activeMultiplier = null;
    targetPage = 0;
    renderTargets();
    renderHero();
  };
  $('sortTargets').onclick = () => { targetAsc = !targetAsc; targetPage = 0; renderTargets(); };
  for (const prefix of ['left', 'target']) for (const [suffix, delta] of [['Prev', -1], ['Next', 1]]) $(prefix + suffix).onclick = () => {
    if (prefix === 'left') { leftPage += delta; renderLeft(); }
    else { targetPage += delta; renderTargets(); }
  };
  $('upgradeBtn').onclick = upgrade;
  $('clickOrb').onclick = doClick;
  for (const id of ['soundToggle', 'soundSetting']) $(id).onclick = () => {
    state.sound = !state.sound;
    if (spinning) renderHeader();
    else save();
  };
  $('resetBtn').onclick = () => {
    if (spinning) { toast('Дождись апгрейда'); return; }
    if (confirm('Удалить весь прогресс?') && confirm('Начать заново? Отменить сброс нельзя.')) {
      state = initial();
      selected.clear();
      targetId = null;
      activeMultiplier = null;
      leftPage = targetPage = 0;
      clearResult();
      save();
      renderAll();
      $('settingsDialog').close();
    }
  };
  $('exportSave').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'paragondrop-progress.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('importSave').onclick = () => {
    if (spinning) { toast('Дождись апгрейда'); return; }
    $('saveFile').click();
  };
  $('saveFile').onchange = async () => {
    try {
      if (spinning) { toast('Дождись апгрейда'); return; }
      const file = $('saveFile').files[0];
      if (!file) return;
      if (file.size > 2e6) throw Error();
      const imported = JSON.parse(await file.text());
      if (spinning) { toast('Дождись апгрейда'); return; }
      if (!valid(imported)) throw Error();
      if (!confirm('Заменить текущий прогресс?')) return;
      if (spinning) { toast('Дождись апгрейда'); return; }
      state = imported;
      selected.clear();
      targetId = null;
      activeMultiplier = null;
      leftPage = targetPage = 0;
      clearResult();
      save();
      renderAll();
      toast('Прогресс загружен', 'good');
    } catch {
      toast('Неверный файл сохранения', 'bad');
    } finally {
      $('saveFile').value = '';
    }
  };
  window.addEventListener('storage', event => {
    if (event.key !== KEY) return;
    if (spinning) {
      pendingStorage = true;
      return;
    }
    // An event can be queued behind a newer write; the current save is authoritative.
    if (!loadCurrentSave()) return;
    selected.clear();
    targetId = null;
    activeMultiplier = null;
    clearResult();
    renderAll();
  });

  makeFeed();
  save();
  renderAll();
})();