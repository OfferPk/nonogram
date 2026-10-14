/* Play Games cloud save: OFF (scaffold only; the native bridge is not wired in this game yet). Never put a guessed ID here. */
window.CLOUD_CONFIG = {
  ENABLED: false,
  PLAY_GAMES_APP_ID: 'REPLACE_WITH_PLAY_GAMES_APP_ID', // numeric "App ID" from Play Console > Play Games Services > Configuration
  PLUGIN_NAME: 'PlayGamesSaves',                        // native bridge name (see SETUP_PLAY_GAMES.md)
  SNAPSHOT_NAME: 'quillpix-progress',
  KEYS: ['quillpix.save.v1', 'quillpix.meta.v1', 'quillpix.meta.v1.daily', 'quillpix.meta.v1.ach'] // progress + coins + purchases, meta, daily state, achievements
};
if (typeof module !== 'undefined') module.exports = window.CLOUD_CONFIG;
