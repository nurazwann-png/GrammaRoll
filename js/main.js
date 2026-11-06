// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════
document.getElementById('pause-btn').style.display='none';
document.getElementById('selfie-indicator').style.display='none';
document.getElementById('pause-btn').setAttribute('aria-label', 'Pause game');
document.querySelectorAll('.overlay').forEach(o => {
  if (!o.hasAttribute('role')) o.setAttribute('role', 'dialog');
  o.setAttribute('aria-modal', 'true');
});
document.getElementById('ctrl-left').setAttribute('aria-label', 'Move left');
document.getElementById('ctrl-right').setAttribute('aria-label', 'Move right');
document.getElementById('ctrl-jump').setAttribute('aria-label', 'Jump');

function populateLevelSelects() {
  const options = LEVEL_KEYS.map(k => `<option value="${k}">${levelLabel(k)} — ${esc(GRAMMAR_DB[k].topic)}</option>`).join('');
  ['mp-level-select', 'coop-level-select'].forEach(id => { document.getElementById(id).innerHTML = options; });
  document.getElementById('guru-level-select').innerHTML = options;
}
populateLevelSelects();
applyMotionSetting();
applyFontSetting();
renderMenuWorlds();
refreshClassInfo().then(pullProgress);
// Ask who is playing when this device has players but none chosen (or none yet, once per visit)
if (!currentProfileId() && !sessionStorage.getItem('gr_profile_asked')) {
  try { sessionStorage.setItem('gr_profile_asked', '1'); } catch (e) {}
  showProfilePicker();
}
requestAnimationFrame(loop);

